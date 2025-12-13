import sys
import os
import subprocess
import time
import shutil
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import zipfile
import wave
import soundfile as sf
import numpy as np
import json

import static_ffmpeg
static_ffmpeg.add_paths() # Isso adiciona o ffmpeg temporário ao PATH

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'output'
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'ogg', 'flac'}

app.config['UPLOAD_FOLDER'] = os.path.abspath(UPLOAD_FOLDER)
app.config['OUTPUT_FOLDER'] = os.path.abspath(OUTPUT_FOLDER)

# Ensure directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def is_silent(filepath, threshold=0.01):
    """Check if a generated audio file is effectively silent using RMS."""
    try:
        data, samplerate = sf.read(filepath)
        
        # Calculate RMS (Root Mean Square) amplitude
        # We square the data, take the mean, and then the square root
        rms = np.sqrt(np.mean(data**2))
        
        # Check against threshold
        is_quiet = rms < threshold
        
        print(f"[Silence Check] {os.path.basename(filepath)}: RMS={rms:.4f}, Threshold={threshold}, Silent={is_quiet}")
        return is_quiet
    except Exception as e:
        print(f"Error checking silence for {filepath}: {e}")
        return False

def get_track_history():
    history = []
    if os.path.exists(app.config['OUTPUT_FOLDER']):
        for folder_name in os.listdir(app.config['OUTPUT_FOLDER']):
            folder_path = os.path.join(app.config['OUTPUT_FOLDER'], folder_name)
            if os.path.isdir(folder_path):
                # Expecting format: YYYYMMDD_HHMMSS_Name
                try:
                    parts = folder_name.split('_', 2)
                    timestamp_str = f"{parts[0]}_{parts[1]}"
                    original_name = parts[2] if len(parts) > 2 else folder_name
                    
                    # Find stems inside
                    original_file = None
                    metadata_path = os.path.join(folder_path, 'metadata.json')
                    if os.path.exists(metadata_path):
                        try:
                            with open(metadata_path, 'r') as f:
                                meta = json.load(f)
                                original_file = meta.get('original_file')
                        except:
                            pass

                    # Demucs output structure varies. 
                    # If we moved files to the root of ID folder:
                    stem_files = []
                    for f in os.listdir(folder_path):
                         # Skip metadata and original file
                         if f == 'metadata.json': continue
                         if original_file and f == original_file: continue
                         
                         if f.endswith('.wav') or f.endswith('.mp3'):
                             full_path = os.path.join(folder_path, f)
                             stem_files.append((f, os.path.getmtime(full_path)))
                    
                    # Sort by modification time descending (newest first)
                    stem_files.sort(key=lambda x: x[1], reverse=True)
                    stems = [x[0] for x in stem_files]
                    
                    track_data = {
                        'id': folder_name,
                        'name': original_name,
                        'date': timestamp_str,
                        'stems': stems
                    }
                    if original_file:
                        track_data['original'] = original_file
                    
                    history.append(track_data)
                except:
                    continue
    # Sort by date desc
    history.sort(key=lambda x: x['id'], reverse=True)
    return history

@app.route('/api/history', methods=['GET'])
def list_history():
    return jsonify(get_track_history())

@app.route('/api/separate', methods=['POST'])
def separate_audio():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Ensure upload dir exists at runtime (defensive)
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        temp_filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(temp_filepath)
        
        # Create Unique Output Folder
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename_no_ext = os.path.splitext(filename)[0]
        # Folder ID: 20231209_230000_SongName
        folder_id = f"{timestamp}_{filename_no_ext}"
        final_output_dir = os.path.join(app.config['OUTPUT_FOLDER'], folder_id)
        
        try:
            # Run Demucs
            model_name = 'htdemucs_6s'
            # We output to a temp demucs folder first, then move
            demucs_out = os.path.join(app.config['OUTPUT_FOLDER'], 'temp_demucs')
            
            subprocess.run([sys.executable, '-m', 'demucs', '-n', model_name, '--out', demucs_out, temp_filepath], check=True)
            
            # Demucs structure: demucs_out/model_name/filename_no_ext/stems
            source_dir = os.path.join(demucs_out, model_name, filename_no_ext)
            
            # Move to persistent ID folder, but filter silent tracks first
            os.makedirs(final_output_dir, exist_ok=True)
            
            if os.path.exists(source_dir):
                for stem in os.listdir(source_dir):
                    stem_path = os.path.join(source_dir, stem)
                    if not is_silent(stem_path):
                        shutil.move(stem_path, os.path.join(final_output_dir, stem))
            
            # Cleanup
            shutil.rmtree(demucs_out) # Clean temp demucs out
            
            # Save original file to final dir
            final_original_path = os.path.join(final_output_dir, filename)
            shutil.copy(temp_filepath, final_original_path)
            
            # Write metadata
            with open(os.path.join(final_output_dir, 'metadata.json'), 'w') as f:
                json.dump({'original_file': filename}, f)

            try:
                os.remove(temp_filepath) # Clean upload
            except:
                pass

            # Construct response
            stems = []
            for stem_file in os.listdir(final_output_dir):
                 if stem_file == filename or stem_file == 'metadata.json': continue
                 if stem_file.endswith('.wav'):
                     stems.append({
                         'name': stem_file,
                         'url': f'/api/download/{folder_id}/{stem_file}'
                     })
            
            return jsonify({
                'message': 'Separation successful',
                'id': folder_id,
                'stems': stems
            })
            
        except subprocess.CalledProcessError:
            return jsonify({'error': 'Demucs processing failed'}), 500
        except Exception as e:
            return jsonify({'error': str(e)}), 500
            
    return jsonify({'error': 'Invalid file type'}), 400

def download_audio_from_url(url, output_folder):
    import yt_dlp
    
    # Create distinct filename based on video title
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(output_folder, '%(title)s.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        # Fallback if ffmpeg is missing (it might fail extraction but might download raw)
        'prefer_ffmpeg': True,
        'keepvideo': False,
        'quiet': True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            # handle extension change by postprocessor (mp3)
            base, _ = os.path.splitext(filename)
            final_path = base + ".mp3"
            
            # Defensive check if file exists, sometimes yt-dlp naming varies
            if not os.path.exists(final_path):
                 # Try matching what we expect
                 return filename # Return original if conversion failed or didn't happen
                 
            return final_path
    except Exception as e:
        raise Exception(f"Youtube Download failed: {str(e)}")

@app.route('/api/separate-url', methods=['POST'])
def separate_url():
    data = request.json
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
        
    try:
        # Download
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        downloaded_filepath = download_audio_from_url(url, app.config['UPLOAD_FOLDER'])
        
        filename = os.path.basename(downloaded_filepath)
        
        # --- RESUSE SEPARATION LOGIC ---
        # Ideal: refactor separation logic into a function.
        # For now, inline or copying logic to ensure identical behavior.
        
        # Create Unique Output Folder
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename_no_ext = os.path.splitext(filename)[0]
        # Sanitize filename for folder creation
        safe_name = secure_filename(filename_no_ext) 
        folder_id = f"{timestamp}_{safe_name}"
        final_output_dir = os.path.join(app.config['OUTPUT_FOLDER'], folder_id)
        
        # Run Demucs
        model_name = 'htdemucs_6s'
        demucs_out = os.path.join(app.config['OUTPUT_FOLDER'], 'temp_demucs')
        
        # demucs command needs python context
        subprocess.run([sys.executable, '-m', 'demucs', '-n', model_name, '--out', demucs_out, downloaded_filepath], check=True)
        
        # Demucs output path might use the safe name or full name depending on how it parses args.
        # Usually it uses the basename of input file.
        source_dir = os.path.join(demucs_out, model_name, filename_no_ext)
        
        # Fallback if demucs sanitized the name differently
        if not os.path.exists(source_dir):
            # Try to find the directory created (there should be only one in this temp scope ideally, 
            # but we share 'temp_demucs'. Better to look for expected name possibilities)
             # If filename has spaces, demucs might keep them.
             pass

        os.makedirs(final_output_dir, exist_ok=True)
        
        if os.path.exists(source_dir):
            for stem in os.listdir(source_dir):
                stem_path = os.path.join(source_dir, stem)
                if not is_silent(stem_path):
                    shutil.move(stem_path, os.path.join(final_output_dir, stem))
        
        # Cleanup
        try:
           shutil.rmtree(demucs_out) 
           
           # Move/Copy downloaded file to final dir as 'original'
           # downloaded_filepath is full path to filename in uploads
           final_original_path = os.path.join(final_output_dir, filename)
           shutil.move(downloaded_filepath, final_original_path)
           
           # Write metadata
           with open(os.path.join(final_output_dir, 'metadata.json'), 'w') as f:
               json.dump({'original_file': filename}, f)

        except:
            pass

        # Construct response
        stems = []
        for stem_file in os.listdir(final_output_dir):
             if stem_file == filename or stem_file == 'metadata.json': continue
             if stem_file.endswith('.wav') or stem_file.endswith('.mp3'):
                 stems.append({
                     'name': stem_file,
                     'url': f'/api/download/{folder_id}/{stem_file}'
                 })
        
        return jsonify({
            'message': 'Separation successful',
            'id': folder_id,
            'stems': stems
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/<folder_id>/<filename>', methods=['GET'])
def download_file(folder_id, filename):
    try:
        directory = os.path.join(app.config['OUTPUT_FOLDER'], folder_id)
        return send_from_directory(directory, filename, as_attachment=True)
    except Exception as e:
        return jsonify({'error': str(e)}), 404

@app.route('/api/zip/<folder_id>', methods=['GET'])
def download_zip(folder_id):
    try:
        directory = os.path.join(app.config['OUTPUT_FOLDER'], folder_id)
        if not os.path.exists(directory):
            return jsonify({'error': 'Track not found'}), 404
            
        zip_filename = f"{folder_id}.zip"
        zip_path = os.path.join(app.config['UPLOAD_FOLDER'], zip_filename) # Use uploads as temp for zip
        
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for root, dirs, files in os.walk(directory):
                for file in files:
                    zipf.write(os.path.join(root, file), file)
                    
        return send_file(zip_path, as_attachment=True)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/zip-selected', methods=['POST'])
def download_zip_selected():
    try:
        data = request.json
        folder_id = data.get('id')
        track_names = data.get('tracks') # List of filenames

        if not folder_id or not track_names:
            return jsonify({'error': 'Missing data'}), 400

        directory = os.path.join(app.config['OUTPUT_FOLDER'], folder_id)
        if not os.path.exists(directory):
            return jsonify({'error': 'Track not found'}), 404
            
        zip_filename = f"{folder_id}_selected.zip"
        zip_path = os.path.join(app.config['UPLOAD_FOLDER'], zip_filename)
        
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for name in track_names:
                file_path = os.path.join(directory, name)
                if os.path.exists(file_path):
                    zipf.write(file_path, name)
                    
        return send_file(zip_path, as_attachment=True)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/unify', methods=['POST'])
def unify_tracks():
    data = request.json
    folder_id = data.get('id')
    track_names = data.get('tracks') # List of filenames

    if not folder_id or not track_names:
        return jsonify({'error': 'Missing data'}), 400
        
    directory = os.path.join(app.config['OUTPUT_FOLDER'], folder_id)
    if not os.path.exists(directory):
        return jsonify({'error': 'Track folder not found'}), 404

    # Validate inputs
    inputs = []
    stems_for_name = []
    
    # Sort track names to ensure consistent generated name
    sorted_tracks = sorted(track_names)
    
    for name in sorted_tracks:
        path = os.path.join(directory, name)
        if os.path.exists(path):
            inputs.append(path)
            # Remove extension
            stem_name = os.path.splitext(name)[0]
            stems_for_name.append(stem_name)
    
    if not inputs:
        return jsonify({'error': 'No valid tracks selected'}), 400

    # Create new join name
    new_stem_name = "_".join(stems_for_name) + ".unified.wav"
    output_path = os.path.join(directory, new_stem_name)
    
    # Check if exists
    if os.path.exists(output_path):
        return jsonify({'error': 'Unification already created with this name'}), 400
        
    handles = []
    try:
        # Open all input files
        for p in inputs:
            try:
                h = wave.open(p, 'rb')
                handles.append(h)
            except wave.Error:
                return jsonify({'error': f"Failed to open {os.path.basename(p)} with wave library. Check if file is valid WAV (int16/uint8)."}), 400

        if not handles:
             return jsonify({'error': 'No tracks could be opened'}), 500

        # Validate consistent params (framerate, sampwidth)
        # Determine output channels (max of inputs)
        params0 = handles[0].getparams()
        framerate = params0.framerate
        sampwidth = params0.sampwidth
        max_channels = 0
        max_frames = 0
        
        for h in handles:
            if h.getframerate() != framerate:
                return jsonify({'error': 'Tracks have different sample rates'}), 400
            if h.getsampwidth() != sampwidth:
                return jsonify({'error': 'Tracks have different bit depths'}), 400
            
            if h.getnchannels() > max_channels:
                max_channels = h.getnchannels()
            if h.getnframes() > max_frames:
                max_frames = h.getnframes()
        
        # Only support mixing 1->N or N->N
        # If we have 2-channel output, we can mix 1-channel inputs.
        # But we cannot easily mix 2-channel into 1-channel without downmixing logic which we skip for now.
        for h in handles:
            c = h.getnchannels()
            if c != max_channels and not (c == 1 and max_channels > 1):
                 return jsonify({'error': f"Unsupported channel mixing: {c} ch into {max_channels} ch"}), 400
        
        # Determine numpy dtype
        if sampwidth == 2:
            dtype = np.int16
            min_val, max_val = -32768, 32767
            bias = 0
        elif sampwidth == 1:
            dtype = np.uint8
            min_val, max_val = 0, 255
            bias = 128 # 8-bit wav is unsigned, center 128
        else:
            return jsonify({'error': f"Unsupported sample width: {sampwidth} bytes (only 8-bit or 16-bit PCM supported)"}), 400

        # Prepare output
        with wave.open(output_path, 'wb') as out_wav:
            out_wav.setnchannels(max_channels)
            out_wav.setsampwidth(sampwidth)
            out_wav.setframerate(framerate)
            # out_wav.setnframes(max_frames) # updated automatically on write
            
            chunk_size = 65536 # Frames per chunk
            total_processed = 0
            
            while total_processed < max_frames:
                # How many frames to read this iteration
                current_batch_size = min(chunk_size, max_frames - total_processed)
                
                # Accumulator: int32 to avoid overflow during sum
                acc_len = current_batch_size * max_channels
                accumulator = np.zeros(acc_len, dtype=np.int32)
                
                for h in handles:
                    # Read frames
                    raw_bytes = h.readframes(current_batch_size)
                    if not raw_bytes:
                        continue
                    
                    # Convert to numpy
                    # Note: len(raw_bytes) might be less than expected if EOF reached early
                    # but we calculated max_frames based on longest, so only short files end early
                    read_count = len(raw_bytes) // sampwidth // h.getnchannels()
                    
                    arr = np.frombuffer(raw_bytes, dtype=dtype)
                    
                    # Handle bias (convert to signed int32 relative to 0)
                    if sampwidth == 1:
                        arr = arr.astype(np.int32) - bias
                    else:
                        arr = arr.astype(np.int32)

                    # Handle Mono -> Stereo mixing if needed
                    if h.getnchannels() == 1 and max_channels > 1:
                        # arr is (N,) - expand to (2N,) interleaved
                        # np.repeat([1, 2], 2) -> [1, 1, 2, 2]
                        arr = np.repeat(arr, max_channels)
                    
                    # Add to accumulator
                    # Check length match
                    l = len(arr)
                    if l > len(accumulator):
                        l = len(accumulator) # Should not happen if logic is correct
                    accumulator[:l] += arr[:l]
                
                # Apply bias and clip
                if sampwidth == 1:
                    accumulator = accumulator + bias
                    
                accumulator = np.clip(accumulator, min_val, max_val)
                
                # Convert back to bytes
                if sampwidth == 1:
                    out_bytes = accumulator.astype(np.uint8).tobytes()
                else:
                    out_bytes = accumulator.astype(np.int16).tobytes()
                
                out_wav.writeframes(out_bytes)
                total_processed += current_batch_size

        return jsonify({'message': 'Unify successful', 'new_track': new_stem_name})

    except Exception as e:
        # Cleanup if failed
        if os.path.exists(output_path):
            try: os.remove(output_path)
            except: pass
        return jsonify({'error': str(e)}), 500
    finally:
        for h in handles:
            try: h.close()
            except: pass

if __name__ == '__main__':
    app.run(debug=True, port=5000)
