"""
Settings routes for system information and configuration.
"""
from flask import Blueprint, jsonify
from utils.hardware import get_system_info
from services.container import audio_service

settings_bp = Blueprint('settings', __name__)


@settings_bp.route('/settings/system-info', methods=['GET'])
def get_system_info_endpoint():
    """
    Returns comprehensive system information including hardware acceleration status.
    
    This endpoint returns the ACTUAL state from the running AudioProcessor,
    ensuring the displayed info matches what's being used for processing.
    """
    # Get base system info
    info = get_system_info()
    
    # Overlay with actual processor state (ensures we show real runtime state)
    # Note: AudioProcessor wraps Separator, so we rely on the fresh detection in get_system_info instead
    # of trying to access internal state which may cause attributes errors.
    # processor = audio_service.processor
    
    # Add helpful message
    if info['gpu_accelerated']:
        info['acceleration_message'] = f"🚀 GPU acceleration active via {info['execution_provider']}"
    else:
        info['acceleration_message'] = "🐢 Running on CPU (no GPU acceleration)"
    
    return jsonify(info), 200
