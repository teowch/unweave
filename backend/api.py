import os
import sys
from flask import Flask
from flask_cors import CORS
import static_ffmpeg

# Ensure ffmpeg paths
static_ffmpeg.add_paths()

# Setup Flask
app = Flask(__name__)
CORS(app)

# Import Routes
from routes.projects_routes import projects_bp
from routes.audio_routes import audio_bp
from routes.sse_routes import sse_bp

# Register Blueprints
app.register_blueprint(projects_bp, url_prefix='/api')
app.register_blueprint(audio_bp, url_prefix='/api')
app.register_blueprint(sse_bp, url_prefix='/api')

if __name__ == '__main__':
    port = 5000
    print(f"Starting API on port {port}...")
    app.run(debug=True, port=port)
