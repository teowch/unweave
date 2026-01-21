"""
AudioProject: Manages an audio processing project with state persistence.
Handles project lifecycle, module execution tracking, and dependency resolution.
"""
import os
import json
import logging
from typing import Dict, List, Optional, Any, TYPE_CHECKING

from modules import MODULE_REGISTRY, get_module, get_dependency_chain

if TYPE_CHECKING:
    from AudioProcessor import AudioProcessor

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class AudioProject:
    """
    Manages an audio processing project with state persistence.
    
    Handles:
    - Project initialization from audio file or existing session
    - Module execution tracking
    - Dependency resolution for modules
    - State persistence to metadata.json
    """
    
    def __init__(self, project_id: str, session_folder: str):
        """
        Initialize a project instance.
        
        Args:
            project_id: Unique identifier for the project
            session_folder: Absolute path to the session folder
        """
        self.project_id = project_id
        self.session_folder = session_folder
        self.state: Dict[str, Any] = {
            "input_original": None,
            "results": {}
        }
    
    @classmethod
    def create(cls, audio_file: str, project_id: str, base_library: str) -> "AudioProject":
        """
        Creates a new project from an audio file.
        
        Args:
            audio_file: Path to the input audio file
            project_id: Unique identifier for the project
            base_library: Base directory for all projects
            
        Returns:
            Initialized AudioProject instance
        """
        session_folder = os.path.join(base_library, project_id)
        os.makedirs(session_folder, exist_ok=True)
        
        project = cls(project_id, session_folder)
        project.state["input_original"] = audio_file
        project._save_state()
        
        logger.info(f"Created new project '{project_id}' at {session_folder}")
        return project
    
    @classmethod
    def load(cls, project_id: str, base_library: str) -> "AudioProject":
        """
        Loads an existing project from disk.
        
        Args:
            project_id: Unique identifier for the project
            base_library: Base directory for all projects
            
        Returns:
            AudioProject instance with loaded state
            
        Raises:
            FileNotFoundError: If project doesn't exist
        """
        session_folder = os.path.join(base_library, project_id)
        metadata_path = os.path.join(session_folder, "metadata.json")
        
        if not os.path.exists(metadata_path):
            raise FileNotFoundError(f"Project '{project_id}' not found")
        
        project = cls(project_id, session_folder)
        
        try:
            with open(metadata_path, 'r', encoding='utf-8') as f:
                project.state = json.load(f)
            logger.info(f"Loaded existing project '{project_id}'")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to load metadata for '{project_id}': {e}")
            raise
        
        return project
    
    @classmethod
    def load_or_create(cls, audio_file: str, project_id: str, base_library: str) -> "AudioProject":
        """
        Loads an existing project or creates a new one.
        
        Args:
            audio_file: Path to the input audio file (used for new projects)
            project_id: Unique identifier for the project
            base_library: Base directory for all projects
            
        Returns:
            AudioProject instance
        """
        session_folder = os.path.join(base_library, project_id)
        metadata_path = os.path.join(session_folder, "metadata.json")
        
        if os.path.exists(metadata_path):
            return cls.load(project_id, base_library)
        else:
            return cls.create(audio_file, project_id, base_library)
    
    def _get_metadata_path(self) -> str:
        """Returns the path to the metadata file."""
        return os.path.join(self.session_folder, "metadata.json")
    
    def _save_state(self) -> None:
        """Saves the current processing state to metadata.json."""
        path = self._get_metadata_path()
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(self.state, f, indent=4, ensure_ascii=False)
        except IOError as e:
            logger.error(f"Failed to save state to {path}: {e}")
    
    def get_original_file(self) -> Optional[str]:
        """Returns the path to the original input file."""
        return self.state.get("input_original")
    
    def get_executed_modules(self) -> List[str]:
        """Returns list of modules that have already been executed."""
        return list(self.state.get("results", {}).keys())
    
    def is_module_completed(self, module_name: str) -> bool:
        """Checks if a module has already been executed."""
        return module_name in self.state.get("results", {})
    
    def get_module_output(self, module_name: str, stem_key: str) -> Optional[str]:
        """
        Gets the output path for a specific stem from a module.
        
        Args:
            module_name: Name of the module
            stem_key: Key of the stem (e.g., "Vocals", "Instrumental")
            
        Returns:
            Path to the stem file, or None if not found
        """
        results = self.state.get("results", {})
        module_result = results.get(module_name, {})
        outputs = module_result.get("outputs", {})
        return outputs.get(stem_key)
    
    def get_module_input(self, module_name: str) -> str:
        """
        Resolves the input file for a module based on its dependencies.
        
        Args:
            module_name: Name of the module
            
        Returns:
            Path to the input file
            
        Raises:
            ValueError: If input cannot be resolved
            KeyError: If dependency output is missing
        """
        config = get_module(module_name)
        if not config:
            raise ValueError(f"Unknown module: {module_name}")
        
        # Base case: No dependencies, use original input
        if not config.get("depends_on"):
            original = self.get_original_file()
            if not original:
                raise ValueError("Original input file is missing in state.")
            return original
        
        # Module has a dependency
        parent_module = config["depends_on"]
        input_stem_key = config.get("input_stem")
        
        if not input_stem_key:
            raise ValueError(f"Module '{module_name}' has dependency but no input_stem defined")
        
        # Check if parent was executed
        if not self.is_module_completed(parent_module):
            raise ValueError(
                f"Dependency '{parent_module}' has not been executed. "
                f"Run it first or use run_module() for automatic dependency resolution."
            )
        
        # Get parent output
        parent_output = self.get_module_output(parent_module, input_stem_key)
        if not parent_output:
            available = list(self.state["results"][parent_module].get("outputs", {}).keys())
            raise KeyError(
                f"Module '{module_name}' requires '{input_stem_key}' from '{parent_module}', "
                f"but it was not found. Available: {available}"
            )
        
        return parent_output
    
    def record_module_result(
        self, 
        module_name: str, 
        model: str, 
        input_used: str, 
        outputs: Dict[str, str]
    ) -> None:
        """
        Records the result of a module execution.
        
        Args:
            module_name: Name of the executed module
            model: Model filename used
            input_used: Path to input file that was processed
            outputs: Mapping of stem_key -> output_filepath
        """
        self.state["results"][module_name] = {
            "model": model,
            "input_used": input_used,
            "outputs": outputs
        }
        self._save_state()
        logger.info(f"Recorded result for module '{module_name}'")
    
    def run_module(self, module_name: str, processor: "AudioProcessor", sse_message_handler: "SSEMessageHandler") -> Dict[str, str]:
        """
        Runs a single module with automatic dependency resolution.
        
        Args:
            module_name: Name of the module to run
            processor: AudioProcessor instance for executing separations
            
        Returns:
            Mapping of stem_key -> output_filepath
        """
        sse_message_handler.set_module(module_name)
        # Check if already completed
        if self.is_module_completed(module_name):
            sse_message_handler.send_module_completed()
            logger.info(f"Module '{module_name}' already completed. Skipping.")
            return self.state["results"][module_name]["outputs"]
        
        config = get_module(module_name)
        if not config:
            raise ValueError(f"Unknown module: {module_name}")
        
        # Resolve dependencies first
        parent_module = config.get("depends_on")
        if parent_module and not self.is_module_completed(parent_module):
            logger.info(f"Resolving dependency: '{module_name}' needs '{parent_module}'")
            sse_message_handler.send_resolving_dependency(parent_module)
            self.run_module(parent_module, processor, sse_message_handler)
        
        # Get input path
        input_path = self.get_module_input(module_name)
        
        # Set current model for SSE progress tracking
        sse_message_handler.set_current_model(config["model"])
        
        # Execute the module
        logger.info(f"Executing module: {module_name}")
        outputs = processor.execute_module(
            module_name=module_name,
            input_path=input_path,
            output_dir=self.session_folder,
            interceptor_callback=sse_message_handler.interceptor_callback,
        )
        
        # Record result
        self.record_module_result(
            module_name=module_name,
            model=config["model"],
            input_used=input_path,
            outputs=outputs
        )
        
        return outputs
    
    def run_modules(self, modules: List[str], processor: "AudioProcessor", sse_message_handler: "SSEMessageHandler") -> Dict[str, Any]:
        """
        Runs multiple modules, resolving dependencies automatically.
        
        Args:
            modules: List of module names to run
            processor: AudioProcessor instance for executing separations
            
        Returns:
            The complete project state after processing
        """
        for module_name in modules:
            if module_name not in MODULE_REGISTRY:
                logger.warning(f"Unknown module requested: {module_name}")
                continue
            
            try:
                self.run_module(module_name, processor, sse_message_handler)
            except Exception as e:
                logger.error(f"Error processing module '{module_name}': {e}")
                # Continue with other modules if one fails
        
        return self.state
