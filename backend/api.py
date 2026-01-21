import os
import sys
from flask import Flask
from flask_cors import CORS
import static_ffmpeg

# Ensure ffmpeg paths
static_ffmpeg.add_paths()

# Setup Flask
app = Flask(__name__)

# CORS: Restrict to known frontend origins (add production URL when deploying)
CORS(app, origins=[
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
])

# Import Routes
from routes.projects_routes import projects_bp
from routes.audio_routes import audio_bp
from routes.sse_routes import sse_bp

# Register Blueprints
app.register_blueprint(projects_bp, url_prefix='/api')
app.register_blueprint(audio_bp, url_prefix='/api')
app.register_blueprint(sse_bp, url_prefix='/api')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    print(f"Starting API on port {port}... (debug={debug})")
    app.run(debug=debug, port=port)

