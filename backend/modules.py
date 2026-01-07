"""
Module Registry: Defines all available audio separation modules.
Each module has configuration for the model, dependencies, and output naming.
"""
from typing import Dict, Optional, Any, List

MODULE_REGISTRY: Dict[str, Dict[str, Any]] = {
    "vocal_instrumental": {
        "description": "Separates vocals from instrumentals",
        "category": "Vocal Processing",
        "model": "model_bs_roformer_ep_368_sdr_12.9628.ckpt",
        "depends_on": None,
        "input_stem": None,
        "custom_output_names": {
            "Vocals": "base_vocals",
            "Instrumental": "base_instrumental"
        }
    },
    "lead_backing": {
        "description": "Separates lead vocals from backing vocals",
        "category": "Vocal Processing",
        "model": "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt",
        "depends_on": "vocal_instrumental",
        "input_stem": "Vocals",
        "custom_output_names": {
            "Vocals": "lead",
            "Instrumental": "backing"
        }
    },
    "male_female": {
        "description": "Separates male from female vocals (primary)",
        "category": "Vocal Processing",
        "model": "bs_roformer_male_female_by_aufr33_sdr_7.2889.ckpt",
        "depends_on": "vocal_instrumental",
        "input_stem": "Vocals",
        "custom_output_names": {
            "Male": "male",
            "Female": "female"
        }
    },
    "male_female_secondary": {
        "description": "Separates male from female vocals (alternative)",
        "category": "Vocal Processing",
        "model": "model_chorus_bs_roformer_ep_267_sdr_24.1275.ckpt",
        "depends_on": "vocal_instrumental",
        "input_stem": "Vocals",
        "custom_output_names": {
            "Male": "male_secondary",
            "Female": "female_secondary"
        }
    },
    "htdemucs_6s": {
        "description": "Separates audio instruments (drums, bass, guitar, piano, other)",
        "category": "Instrument Separation",
        "model": "htdemucs_6s.yaml",
        "depends_on": None,
        "input_stem": None,
        "custom_output_names": {
            "Drums": "htdemucs_6s_drums",
            "Bass": "htdemucs_6s_bass",
            "Other": "htdemucs_6s_other",
            "Guitar": "htdemucs_6s_guitar",
            "Piano": "htdemucs_6s_piano",
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
