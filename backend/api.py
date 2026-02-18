import os
import sys
from flask import Flask, jsonify
from flask_cors import CORS

# ── FFmpeg Setup ──
# In Electron mode: use bundled ffmpeg from vendor/ffmpeg/{platform}
# In dev mode: try bundled first, fall back to static_ffmpeg
ELECTRON_MODE = os.environ.get('ELECTRON_MODE') == '1'

if ELECTRON_MODE:
    from utils.ffmpeg_setup import ffmpeg_paths
    ffmpeg_bin, ffprobe_bin = ffmpeg_paths()
    os.environ['PATH'] = os.path.dirname(ffmpeg_bin) + os.pathsep + os.environ.get('PATH', '')
else:
    try:
        from utils.ffmpeg_setup import ffmpeg_paths
        ffmpeg_bin, ffprobe_bin = ffmpeg_paths()
        os.environ['PATH'] = os.path.dirname(ffmpeg_bin) + os.pathsep + os.environ.get('PATH', '')
    except FileNotFoundError:
        # Fall back to static_ffmpeg in dev if vendor/ffmpeg not downloaded
        import static_ffmpeg
        static_ffmpeg.add_paths()

# Setup Flask
app = Flask(__name__)

# CORS: Allow known frontend origins + Electron custom protocol
CORS(app, origins=[
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'app://*',       # Electron file:// via custom scheme
    'unweave://*',   # Custom protocol
])

# ── Health endpoint for Electron sidecar ──
@app.route('/api/health')
def health():
    return jsonify({"status": "ok"})

# Import Routes
from routes.projects_routes import projects_bp
from routes.audio_routes import audio_bp
from routes.sse_routes import sse_bp
from routes.settings_routes import settings_bp

# Register Blueprints
app.register_blueprint(projects_bp, url_prefix='/api')
app.register_blueprint(audio_bp, url_prefix='/api')
app.register_blueprint(sse_bp, url_prefix='/api')
app.register_blueprint(settings_bp, url_prefix='/api')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    print(f"Starting API on port {port}... (debug={debug})")
    app.run(debug=debug, port=port)
