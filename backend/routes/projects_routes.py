from flask import Blueprint, jsonify, request, send_file, after_this_request
from services.container import project_service, file_service, sse_manager
from services.FileService import ConsistencyRepairRequired
from utils.waveform import precompute_waveform
import os

projects_bp = Blueprint('projects', __name__)


def _start_project_repair(project_id, resolution, message):
    state = project_service.start_project_repair(
        project_id,
        reason="tracked_file_missing",
        missing_relative_path=resolution.relative_path,
        sse_manager=sse_manager,
    )
    return jsonify({
        "status": "consistency_checking",
        "consistency_checking": True,
        "project_id": project_id,
        "missing_file": resolution.relative_path or resolution.filename,
        "message": message,
        "repair_state": state["status"],
    }), 409

@projects_bp.route('/waveform/<project_id>/<stem_name>', methods=['GET'])
def get_waveform(project_id, stem_name):
    """
    Serve precomputed waveform peaks for a stem.
    Falls back to on-demand computation if the JSON doesn't exist yet
    (for projects processed before waveform precomputation was added).
    """
    project_path = project_service.get_project_path(project_id)
    if not project_path:
        return jsonify({'error': 'Project not found'}), 404

    stem_resolution = file_service.resolve_file(project_id, stem_name)
    if stem_resolution.status == "not_tracked":
        return jsonify({'error': 'Stem file not found'}), 404
    if stem_resolution.status == "tracked_missing":
        return _start_project_repair(
            project_id,
            stem_resolution,
            'A tracked project file is missing on disk. Consistency is being verified and this page will reload when ready.',
        )

    stem_base = os.path.splitext(stem_name)[0]
    waveform_path = os.path.join(project_path, 'waveforms', f"{stem_base}.json")
    waveform_resolution = file_service.resolve_file(project_id, os.path.join('waveforms', f"{stem_base}.json"))

    if waveform_resolution.status == "tracked_missing":
        try:
            precompute_waveform(stem_resolution.path, waveform_path)
        except Exception:
            return _start_project_repair(
                project_id,
                waveform_resolution,
                'A tracked waveform file is missing on disk. Consistency is being verified and this page will reload when ready.',
            )
    elif not os.path.exists(waveform_path):
        try:
            precompute_waveform(stem_resolution.path, waveform_path)
        except Exception as e:
            return jsonify({'error': f'Waveform computation failed: {e}'}), 500

    return send_file(waveform_path, mimetype='application/json')

@projects_bp.route('/history', methods=['GET'])
def list_history():
    return jsonify(project_service.get_sqlite_history()), 200

@projects_bp.route('/project/<project_id>/status', methods=['GET'])
def get_project_status(project_id):
    project_status = project_service.get_sqlite_project_status(project_id)
    if not project_status:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(project_status), 200


@projects_bp.route('/project/<project_id>', methods=['GET'])
def get_project(project_id):
    project_snapshot = project_service.get_sqlite_project_snapshot(project_id)
    if not project_snapshot:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(project_snapshot), 200

@projects_bp.route('/delete/<folder_id>', methods=['DELETE'])
def delete_session(folder_id):
    try:
        success = project_service.delete_project(folder_id)
        if success:
            return jsonify({'message': 'Session deleted successfully'}), 200
        else:
            return jsonify({'error': 'Session not found'}), 404
    except PermissionError:
        return jsonify({'error': 'Access denied'}), 403
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@projects_bp.route('/download/<folder_id>/<filename>', methods=['GET'])
def download_file(folder_id, filename):
    resolution = file_service.resolve_file(folder_id, filename)
    if resolution.status == "not_tracked":
        return jsonify({'error': 'File not found'}), 404
    if resolution.status == "tracked_missing":
        return _start_project_repair(
            folder_id,
            resolution,
            'A tracked project file is missing on disk. Consistency is being verified and this page will reload when ready.',
        )

    return send_file(resolution.path, as_attachment=False)

@projects_bp.route('/zip/<folder_id>', methods=['GET'])
def download_zip(folder_id):
    try:
        zip_path = file_service.create_zip(folder_id)

        @after_this_request
        def cleanup(response):
            file_service.cleanup_zip(zip_path)
            return response

        return send_file(zip_path, as_attachment=True)
    except ConsistencyRepairRequired as exc:
        resolution = file_service.resolve_file(exc.project_id, exc.relative_path)
        if resolution.status == "tracked_missing":
            return _start_project_repair(
                exc.project_id,
                resolution,
                'A tracked project file is missing on disk. Consistency is being verified and this page will reload when ready.',
            )
        return jsonify({'error': str(exc)}), 409
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@projects_bp.route('/zip-selected', methods=['POST'])
def download_zip_selected():
    data = request.json
    folder_id = data.get('id')
    track_names = data.get('tracks')
    if not folder_id or not track_names:
        return jsonify({'error': 'Missing data'}), 400

    try:
        zip_path = file_service.create_zip(folder_id, track_names)

        @after_this_request
        def cleanup(response):
            file_service.cleanup_zip(zip_path)
            return response

        return send_file(zip_path, as_attachment=True)
    except ConsistencyRepairRequired as exc:
        resolution = file_service.resolve_file(exc.project_id, exc.relative_path)
        if resolution.status == "tracked_missing":
            return _start_project_repair(
                exc.project_id,
                resolution,
                'A tracked project file is missing on disk. Consistency is being verified and this page will reload when ready.',
            )
        return jsonify({'error': str(exc)}), 409
    except Exception as e:
        return jsonify({'error': str(e)}), 500
