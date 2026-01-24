"""
Hardware detection utilities for audio processing.
"""
import logging
import platform
import sys
import shutil
import os
import subprocess
from typing import Tuple, Dict, Any

logger = logging.getLogger(__name__)


def get_cpu_name() -> str:
    """
    Returns the friendly CPU name using standard libraries across platforms.
    """
    try:
        if platform.system() == "Windows":
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            cpu_name = winreg.QueryValueEx(key, "ProcessorNameString")[0]
            winreg.CloseKey(key)
            return cpu_name.strip()
        
        elif platform.system() == "Darwin":
            command = ["/usr/sbin/sysctl", "-n", "machdep.cpu.brand_string"]
            return subprocess.check_output(command).strip().decode()
            
        elif platform.system() == "Linux":
            with open("/proc/cpuinfo", "r") as f:
                for line in f:
                    if "model name" in line:
                        return line.split(":")[1].strip()
                        
    except Exception as e:
        logger.warning(f"Failed to get friendly CPU name: {e}")
        
    # Fallback
    return platform.processor() or platform.machine()


def detect_execution_provider() -> Tuple[str, bool]:
    """
    Detects the best available execution provider for ONNX Runtime.
    
    Returns:
        Tuple of (provider_name, is_gpu_accelerated)
        - provider_name: 'CUDA', 'CoreML', or 'CPU'
        - is_gpu_accelerated: True if hardware acceleration is available
    """
    try:
        import onnxruntime as ort
        providers = ort.get_available_providers()
        
        if 'CUDAExecutionProvider' in providers:
            return ('CUDA', True)
        elif 'CoreMLExecutionProvider' in providers:
            return ('CoreML', True)
        else:
            return ('CPU', False)
    except ImportError:
        logger.warning("onnxruntime not available for provider detection")
        return ('CPU', False)
    except Exception as e:
        logger.warning(f"Error detecting execution provider: {e}")
        return ('CPU', False)


def get_system_info() -> Dict[str, Any]:
    """
    Collects comprehensive system information for the Settings page.
    
    Returns:
        Dictionary with system info including:
        - execution_provider: Current ONNX provider
        - gpu_accelerated: Whether GPU acceleration is active
        - python_version: Python version string
        - os_info: Operating system info
        - onnxruntime_version: ONNX Runtime version
        - pytorch_version: PyTorch version (if installed)
        - ffmpeg_available: Whether FFmpeg is detected
        - gpu_name: GPU name (if available)
        - gpu_memory_gb: GPU memory in GB (if available)
        - cpu_count: Number of logical CPUs
        - processor: Processor name
        - disk_total_gb: Total disk space in GB
        - disk_free_gb: Free disk space in GB
        - disk_used_percent: Disk usage percentage
    """
    provider, is_accelerated = detect_execution_provider()
    
    info = {
        'execution_provider': provider,
        'gpu_accelerated': is_accelerated,
        'python_version': f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        'os_info': f"{platform.system()} {platform.release()}",
        'onnxruntime_version': None,
        'pytorch_version': None,
        'audio_separator_version': None,
        'ffmpeg_available': False,
        'gpu_name': None,
        'gpu_memory_gb': None,
        'cpu_count': os.cpu_count(),
        'processor': get_cpu_name(),
        'disk_total_gb': None,
        'disk_free_gb': None,
        'disk_used_percent': None,
    }

    # Get Disk Usage
    try:
        total, used, free = shutil.disk_usage("/")
        info['disk_total_gb'] = round(total / (1024 ** 3), 1)
        info['disk_free_gb'] = round(free / (1024 ** 3), 1)
        info['disk_used_percent'] = round((used / total) * 100, 1)
    except Exception as e:
        logger.warning(f"Error getting disk info: {e}")
    
    # Get ONNX Runtime version
    try:
        import onnxruntime
        info['onnxruntime_version'] = onnxruntime.__version__
    except ImportError:
        pass
    
    # Get PyTorch version and GPU info
    try:
        import torch
        info['pytorch_version'] = torch.__version__
        
        if torch.cuda.is_available():
            info['gpu_name'] = torch.cuda.get_device_name(0)
            # Get GPU memory in GB
            total_memory = torch.cuda.get_device_properties(0).total_memory
            info['gpu_memory_gb'] = round(total_memory / (1024 ** 3), 1)
    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"Error getting GPU info: {e}")
    
    # Get audio-separator version
    try:
        import audio_separator
        info['audio_separator_version'] = audio_separator.__version__
    except (ImportError, AttributeError):
        # Try alternative method
        try:
            from importlib.metadata import version
            info['audio_separator_version'] = version('audio-separator')
        except Exception:
            pass
    
    # Check FFmpeg availability
    try:
        import subprocess
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
        info['ffmpeg_available'] = result.returncode == 0
    except Exception:
        info['ffmpeg_available'] = False
    
    return info
