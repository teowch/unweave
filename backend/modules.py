"""
Module Registry: Defines all available audio separation modules.
Each module has configuration for the model, dependencies, and output naming.
"""
from typing import Dict, Optional, Any, List

MODULE_REGISTRY: Dict[str, Dict[str, Any]] = {
    "vocal_instrumental": {
        "description": "Separates vocals from instrumentals",
        "welcome_text": "Perfect for karaoke! This extracts the singing voice from a song, giving you a clean vocal track and a separate instrumental (backing music) track.",
        "category": "Vocal Processing",
        "model": "model_bs_roformer_ep_368_sdr_12.9628.ckpt",
        "depends_on": None,
        "input_stem": None,
        "custom_output_names": {
            "Vocals": "base_vocals.vocal",
            "Instrumental": "base_instrumental.instrumental"
        }
    },
    "lead_backing": {
        "description": "Separates lead vocals from backing vocals",
        "welcome_text": "Works on the extracted vocals to separate the main singer from background harmonies. You'll get the lead voice on its own, plus everything else (backing vocals, harmonies, choir).",
        "category": "Vocal Processing",
        "model": "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt",
        "depends_on": "vocal_instrumental",
        "input_stem": "Vocals",
        "custom_output_names": {
            "Vocals": "lead_vocals.vocal",
            "Instrumental": "backing_vocals.vocal"
        }
    },
    "male_female": {
        "description": "Separates male from female vocals (primary)",
        "welcome_text": "Takes the extracted vocals and separates them by gender. Perfect for duets — you'll get the male voice and female voice as separate tracks.",
        "category": "Vocal Processing",
        "model": "bs_roformer_male_female_by_aufr33_sdr_7.2889.ckpt",
        "depends_on": "vocal_instrumental",
        "input_stem": "Vocals",
        "custom_output_names": {
            "Male": "male_vocals.vocal",
            "Female": "female_vocals.vocal"
        }
    },
    "male_female_secondary": {
        "description": "Separates male from female vocals (alternative)",
        "welcome_text": "An alternative model for gender separation on extracted vocals. Try this if the primary method doesn't give you the best results for your song.",
        "category": "Vocal Processing",
        "model": "model_chorus_bs_roformer_ep_267_sdr_24.1275.ckpt",
        "depends_on": "vocal_instrumental",
        "input_stem": "Vocals",
        "custom_output_names": {
            "Male": "male_secondary.vocal",
            "Female": "female_secondary.vocal"
        }
    },
    "htdemucs_6s": {
        "description": "Separates audio instruments (drums, bass, guitar, piano, other)",
        "welcome_text": "The full band splitter! Breaks down a song into individual instruments: drums, bass, guitar, piano, vocals, and everything else. Perfect for remixing, practicing along to isolated parts, or creating mashups.",
        "category": "Instrument Separation",
        "model": "htdemucs_6s.yaml",
        "depends_on": None,
        "input_stem": None,
        "custom_output_names": {
            "Vocals": "vocals_htdemucs_6s.vocal",
            "Drums": "drums_htdemucs_6s.drums",
            "Bass": "bass_htdemucs_6s.bass",
            "Other": "other_htdemucs_6s.other",
            "Guitar": "guitar_htdemucs_6s.guitar",
            "Piano": "piano_htdemucs_6s.piano",
        }
    },
    "htdemucs_4s": {
        "description": "Separates audio into 4 stems (vocals, drums, bass, other)",
        "welcome_text": "A quick and reliable way to split a song into 4 parts: vocals, drums, bass, and everything else. Faster than the 6-stem version and great for most use cases.",
        "category": "Instrument Separation",
        "model": "htdemucs.yaml",
        "depends_on": None,
        "input_stem": None,
        "custom_output_names": {
            "Vocals": "vocals_htdemucs.vocal",
            "Drums": "drums_htdemucs.drums",
            "Bass": "bass_htdemucs.bass",
            "Other": "other_htdemucs.other",
        }
    }
}


def get_module(module_name: str) -> Optional[Dict[str, Any]]:
    """Returns module configuration by name, or None if not found."""
    return MODULE_REGISTRY.get(module_name)


def get_all_modules() -> Dict[str, Dict[str, Any]]:
    """Returns all module configurations."""
    return MODULE_REGISTRY




def get_module_names() -> List[str]:
    """Returns list of all module names."""
    return list(MODULE_REGISTRY.keys())


def validate_modules(module_names: List[str]) -> List[str]:
    """Returns list of invalid module names from the input list."""
    return [m for m in module_names if m not in MODULE_REGISTRY]


def get_dependency_chain(module_name: str) -> List[str]:
    """
    Returns the full dependency chain for a module (including itself).
    Order: dependencies first, then the module itself.
    """
    if module_name not in MODULE_REGISTRY:
        return []
    
    chain = []
    current = module_name
    
    # Walk up the dependency tree
    while current:
        chain.insert(0, current)
        config = MODULE_REGISTRY.get(current)
        current = config.get("depends_on") if config else None
    
    return chain


def load_model_data() -> Dict[str, Any]:
    """Loads and indexes model data from models.json by filename."""
    import json
    import os
    
    # Path to models.json is in the same directory as this file (usually)
    # or one level up? based on file listing earlier, models.json is in backend/
    # and modules.py is in backend/
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    models_path = os.path.join(base_dir, 'models.json')
    
    if not os.path.exists(models_path):
        print(f"Warning: models.json not found at {models_path}")
        return {}
        
    try:
        with open(models_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        # Create a lookup map: filename -> data
        lookup = {}
        for arch, models in data.items():
            for model_name, details in models.items():
                if 'filename' in details:
                    lookup[details['filename']] = details
                    
        return lookup
    except Exception as e:
        print(f"Error loading models.json: {e}")
        return {}


def get_modules_for_api() -> List[Dict[str, Any]]:
    """Returns all modules in frontend-ready format."""
    model_lookup = load_model_data()
    
    return [
        {
            'id': module_id,
            'description': config.get('description', ''),
            'welcomeText': config.get('welcome_text', ''),
            'category': config.get('category', 'Uncategorized'),
            'model': config.get('model', ''),
            'outputs': list(config.get('custom_output_names', {}).keys()),
            'dependsOn': config.get('depends_on'),
            'scores': model_lookup.get(config.get('model', ''), {}).get('scores', {})
        }
        for module_id, config in MODULE_REGISTRY.items()
    ]
