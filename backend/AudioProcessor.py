"""
AudioProcessor: Stateless executor for audio separation modules.
Handles the actual audio processing using the audio-separator library.
"""
from services.log_interceptor import intercept
import os
import logging
from typing import Dict, Optional, Callable

from audio_separator.separator import Separator
from modules import MODULE_REGISTRY, get_module

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class AudioProcessor:
    """
    Stateless executor for audio separation modules.
    
    This class focuses solely on running audio separations.
    Project/session state management is handled by AudioProject.
    """
    
    def __init__(self, output_format: str = "flac"):
        """
        Initialize the processor.
        
        Args:
            output_format: Output format for separated audio (default: flac)
        """
        self.output_format = output_format
        self.separator = Separator(output_format=self.output_format)
    
    def execute_module(
        self, 
        module_name: str, 
        input_path: str, 
        output_dir: str,
        interceptor_callback: Optional[Callable[[str, str], None]] = None
    ) -> Dict[str, str]:
        """
        Executes a single module separation.
        
        Args:
            module_name: Name of the module to execute
            input_path: Path to the input audio file
            output_dir: Directory to write output files
            interceptor_callback: Callback function (message, event_type) for progress updates
            
        Returns:
            Mapping of stem_key -> output_filepath
            
        Raises:
            ValueError: If module is unknown
        """
        config = get_module(module_name)
        if not config:
            raise ValueError(f"Unknown module: {module_name}")
        
        # Set output directory
        self.separator.output_dir = output_dir
        
        # Load model - wrap with intercept to capture download progress
        logger.info(f"Loading model: {config['model']} for {module_name}")
        with intercept(interceptor_callback, event_type="model_download"):
            self.separator.load_model(model_filename=config["model"])
        
        # Run separation - wrap with intercept to capture processing progress
        logger.info(f"Processing module: {module_name}...")
        with intercept(interceptor_callback, event_type="processing"):
            self.separator.separate(
                input_path,
                custom_output_names=config["custom_output_names"]
            )
        
        # Map and return output paths
        outputs = {}
        for stem_key, filename in config["custom_output_names"].items():
            full_path = os.path.join(output_dir, f"{filename}.{self.output_format}")
            if os.path.exists(full_path):
                outputs[stem_key] = full_path
            else:
                logger.warning(f"Expected output file not found: {full_path}")
        
        logger.info(f"Module '{module_name}' completed. Outputs: {list(outputs.keys())}")
        return outputs

