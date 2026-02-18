"""
Waveform precomputation utility.

After audio separation, this module computes per-channel waveform peaks
and saves them as small JSON files alongside the stems. This enables
the frontend to render waveforms instantly from ~15 KB JSON instead of
decoding 40+ MB audio files into memory.

Usage:
    from utils.waveform import precompute_waveform
    precompute_waveform('path/to/stem.flac', 'path/to/stem.json')

Performance:
    ~0.1-0.3s per file — negligible vs 30-120s separation time.
"""
import os
import json
import logging
import soundfile as sf

logger = logging.getLogger(__name__)

# Number of peaks to compute. 800 gives good visual resolution at typical
# screen widths. Higher = more detail but larger JSON. Lower = faster but
# blockier waveform.
DEFAULT_NUM_PEAKS = 800


def precompute_waveform(audio_path: str, output_path: str, num_peaks: int = DEFAULT_NUM_PEAKS) -> dict:
    """
    Compute per-channel waveform peaks from an audio file and save as JSON.

    Preserves stereo: left and right channels are stored separately so
    the frontend can render real stereo waveform imagery.

    Args:
        audio_path: Path to input audio file (wav, flac, mp3, etc.)
        output_path: Path to write the output JSON file
        num_peaks: Number of min/max peak pairs to compute per channel

    Returns:
        The peaks dict (also written to output_path)

    Output JSON format:
        {
            "duration": 180.5,          # seconds
            "sample_rate": 44100,
            "channels": 2,
            "peaks": [                  # one flat array per channel
                [min1, max1, min2, max2, ...],   # left channel
                [min1, max1, min2, max2, ...],   # right channel
            ]
        }

    The flat interleaved format (min, max, min, max…) is what
    WaveSurfer.js expects for its ``peaks`` option.
    """
    data, sr = sf.read(audio_path)

    # Normalize to list of channels
    if data.ndim == 1:
        channels = [data]
    else:
        channels = [data[:, ch] for ch in range(data.shape[1])]

    result = {
        'duration': len(channels[0]) / sr,
        'sample_rate': sr,
        'channels': len(channels),
        'peaks': [],
    }

    for ch_data in channels:
        chunk_size = max(1, len(ch_data) // num_peaks)
        ch_peaks = []
        for i in range(0, len(ch_data), chunk_size):
            chunk = ch_data[i:i + chunk_size]
            # Flat interleaved: min then max for each chunk
            ch_peaks.append(round(float(chunk.min()), 4))
            ch_peaks.append(round(float(chunk.max()), 4))
        result['peaks'].append(ch_peaks)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(result, f)

    logger.info(f"Waveform precomputed: {os.path.basename(audio_path)} → {os.path.basename(output_path)}")
    return result


def precompute_waveforms_for_outputs(outputs: dict, output_dir: str) -> dict:
    """
    Precompute waveforms for all output stems from a module execution.

    Args:
        outputs: Dict of stem_key -> audio_filepath (from AudioProcessor.execute_module)
        output_dir: The project's output directory (waveforms saved to {output_dir}/waveforms/)

    Returns:
        Dict of stem_key -> waveform_json_path
    """
    waveform_dir = os.path.join(output_dir, 'waveforms')
    waveform_paths = {}

    for stem_key, audio_path in outputs.items():
        if not os.path.exists(audio_path):
            continue

        stem_name = os.path.splitext(os.path.basename(audio_path))[0]
        json_path = os.path.join(waveform_dir, f"{stem_name}.json")

        try:
            precompute_waveform(audio_path, json_path)
            waveform_paths[stem_key] = json_path
        except Exception as e:
            # Waveform failure should never block the pipeline
            logger.warning(f"Waveform precomputation failed for {stem_key}: {e}")

    return waveform_paths
