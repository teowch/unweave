import os
import sys
import shutil
import zipfile
import wave
import json
import uuid
import threading
from datetime import datetime
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import numpy as np
import soundfile as sf

import static_ffmpeg
static_ffmpeg.add_paths()

# Import audio processing modules
from modules import MODULE_REGISTRY, validate_modules
from AudioProject import AudioProject
from AudioProcessor import AudioProcessor

# Keep WORKFLOW_MAP alias for backward compatibility in this file
WORKFLOW_MAP = MODULE_REGISTRY

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
LIBRARY_FOLDER = os.path.join(PROJECT_ROOT, 'Library')

UPLOAD_FOLDER = os.path.abspath('uploads')
OUTPUT_FOLDER = LIBRARY_FOLDER 

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

TRACK_SESSIONS = {}
SESSION_HISTORY = []

def load_history_from_disk():
    """Scans OUTPUT_FOLDER (Library) and populates SESSION_HISTORY and TRACK_SESSIONS."""
    print(f"Scanning for existing history in {OUTPUT_FOLDER}...")
    if not os.path.exists(OUTPUT_FOLDER):
        return

    global SESSION_HISTORY
    SESSION_HISTORY = []
    
    found_folders = []
    for folder_name in os.listdir(OUTPUT_FOLDER):
        folder_path = os.path.join(OUTPUT_FOLDER, folder_name)
        if os.path.isdir(folder_path):
            try:
                metadata_path = os.path.join(folder_path, 'metadata.json')
                
                track_id = folder_name
                track_name = folder_name
                original_file = None
                track_date = folder_name
                
                if os.path.exists(metadata_path):
                    try:
                        with open(metadata_path, 'r') as f:
                            meta = json.load(f)
                            track_id = meta.get('id', folder_name)
                            track_name = meta.get('name', folder_name)
                            original_file = meta.get('original_file')
                            if 'date' in meta:
                                track_date = meta['date']
                    except Exception as e:
                        print(f"Error reading metadata for {folder_name}: {e}")
                
                stems_list = []
                
                all_audio = []
                for f in os.listdir(folder_path):
                    if f.endswith('.wav') or f.endswith('.mp3') or f.endswith('.flac'):
                        all_audio.append(f)
                
                for f in all_audio:
                    if original_file and f == original_file: continue
                    stems_list.append(f)
                
                stems_list = sorted(stems_list)
                
                track_data = {
                    'id': track_id,
                    'name': track_name,
                    'date': track_date,
                    'stems': stems_list,
                }
                if original_file:
                    track_data['original'] = original_file

                found_folders.append(track_data)
                
                TRACK_SESSIONS[track_id] = {
                    'path': folder_path,
                    'original': original_file
                }
                
            except Exception as e:
                print(f"Error loading {folder_name}: {e}")
                continue

    found_folders.sort(key=lambda x: x['id'], reverse=True)
    SESSION_HISTORY.extend(found_folders)
    print(f"Loaded {len(found_folders)} tracks from disk.")

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in {'wav', 'mp3', 'ogg', 'flac'}

def get_track_data(folder_id, name, timestamp, absolute_path):
    """
    Constructs the track object expected by the frontend.
    Scans the directory to find current stems.
    """
    stems = []
    original_file = None
    
    if os.path.exists(absolute_path):
        for f in os.listdir(absolute_path):
            if f.endswith('.wav') or f.endswith('.mp3'):
                stems.append({
                    'name': f,
                    'url': f'/api/download/{folder_id}/{f}'
                })
    
    # Sort stems
    stems.sort(key=lambda x: x['name'])
    
    return {
        'id': folder_id,
        'name': name,
        'date': timestamp,
        'stems': stems,
    }

def sort_stems(stems):
    return sorted(stems, key=lambda x: x['name'])

@app.route('/api/history', methods=['GET'])
def list_history():
    # Return the in-memory history list
    return jsonify(SESSION_HISTORY), 200

@app.route('/api/modules', methods=['GET'])
def get_modules():
    """
    Returns available processing modules with descriptions and hierarchy.
    """
    modules = []
    for module_id, config in WORKFLOW_MAP.items():
        modules.append({
            'id': module_id,
            'description': config.get('description', ''),
            'category': config.get('category', 'Uncategorized'),
            'depends_on': config.get('depends_on')
        })
    return jsonify({'modules': modules}), 200

def process_track_separation(folder_id, output_folder, filename, timestamp, modules_to_run):
    """
    Common logic for processing a track after the original file has been placed in the output_folder.
    """
    try:
        filename_no_ext = os.path.splitext(filename)[0]
        original_file_path = os.path.join(output_folder, filename)

        # Create or load project and run modules
        project = AudioProject.load_or_create(
            audio_file=original_file_path,
            project_id=folder_id,
            base_library=LIBRARY_FOLDER
        )
        
        processor = AudioProcessor()
        project.run_modules(modules_to_run, processor)
        
        # Save metadata.json
        metadata_path = os.path.join(output_folder, 'metadata.json')
        existing_metadata = {}
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r') as f:
                    existing_metadata = json.load(f)
            except:
                pass

        metadata = {
            'id': folder_id,
            'name': filename_no_ext,
            'original_file': filename,
            'date': timestamp
        }
        existing_metadata.update(metadata)
        
        with open(metadata_path, 'w') as f:
            json.dump(existing_metadata, f, indent=2)
        
        # Register in Session
        TRACK_SESSIONS[folder_id] = {
            'path': output_folder,
            'original': filename
        }
        
        # Scan for stems
        stems_list = []
        for f in os.listdir(output_folder):
            if f == filename: continue # valid original
            if f == 'metadata.json': continue
            if f.endswith('.wav') or f.endswith('.mp3') or f.endswith('.flac'):
                stems_list.append(f)
        
        stems_list = sorted(stems_list)
        
        track_data = {
            'id': folder_id,
            'name': filename_no_ext,
            'date': timestamp,
            'stems': stems_list,
            'original': filename
        }
        
        # Prepend to history
        SESSION_HISTORY.insert(0, track_data)
        
        return jsonify({
            'message': 'Separation successful',
            'id': folder_id,
            'stems': stems_list 
        }), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/process', methods=['POST'])
def process_audio():
    # Check for file in request
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    # Get modules from form data
    modules_json = request.form.get('modules')
    if not modules_json:
        return jsonify({'error': 'modules field is required'}), 400
    
    try:
        modules_to_run = json.loads(modules_json)
    except json.JSONDecodeError:
        return jsonify({'error': 'modules must be valid JSON array'}), 400
    
    if not isinstance(modules_to_run, list) or len(modules_to_run) == 0:
        return jsonify({'error': 'modules must be a non-empty array'}), 400
    
    # Validate module names
    invalid_modules = [m for m in modules_to_run if m not in WORKFLOW_MAP]
    if invalid_modules:
        return jsonify({'error': f'Invalid modules: {invalid_modules}. Valid modules: {list(WORKFLOW_MAP.keys())}'}), 400
        
    if file and allowed_file(file.filename):
        try:
            filename = secure_filename(file.filename)
            filename_no_ext = os.path.splitext(filename)[0]
            
            # Generate ID and Folder first
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            # We enforce a clean folder name: timestamp_sanitizedfilename
            folder_id = f"{timestamp}_{filename_no_ext}" 
            
            # Create persistent folder immediately
            output_folder = os.path.join(LIBRARY_FOLDER, folder_id)
            os.makedirs(output_folder, exist_ok=True)
            
            # Save original file DIRECTLY to the library folder
            original_file_path = os.path.join(output_folder, filename)
            file.save(original_file_path)
            
            return process_track_separation(folder_id, output_folder, filename, timestamp, modules_to_run)

        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
            
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/api/process-url', methods=['POST'])
def process_url():
    data = request.json
    url = data.get('url')
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    # Get and validate modules
    modules_to_run = data.get('modules')
    if not modules_to_run or not isinstance(modules_to_run, list) or len(modules_to_run) == 0:
        return jsonify({'error': 'modules field is required and must be a non-empty array'}), 400
    
    # Validate module names
    invalid_modules = [m for m in modules_to_run if m not in WORKFLOW_MAP]
    if invalid_modules:
        return jsonify({'error': f'Invalid modules: {invalid_modules}. Valid modules: {list(WORKFLOW_MAP.keys())}'}), 400
        
    try:
        # 1. Download (Reuse logic from app.py)
        import yt_dlp
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(UPLOAD_FOLDER, '%(title)s.%(ext)s'),
            'postprocessors': [{'key': 'FFmpegExtractAudio','preferredcodec': 'wav','preferredquality': '192'}],
            'prefer_ffmpeg': True,
            'keepvideo': False,
            'quiet': True
        }
        
        filename = None
        downloaded_filepath = None
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            temp_name = ydl.prepare_filename(info)
            base, _ = os.path.splitext(temp_name)
            
            downloaded_filepath = base + ".wav" 
            
            filename = os.path.basename(downloaded_filepath)

        if not os.path.exists(downloaded_filepath):
             return jsonify({'error': 'Download failed'}), 500

        # Create Persistent Folder
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        filename_no_ext = os.path.splitext(filename)[0]
        folder_id = f"{timestamp}_{filename_no_ext}"
        
        output_folder = os.path.join(LIBRARY_FOLDER, folder_id)
        os.makedirs(output_folder, exist_ok=True)
        
        # Move downloaded file to Library
        persistent_filepath = os.path.join(output_folder, filename)
        shutil.move(downloaded_filepath, persistent_filepath)

        return process_track_separation(folder_id, output_folder, filename, timestamp, modules_to_run)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/project/<project_id>/status', methods=['GET'])
def get_project_status(project_id):
    """
    Get project status including executed modules.
    """
    # Check if project exists
    project_folder = os.path.join(LIBRARY_FOLDER, project_id)
    if not os.path.exists(project_folder):
        return jsonify({'error': 'Project not found'}), 404
    
    try:
        project = AudioProject.load(project_id, base_library=LIBRARY_FOLDER)
        
        return jsonify({
            'id': project_id,
            'executed_modules': project.get_executed_modules(),
            'original_file': project.get_original_file()
        }), 200
        
    except FileNotFoundError:
        return jsonify({'error': 'Project not found'}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/project/<project_id>/run-modules', methods=['POST'])
def run_additional_modules(project_id):
    """
    Run additional modules on an existing project.
    Handles dependency resolution automatically.
    """
    data = request.json or {}
    modules_to_run = data.get('modules', [])
    
    # Validate request
    if not modules_to_run or not isinstance(modules_to_run, list):
        return jsonify({'error': 'modules must be a non-empty array'}), 400
    
    # Validate module names
    invalid_modules = validate_modules(modules_to_run)
    if invalid_modules:
        return jsonify({
            'error': f'Invalid modules: {invalid_modules}. Valid modules: {list(WORKFLOW_MAP.keys())}'
        }), 400
    
    # Check if project exists
    if project_id not in TRACK_SESSIONS:
        # Try to load from disk
        project_folder = os.path.join(LIBRARY_FOLDER, project_id)
        if not os.path.exists(project_folder):
            return jsonify({'error': 'Project not found'}), 404
    
    try:
        # Load project and run modules
        project = AudioProject.load(project_id, base_library=LIBRARY_FOLDER)
        processor = AudioProcessor()
        project.run_modules(modules_to_run, processor)
        
        # Get updated stems list
        session_folder = os.path.join(LIBRARY_FOLDER, project_id)
        stems_list = []
        for f in os.listdir(session_folder):
            if f == 'metadata.json':
                continue
            if f.endswith('.wav') or f.endswith('.mp3') or f.endswith('.flac'):
                # Skip original file if known
                session_data = TRACK_SESSIONS.get(project_id, {})
                if f != session_data.get('original'):
                    stems_list.append(f)
        
        stems_list = sorted(stems_list)
        
        # Update SESSION_HISTORY with new stems
        for track in SESSION_HISTORY:
            if track['id'] == project_id:
                track['stems'] = stems_list
                break
        
        return jsonify({
            'message': 'Modules processed successfully',
            'id': project_id,
            'executed_modules': project.get_executed_modules(),
            'stems': stems_list
        }), 200
        
    except FileNotFoundError:
        return jsonify({'error': 'Project not found'}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/<folder_id>/<filename>', methods=['GET'])
def download_file(folder_id, filename):
    if folder_id not in TRACK_SESSIONS:
        # Check if it exists on disk even if not in memory (e.g. after restart)
        # Should have been loaded by load_history_from_disk
        return jsonify({'error': 'Track session expired or not found'}), 404
    
    directory = TRACK_SESSIONS[folder_id]['path']
    return send_from_directory(directory, filename, as_attachment=False)

@app.route('/api/unify', methods=['POST'])
def unify_tracks():
    data = request.json
    folder_id = data.get('id')
    track_names = data.get('tracks')

    if not folder_id or not track_names:
        return jsonify({'error': 'Missing data'}), 400
        
    if folder_id not in TRACK_SESSIONS:
        return jsonify({'error': 'Session not found'}), 404
        
    directory = TRACK_SESSIONS[folder_id]['path']
    
    # --- UNIFY LOGIC (SoundFile) ---
    try:
        # Define output variables
        # Define output variables
        input_bases = []
        for name in track_names:
            # Remove extension
            base, _ = os.path.splitext(name)
            input_bases.append(base)
            
        combined_name = "+".join(input_bases)
        # Scan for existing unified tracks to avoid conflicts if same combo done twice?
        # Actually timestamp or just overwrite? Overwrite seems fine or append timestamp if needed.
        # But user asked for "sum of the tracks". 
        # let's add a short timestamp to ensure uniqueness just in case, or rely on logic.
        # If I do "Vocals+Drums.unified.wav", and I do it again, it overwrites. This is probably fine.
        new_stem_name = f"{combined_name}.unified.wav"
        output_path = os.path.join(directory, new_stem_name)
        
        # Prepare inputs
        inputs = [os.path.join(directory, name) for name in track_names]

        data_list = []
        sr = None
        
        # 1. Read all files (supports FLAC, WAV, etc.)
        for p in inputs:
            try:
                data, samplerate = sf.read(p)
                
                if sr is None: 
                    sr = samplerate
                elif sr != samplerate: 
                    return jsonify({'error': f'Sample rate mismatch: {os.path.basename(p)} is {samplerate}, expected {sr}'}), 400
                
                # Normalize shapes: ensure (N, channels)
                if data.ndim == 1:
                    data = data[:, np.newaxis]
                    
                data_list.append(data)
            except Exception as e:
                return jsonify({'error': f"Failed to read {os.path.basename(p)}: {str(e)}"}), 400

        if not data_list: 
             return jsonify({'error': 'No audio data read'}), 500

        # 2. Mix
        # Determine max length and max channels
        max_len = max(len(d) for d in data_list)
        max_ch = max(d.shape[1] for d in data_list)
        
        # Initialize accumulator
        mixed = np.zeros((max_len, max_ch), dtype=np.float32)
        
        for d in data_list:
            length, channels = d.shape
            
            # Expand channels if mono->stereo
            if channels == 1 and max_ch > 1:
                d = np.tile(d, (1, max_ch))
            elif channels != max_ch:
                return jsonify({'error': 'Channel mismatch (non-mono)'}), 400
            
            # Add to mix
            mixed[:length, :] += d

        # 3. Clip to avoid distortion (Soft clip or Hard clip?)
        # Simple hard clip to starts with
        mixed = np.clip(mixed, -1.0, 1.0)
        
        # 4. Write output (WAV or FLAC based on extension, typically .wav here)
        sf.write(output_path, mixed, sr)

        # Update History Item stems list
        for item in SESSION_HISTORY:
            if item['id'] == folder_id:
                exists = False
                for s in item['stems']:
                    if s == new_stem_name: exists = True
                if not exists:
                    item['stems'].append(new_stem_name)
                    item['stems'] = sorted(item['stems'])
                break

        return jsonify({'message': 'Unify successful', 'new_track': new_stem_name}), 200

    except Exception as e:
        if os.path.exists(output_path):
             try: os.remove(output_path)
             except: pass
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/zip/<folder_id>', methods=['GET'])
def download_zip(folder_id):
    if folder_id not in TRACK_SESSIONS:
        return jsonify({'error': 'Session not found'}), 404
    
    directory = TRACK_SESSIONS[folder_id]['path']
    zip_filename = f"{folder_id}.zip"
    zip_path = os.path.join(UPLOAD_FOLDER, zip_filename)
    
    try:
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for root, dirs, files in os.walk(directory):
                for file in files:
                    zipf.write(os.path.join(root, file), file)
        return send_file(zip_path, as_attachment=True), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/zip-selected', methods=['POST'])
def download_zip_selected():
    data = request.json
    folder_id = data.get('id')
    track_names = data.get('tracks')
    
    if not folder_id or not track_names: return jsonify({'error': 'Missing data'}), 400
    if folder_id not in TRACK_SESSIONS: return jsonify({'error': 'Session not found'}), 404
    
    directory = TRACK_SESSIONS[folder_id]['path']
    zip_filename = f"{folder_id}_selected.zip"
    zip_path = os.path.join(UPLOAD_FOLDER, zip_filename)
    
    try:
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for name in track_names:
                p = os.path.join(directory, name)
                if os.path.exists(p):
                    zipf.write(p, name)
        return send_file(zip_path, as_attachment=True), 200
    except Exception as e:
         return jsonify({'error': str(e)}), 500

@app.route('/api/delete/<folder_id>', methods=['DELETE'])
def delete_session(folder_id):
    if folder_id not in TRACK_SESSIONS:
        return jsonify({'error': 'Session not found'}), 404
    
    directory = TRACK_SESSIONS[folder_id]['path']
    
    # Security: Ensure the path is within LIBRARY_FOLDER
    try:
        resolved_directory = os.path.realpath(directory)
        resolved_library = os.path.realpath(LIBRARY_FOLDER)
        
        if not resolved_directory.startswith(resolved_library):
            return jsonify({'error': 'Access denied: path outside library folder'}), 403
    except Exception as e:
        return jsonify({'error': 'Invalid path'}), 400
    
    try:
        shutil.rmtree(directory)
        del TRACK_SESSIONS[folder_id]
        
        # Remove from SESSION_HISTORY
        SESSION_HISTORY[:] = [track for track in SESSION_HISTORY if track['id'] != folder_id]
        
        return jsonify({'message': 'Session deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500



if __name__ == '__main__':
    load_history_from_disk()
    port = 5000
    print(f"Starting API on port {port}...")
    app.run(debug=True, port=port)
