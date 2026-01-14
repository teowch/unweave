from flask import Blueprint, jsonify, request
from services.container import audio_service, project_service, file_service, sse_manager
from services.SSEMessageHandler import SSEMessageHandler
from modules import MODULE_REGISTRY, validate_modules
from services.SSEManager import useSSEManager
import json
from werkzeug.utils import secure_filename
import os
from datetime import datetime
from utils.sanitize import get_ascii_prefix, sanitize_filename

audio_bp = Blueprint('audio', __name__)

# Re-expose MODULE_REGISTRY map as alias WORKFLOW_MAP for compatibility if needed
WORKFLOW_MAP = MODULE_REGISTRY

@audio_bp.route('/modules', methods=['GET'])
def get_modules():
    modules = []
    for module_id, config in MODULE_REGISTRY.items():
        modules.append({
            'id': module_id,
            'description': config.get('description', ''),
            'category': config.get('category', 'Uncategorized'),
            'depends_on': config.get('depends_on')
        })
    return jsonify({'modules': modules}), 200

@audio_bp.route('/process', methods=['POST'])
def process_audio():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    modules_json = request.form.get('modules')
    if not modules_json:
        return jsonify({'error': 'modules field is required'}), 400
    
    temp_project_id = request.form.get('temp_project_id')
    if not temp_project_id:
        return jsonify({'error': 'temp_project_id field is required'}), 400
        
    try:
        modules_to_run = json.loads(modules_json)
    except:
        return jsonify({'error': 'modules must be valid JSON'}), 400
        
    invalid = validate_modules(modules_to_run)
    if invalid:
        return jsonify({'error': f'Invalid modules: {invalid}'}), 400
    
    with useSSEManager(sse_manager, temp_project_id) as (_sse_manager, state):
        sse_message_handler = SSEMessageHandler(temp_project_id, _sse_manager)

        filename = sanitize_filename(secure_filename(file.filename))
        filename_no_ext = os.path.splitext(filename)[0]
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        project_id = f"{timestamp}_{get_ascii_prefix(filename_no_ext)}" 
        
        output_folder = project_service.create_project_folder(project_id)
        original_path = os.path.join(output_folder, filename)
        file.save(original_path)
        
        # Update project ID and notify frontend
        state["job_id"] = project_id
        sse_message_handler.set_project_id(project_id)
        
        try:
            result = audio_service.process_separation(project_id, filename, modules_to_run, sse_message_handler)
            return jsonify(result), 200
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

@audio_bp.route('/process-url', methods=['POST'])
def process_url():
    data = request.json
    url = data.get('url')
    modules_to_run = data.get('modules', [])
    temp_project_id = data.get('temp_project_id')
    
    if not url: return jsonify({'error': 'No URL provided'}), 400
    if not modules_to_run: return jsonify({'error': 'modules required'}), 400
    if not temp_project_id: return jsonify({'error': 'temp_project_id required'}), 400
    
    # Validations...
    
    try:
        with useSSEManager(sse_manager, temp_project_id) as (_sse_manager, state):

            sse_message_handler = SSEMessageHandler(temp_project_id, _sse_manager)

            downloaded_filepath, original_filename = audio_service.download_url(url, sse_message_handler)
            
            # Sanitize filename from URL download
            filename = sanitize_filename(original_filename)
            if filename != original_filename:
                # Rename the downloaded file to the sanitized name
                new_downloaded_filepath = os.path.join(os.path.dirname(downloaded_filepath), filename)
                os.rename(downloaded_filepath, new_downloaded_filepath)
                downloaded_filepath = new_downloaded_filepath

            # Create Project
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            filename_no_ext = os.path.splitext(filename)[0]
            project_id = f"{timestamp}_{get_ascii_prefix(filename_no_ext)}"
            state["job_id"] = project_id
            sse_message_handler.set_project_id(project_id)
            
            output_folder = project_service.create_project_folder(project_id)
            persistent_filepath = os.path.join(output_folder, filename)
            
            import shutil
            shutil.move(downloaded_filepath, persistent_filepath)
            
            result = audio_service.process_separation(project_id, filename, modules_to_run, sse_message_handler)
            return jsonify(result), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@audio_bp.route('/project/<project_id>/run-modules', methods=['POST'])
def run_additional_modules(project_id):
    data = request.json
    modules_to_run = data.get('modules', [])
    
    project_path = project_service.get_project_path(project_id)
    if not project_path:
        return jsonify({'error': 'Project not found'}), 404
        
    project_metadata = project_service.get_project_metadata(project_id)
    if not project_metadata:
         # Try to recover if disk exists but memory doesn't? ProjectService should handle?
         # ProjectService.get_project_metadata relies on memory scan.
         pass
         
    # We need the filename.
    # If project_metadata is missing (e.g. freshly started and history not synced yet?), use ProjectService to find it?
    # Actually ProjectService loads history on init.
    
    filename = project_metadata.get('original') if project_metadata else None
    
    # If we can't find filename in metadata, we might need to look at folder.
    # But let's assume metadata is correct.
    if not filename:
         return jsonify({'error': 'Original file unknown'}), 500
         
    try:
        with useSSEManager(sse_manager, project_id) as (_sse_manager, state):
            sse_message_handler = SSEMessageHandler(project_id, _sse_manager)
            result = audio_service.process_separation(project_id, filename, modules_to_run, sse_message_handler)
            # Note: process_separation does "load_or_create" AudioProject, runs modules, and updates metadata.
            # It effectively handles "run additional" too because AudioProject skips completed modules.
            return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@audio_bp.route('/unify', methods=['POST'])
def unify_tracks():
    data = request.json
    project_id = data.get('id')
    track_names = data.get('tracks')
    
    try:
        new_track = audio_service.unify_tracks(project_id, track_names)
        return jsonify({'message': 'Unify successful', 'new_track': new_track}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
