#!/usr/bin/env bash
# ── Build script for Linux (run from project root) ──
# Prereqs: Node.js 18+, npm, curl, tar
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_OUTPUT="$PROJECT_ROOT/dist-electron"

echo "═══════════════════════════════════════════════"
echo "  Unweave — Linux Build Pipeline"
echo "═══════════════════════════════════════════════"

if [ "${1:-}" == "clean" ]; then
    echo "  Clean build requested"
    echo "  Unweave — Cleaning build output..."
    rm -rf "$BUILD_OUTPUT"
fi

# ── Step 1: Build Vite frontend ──
echo ""
echo "🔨 Step 1/5: Building frontend..."
cd "$PROJECT_ROOT/frontend"
npm install
npm run build
echo "   ✅ Frontend built → frontend/dist/"

# ── Step 2: Download standalone Python ──
PYTHON_VERSION="3.10.14"
PYTHON_BUILD_TAG="20240415"
PYTHON_DIR="$PROJECT_ROOT/electron/resources/python"

if [ ! -d "$PYTHON_DIR" ]; then
    echo ""
    echo "📦 Step 2/5: Downloading standalone Python ${PYTHON_VERSION}..."
    PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_BUILD_TAG}/cpython-${PYTHON_VERSION}+${PYTHON_BUILD_TAG}-x86_64-unknown-linux-gnu-install_only.tar.gz"
    mkdir -p "$PYTHON_DIR"
    curl -L "$PYTHON_URL" | tar xz -C "$PYTHON_DIR" --strip-components=1
    echo "   ✅ Python ${PYTHON_VERSION} extracted → ${PYTHON_DIR}"
else
    echo ""
    echo "📦 Step 2/5: Standalone Python already present, skipping download."
fi

# ── Step 3: Install deps directly into standalone Python ──
echo ""
echo "📚 Step 3/5: Installing Python dependencies..."
PYTHON_EXE="$PYTHON_DIR/bin/python3"

# Install CPU-only PyTorch + base deps directly into the standalone Python
# (no venv — this is the Python that ships with the app)
"$PYTHON_EXE" -m pip install --upgrade pip
"$PYTHON_EXE" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
"$PYTHON_EXE" -m pip install -r "$PROJECT_ROOT/backend/requirements-base.txt"
echo "   ✅ Base dependencies installed (CPU PyTorch)"

# ── Step 4: Bundle FFmpeg ──
echo ""
echo "🎬 Step 4/5: Downloading FFmpeg binaries..."
cd "$PROJECT_ROOT/backend"
if [ -f "download.py" ]; then
    "$PYTHON_EXE" download.py
    echo "   ✅ FFmpeg binaries downloaded"
else
    echo "   ⏭️  No download.py found, skipping FFmpeg download"
fi

# ── Step 5: Package Electron app ──
echo ""
echo "📦 Step 5/5: Packaging Electron app..."

# Remove setup marker so production builds always run first-launch setup
rm -f "$PROJECT_ROOT/backend/.gpu-setup-complete"

cd "$PROJECT_ROOT/electron"
npm install
npm run dist:linux
echo "   ✅ Electron app packaged → $BUILD_OUTPUT"

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅ Build complete!"
echo "  Output: $BUILD_OUTPUT"
echo "═══════════════════════════════════════════════"
