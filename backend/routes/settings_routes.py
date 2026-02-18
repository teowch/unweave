"""
Settings routes for system information and configuration.
"""
import os
import logging
from flask import Blueprint, jsonify, request
from utils.hardware import get_system_info, detect_gpu_hardware
from services.container import audio_service

logger = logging.getLogger(__name__)

settings_bp = Blueprint('settings', __name__)

# ── GPU setup state (in-memory, survives until process restart) ──
_gpu_setup_state = {
    'status': 'unknown',    # 'unknown', 'detecting', 'installing', 'complete', 'error'
    'step': None,           # Current step description
    'progress': 0,          # 0-100
    'gpu_info': None,       # Result from detect_gpu_hardware()
    'error': None,
}


@settings_bp.route('/settings/system-info', methods=['GET'])
def get_system_info_endpoint():
    """
    Returns comprehensive system information including hardware acceleration status.
    
    This endpoint returns the ACTUAL state from the running AudioProcessor,
    ensuring the displayed info matches what's being used for processing.
    """
    # Get base system info
    info = get_system_info()
    
    # Add helpful message
    if info['gpu_accelerated']:
        info['acceleration_message'] = f"🚀 GPU acceleration active via {info['execution_provider']}"
    else:
        info['acceleration_message'] = "🐢 Running on CPU (no GPU acceleration)"
    
    return jsonify(info), 200


@settings_bp.route('/gpu/setup-status', methods=['GET'])
def gpu_setup_status():
    """
    Returns the current GPU setup state.
    Polled by the first-launch setup UI and Settings page.
    """
    return jsonify(_gpu_setup_state), 200


@settings_bp.route('/gpu/re-setup', methods=['POST'])
def gpu_re_setup():
    """
    Re-detect GPU hardware and report what runtime is appropriate.
    Called from the Settings page 'Re-detect GPU' button.
    
    This endpoint:
      1. Runs GPU detection (nvidia-smi, rocminfo, etc.)
      2. Compares with the currently installed runtime
      3. Returns the detection result + whether a change is needed
    
    Note: The actual pip install of GPU packages is handled by the
    Electron main process (first-run-setup.js) which can show progress UI.
    This endpoint just does the detection part.
    """
    global _gpu_setup_state
    
    _gpu_setup_state['status'] = 'detecting'
    _gpu_setup_state['step'] = 'Detecting GPU hardware...'
    _gpu_setup_state['progress'] = 10
    _gpu_setup_state['error'] = None
    
    try:
        gpu_info = detect_gpu_hardware()
        current_info = get_system_info()
        
        _gpu_setup_state['status'] = 'complete'
        _gpu_setup_state['step'] = 'Detection complete'
        _gpu_setup_state['progress'] = 100
        _gpu_setup_state['gpu_info'] = gpu_info
        
        return jsonify({
            'detected': gpu_info,
            'current': {
                'execution_provider': current_info['execution_provider'],
                'gpu_accelerated': current_info['gpu_accelerated'],
                'gpu_name': current_info.get('gpu_name'),
            },
            'change_needed': gpu_info.get('runtime') != current_info['execution_provider'].lower(),
        }), 200
        
    except Exception as e:
        logger.error(f"GPU re-setup detection failed: {e}")
        _gpu_setup_state['status'] = 'error'
        _gpu_setup_state['error'] = str(e)
        return jsonify({'error': str(e)}), 500
