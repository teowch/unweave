from audio_separator.separator import Separator
import os
import yt_dlp

output_folder = 'test'
url = 'https://www.youtube.com/watch?v=25ROFXjoaAU'
    
# # Create distinct filename based on video title
# ydl_opts = {
#     'format': 'bestaudio/best',
#     'outtmpl': os.path.join(output_folder, '%(title)s.%(ext)s'),
#     'postprocessors': [{
#         'key': 'FFmpegExtractAudio',
#         'preferredcodec': 'mp3',
#         'preferredquality': '192',
#     }],
#     # Fallback if ffmpeg is missing (it might fail extraction but might download raw)
#     'prefer_ffmpeg': True,
#     'keepvideo': False,
#     'quiet': True
# }

# try:
#     with yt_dlp.YoutubeDL(ydl_opts) as ydl:
#         info = ydl.extract_info(url, download=True)
#         filename = ydl.prepare_filename(info)
#         # handle extension change by postprocessor (mp3)
#         base, _ = os.path.splitext(filename)
#         final_path = base + ".mp3"
# except Exception as e:
#     raise Exception(f"Youtube Download failed: {str(e)}")

# Initialize the Separator class (with optional configuration properties, below)
separator = Separator()

# separator.load_model(model_filename="melband_roformer_big_beta5e.ckpt")

# separator.separate(os.path.join("test", "The Chainsmokers - Closer (Lyrics) ft. Halsey.mp3"), custom_output_names={"Vocals": "vocals_output"})

# Load a model
separator.load_model(model_filename='model_chorus_bs_roformer_ep_267_sdr_24.1275.ckpt')

# Separate multiple audio files without reloading the model
output_files = separator.separate("vocals_output.wav")


