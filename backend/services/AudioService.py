from .log_interceptor import intercept
from .SSEMessageHandler import SSEMessageHandler
import os
import json
import logging
import numpy as np
import yt_dlp
import soundfile as sf
from datetime import datetime
from typing import List, Dict, Any, Optional

from utils.waveform import precompute_waveform

from AudioProcessor import AudioProcessor
from AudioProject import AudioProject
from modules import MODULE_REGISTRY

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class AudioService:
    def __init__(self, project_service, file_service):
        self.project_service = project_service
        self.file_service = file_service
        self.processor = AudioProcessor()

    def process_separation(self, project_id: str, filename: str, modules_to_run: List[str], sse_message_handler: SSEMessageHandler, thumbnail: Optional[str] = None, display_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Runs the separation process for a project.
        """
        output_folder = self.project_service.get_project_path(project_id)
        if not output_folder:
             raise FileNotFoundError(f"Project folder for {project_id} not found")

        original_file_path = os.path.join(output_folder, filename)
        filename_no_ext = os.path.splitext(filename)[0]
        
        # Load/Create Project Wrapper
        project = AudioProject.load_or_create(
            audio_file=original_file_path,
            project_id=project_id,
            base_library=self.project_service.library_folder
        )

        # Run Modules
        project.run_modules(modules_to_run, self.processor, sse_message_handler)

        # Set display metadata on the project (single source of truth)
        timestamp = project_id.split('_')[0] if '_' in project_id else datetime.now().strftime("%Y%m%d%H%M%S")
        track_display_name = display_name if display_name else filename_no_ext
        project.set_display_metadata(track_display_name, filename, timestamp, thumbnail)

        # Scan for results
        stems_list = []
        for f in os.listdir(output_folder):
            if f == filename: continue
            if f == 'metadata.json': continue
            if f.endswith(('.wav', '.mp3', '.flac')):
                stems_list.append(f)
        stems_list = sorted(stems_list)

        # Update Project Service State
        self.project_service.register_project(project_id, output_folder, filename, timestamp, stems_list)

        return {
            'message': 'Separation successful',
            'id': project_id,
            'stems': stems_list,
            'executed_modules': project.get_executed_modules(),
            'thumbnail': project.state.get('thumbnail')
        }
    
    def download_url(self, url, sse_message_handler: SSEMessageHandler):
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join('uploads', '%(title)s.%(ext)s'),
            'postprocessors': [{'key': 'FFmpegExtractAudio','preferredcodec': 'wav','preferredquality': '192'}],
            'prefer_ffmpeg': True,
            'keepvideo': False,
            'quiet': True,
            'no_warnings': True,
            'noprogress': True,
            'no_color': True,
            'noplaylist': True,
            'progress_hooks': [sse_message_handler.download_callback],
            'writethumbnail': True, 
        }
        
        filename = None
        downloaded_filepath = None
        thumbnail = None
        title = None  # Original video title for display
        
        sse_message_handler.set_module('download')
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=True)
                temp_name = ydl.prepare_filename(info)
                base, _ = os.path.splitext(temp_name)
                downloaded_filepath = base + ".wav" 
                filename = os.path.basename(downloaded_filepath)
                thumbnail = info.get('thumbnail')
                title = info.get('title')  # Original video title
            except Exception as e:
                sse_message_handler.send_error(f"Failed to download URL: {e}")
                raise Exception(f"Failed to download URL: {e}")
            

        if not os.path.exists(downloaded_filepath):
             raise Exception("Download failed")

        return downloaded_filepath, filename, thumbnail, title


    def unify_tracks(self, project_id: str, track_names: List[str]) -> str:
        """
        Mixes multiple tracks into one. Returns the new filename.
        """
        directory = self.project_service.get_project_path(project_id)
        if not directory:
            raise FileNotFoundError("Project not found")

        input_bases = [os.path.splitext(name)[0] for name in track_names]
        combined_name = "+".join(input_bases)
        new_stem_name = f"{combined_name}.unified.wav"
        output_path = os.path.join(directory, new_stem_name)
        
        inputs = [os.path.join(directory, name) for name in track_names]
        
        data_list = []
        sr = None
        
        # Read
        for p in inputs:
            data, samplerate = sf.read(p)
            if sr is None: sr = samplerate
            elif sr != samplerate:
                raise ValueError(f"Sample rate mismatch: {os.path.basename(p)} is {samplerate}, expected {sr}")
            
            if data.ndim == 1:
                data = data[:, np.newaxis]
            data_list.append(data)
            
        if not data_list:
            raise ValueError("No audio data read")
            
        # Mix
        max_len = max(len(d) for d in data_list)
        max_ch = max(d.shape[1] for d in data_list)
        
        mixed = np.zeros((max_len, max_ch), dtype=np.float32)
        
        for d in data_list:
            length, channels = d.shape
            if channels == 1 and max_ch > 1:
                d = np.tile(d, (1, max_ch))
            elif channels != max_ch:
                raise ValueError("Channel mismatch (non-mono)")
            mixed[:length, :] += d
            
        # Clip
        mixed = np.clip(mixed, -1.0, 1.0)
        
        # Write
        sf.write(output_path, mixed, sr)
        
        # Precompute waveform for the newly unified stem
        waveform_dir = os.path.join(directory, 'waveforms')
        waveform_json = os.path.join(waveform_dir, f"{combined_name}.unified.json")
        try:
            precompute_waveform(output_path, waveform_json)
        except Exception as e:
            logger.warning(f"Waveform precompute failed for unified stem: {e}")
        
        # Update Project Service
        # We need to refresh the stems list in ProjectService
        current_meta = self.project_service.get_project_metadata(project_id)
        if current_meta:
             stems = current_meta.get('stems', [])
             if new_stem_name not in stems:
                 stems.append(new_stem_name)
                 stems.sort()
                 # Re-register to update in-memory cache
                 self.project_service.register_project(
                     project_id, 
                     directory, 
                     current_meta.get('original'), 
                     current_meta.get('date'), 
                     stems
                 )

        return new_stem_name
