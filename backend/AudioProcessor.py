import os
import json
import logging
from typing import Dict, List, Optional, Any
from audio_separator.separator import Separator

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

WORKFLOW_MAP = {
    "vocal_instrumental": {
        "model": "model_bs_roformer_ep_368_sdr_12.9628.ckpt",
        "depends_on": None,
        "custom_output_names": {
            "Vocals": "base_vocals",
            "Instrumental": "base_instrumental"
        }
    },
    "lead_backing": {
        "model": "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt",
        "depends_on": "vocal_instrumental",
        "input_stem": "Vocals",
        "custom_output_names": {
            "Vocals": "lead",
            "Instrumental": "backing"
        }
    },
    "male_female": {
        "model": "bs_roformer_male_female_by_aufr33_sdr_7.2889.ckpt",
        "depends_on": "vocal_instrumental",
        "input_stem": "Vocals",
        "custom_output_names": {
            "Male": "male",
            "Female": "female"
        }
    },
    "male_female_secondary": {
        "model": "model_chorus_bs_roformer_ep_267_sdr_24.1275.ckpt",
        "depends_on": "vocal_instrumental",
        "input_stem": "Vocals",
        "custom_output_names": {
            "Male": "male_secondary",
            "Female": "female_secondary"
        }
    },
    "htdemucs_6s": {
        "model": "htdemucs_6s.yaml",
        "depends_on": None,
        "custom_output_names": {
            "Vocals": "htdemucs_6s_vocals",
            "Drums": "htdemucs_6s_drums",
            "Bass": "htdemucs_6s_bass",
            "Other": "htdemucs_6s_other",
            "Guitar": "htdemucs_6s_guitar",
            "Piano": "htdemucs_6s_piano",
        }
    }
}

class AudioProcessor:
    """
    Handles audio separation workflows using the audio-separator library.
    Manages dependency resolution between separation models and state persistence.
    """

    def __init__(self, output_format: str = "flac", base_library: str = "Library"):
        self.output_format = output_format
        self.base_library = base_library
        self.state: Dict[str, Any] = {"input_original": None, "results": {}}
        self.current_session_folder: Optional[str] = None
        self.separator = Separator(output_format=self.output_format)

    def _get_metadata_path(self, session_folder: str) -> str:
        return os.path.join(session_folder, "metadata.json")

    def _save_state(self) -> None:
        """Saves the current processing state to metadata.json."""
        if self.current_session_folder:
            path = self._get_metadata_path(self.current_session_folder)
            try:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(self.state, f, indent=4, ensure_ascii=False)
            except IOError as e:
                logger.error(f"Failed to save state to {path}: {e}")

    def _initialize_session(self, audio_file: str, project_id: Optional[str] = None) -> None:
        """Sets up the session folder and loads existing state if available."""
        if project_id:
            base_name = project_id
        else:
            base_name = os.path.splitext(os.path.basename(audio_file))[0]

        self.current_session_folder = os.path.join(self.base_library, base_name)
        os.makedirs(self.current_session_folder, exist_ok=True)
        
        metadata_path = self._get_metadata_path(self.current_session_folder)
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    self.state = json.load(f)
                logger.info(f"Loaded existing session from {self.current_session_folder}")
            except json.JSONDecodeError as e:
                logger.error(f"Failed to load metadata, initializing new state: {e}")
                self.state = {"input_original": audio_file, "results": {}}
        else:
            # Initialize with input_original if it serves as the base
            self.state = {"input_original": audio_file, "results": {}}

    def _get_module_input(self, module_name: str) -> str:
        """
        Recursively resolves input dependencies for a given module.
        """
        config = WORKFLOW_MAP[module_name]
        
        # Base Case: No dependencies, use original input
        if not config["depends_on"]:
            val = self.state.get("input_original")
            if not val:
                 # Fallback or error? If initialized correctly, it enters here.
                 # If partially loaded metadata is missing 'input_original', that's an issue.
                 raise ValueError("Original input file is missing in state.")
            return val
        
        parent_module = config["depends_on"]
        
        # If parent hasn't run, recurse
        if parent_module not in self.state["results"]:
            logger.info(f"Resolving dependency: '{module_name}' needs '{parent_module}'")
            self._run_module(parent_module)
            
        # Get parent output
        parent_outputs = self.state["results"][parent_module].get("outputs", {})
        input_stem_key = config["input_stem"]
        
        if input_stem_key not in parent_outputs:
            available = list(parent_outputs.keys())
            error_msg = (f"Dependency error: Module '{module_name}' requires '{input_stem_key}' "
                         f"from '{parent_module}', but it was not found. Available: {available}")
            logger.error(error_msg)
            raise KeyError(error_msg)

        return parent_outputs[input_stem_key]

    def _run_module(self, module_name: str) -> Dict[str, str]:
        """
        Executes separation for a specific module, handling inputs and outputs.
        """
        # 1. Idempotency Check
        if module_name in self.state["results"]:
            logger.info(f"Module '{module_name}' already processed. Skipping.")
            return self.state["results"][module_name]["outputs"]

        # 2. Resolve Input
        try:
            input_path = self._get_module_input(module_name)
        except Exception as e:
            logger.error(f"Failed to resolve input for {module_name}: {e}")
            raise

        config = WORKFLOW_MAP[module_name]
        
        # Ensure output directory is set
        if self.current_session_folder:
             self.separator.output_dir = self.current_session_folder
        
        # Load Model
        logger.info(f"Loading model: {config['model']} for {module_name}")
        self.separator.load_model(model_filename=config["model"])
        
        # Run Separation
        logger.info(f"Processing module: {module_name}...")
        self.separator.separate(
            input_path, 
            custom_output_names=config["custom_output_names"]
        )
        
        # 3. Map and Save Results
        mapped_outputs = {}
        for stem, filename in config["custom_output_names"].items():
            full_path = os.path.join(self.current_session_folder, f"{filename}.{self.output_format}")
            if os.path.exists(full_path):
                mapped_outputs[stem] = full_path
            else:
                 logger.warning(f"Expected output file not found: {full_path}")

        self.state["results"][module_name] = {
            "model": config["model"],
            "input_used": input_path,
            "outputs": mapped_outputs
        }
        self._save_state()
        
        return mapped_outputs

    def process(self, audio_file: str, requested_modules: List[str], project_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Main entry point to process an audio file with requested modules.
        
        Args:
            audio_file: Path to the input audio file.
            requested_modules: List of module keys.
            project_id: Optional unique identifier for the project/session.

        Returns:
            The final state dictionary.
        """
        self._initialize_session(audio_file, project_id)
        
        for module in requested_modules:
            if module in WORKFLOW_MAP:
                try:
                    self._run_module(module)
                except Exception as e:
                    logger.error(f"Error processing module '{module}': {e}")
                    # We continue to next module if one fails? 
                    # If dependencies fail, _run_module raises exception, so dependent modules will fail.
                    # Independent modules might still work.
            else:
                logger.warning(f"Unknown module requested: {module}")
                
        return self.state