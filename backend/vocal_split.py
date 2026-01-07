from pathlib import Path
from audio_separator.separator import Separator

import json

separator = Separator()

with open("models.json", "w") as f:
    json.dump(separator.list_supported_model_files(), f, indent=2)

def process_lead_and_backing(
    vocals_path: str,
    output_dir: str | None = None,
) -> list[str]:
    """
    Recebe um vocals.wav (já separado do instrumental) e usa o modelo
    'mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt'
    para separar em 2 stems (lead / backing).

    Retorna a lista de arquivos gerados.
    """

    vocals_path = Path(vocals_path)

    if output_dir is None:
        output_dir = vocals_path.parent
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    # Configurando o separador para usar GPU e MDXC (Roformer)
    separator = Separator(
        output_dir=str(output_dir),
        output_format="WAV",
        use_autocast=True,  # usa sua 3060 se o ambiente estiver correto
        mdxc_params={
            # deixar o segment_size no default do modelo (não force override)
            "segment_size": 256,
            "override_model_segment_size": False,
            "overlap": 8,      # mais overlap = melhor qualidade, mais lento
            "batch_size": 2,   # pode subir pra 4 se a VRAM aguentar
            "pitch_shift": 0,
        },
    )

    # Esse modelo é o Aufr33 & Viperx Mel Roformer Karaoke
    model_filename = "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt"

    # Na primeira vez ele baixa o modelo automaticamente;
    # depois disso já fica cacheado localmente.
    separator.load_model(model_filename=model_filename)

    output_names = {
        "Vocals": "lead.wav",
        "Instrumental": "backing.wav"
    }

    # Faz a separação do vocals.wav
    output_files = separator.separate(str(vocals_path), output_names)

    return output_files