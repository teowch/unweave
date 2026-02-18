const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { detectGPU, getInstallCommands } = require('./gpu-detect');

/**
 * First-Run Setup Module
 *
 * On first launch, this module:
 *   1. Verifies core dependencies are installed
 *   2. Detects GPU hardware
 *   3. Installs the appropriate GPU-accelerated PyTorch/ONNX Runtime variant
 *   4. Marks setup as complete so it doesn't run again
 *
 * Triggered by the SetupView page (not blocking — user sees live progress).
 * Progress is emitted to the renderer via IPC.
 */

const SETUP_MARKER = '.gpu-setup-complete';

/**
 * Check if first-run setup has already been completed.
 * @returns {boolean}
 */
function isSetupComplete() {
    const markerPath = path.join(config.paths.backendCwd, SETUP_MARKER);
    return fs.existsSync(markerPath);
}

/**
 * Mark setup as complete by writing a marker file with the GPU config.
 * @param {Object} gpuInfo - Result from detectGPU()
 */
function markSetupComplete(gpuInfo) {
    const markerPath = path.join(config.paths.backendCwd, SETUP_MARKER);
    const data = {
        completedAt: new Date().toISOString(),
        gpuInfo,
    };
    fs.writeFileSync(markerPath, JSON.stringify(data, null, 2));
}

/**
 * Get the saved GPU setup info from the marker file.
 * @returns {Object|null} Saved GPU info, or null if not set up
 */
function getSavedSetup() {
    const markerPath = path.join(config.paths.backendCwd, SETUP_MARKER);
    if (!fs.existsSync(markerPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
    } catch {
        return null;
    }
}

/**
 * Run a pip command in the embedded Python environment.
 *
 * @param {string} cmd - The pip command (e.g. "pip install onnxruntime-gpu")
 * @param {function} onProgress - Callback: (line: string) => void
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function runPipCommand(cmd, onProgress) {
    return new Promise((resolve) => {
        const pythonExe = config.paths.pythonExe;
        // Convert "pip install X" → [pythonExe, "-m", "pip", "install", "X", ...]
        const parts = cmd.replace(/^pip\s+/, '').split(/\s+/);
        const args = ['-m', 'pip', ...parts, '--no-input'];

        onProgress(`Running: ${pythonExe} -m ${parts.join(' ')}`);

        const proc = spawn(pythonExe, args, {
            cwd: config.paths.backendCwd,
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        proc.stdout.on('data', (data) => {
            data.toString().trim().split('\n').forEach(line => {
                onProgress(line);
            });
        });

        proc.stderr.on('data', (data) => {
            data.toString().trim().split('\n').forEach(line => {
                onProgress(line);
            });
        });

        proc.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true });
            } else {
                resolve({ success: false, error: `pip exited with code ${code}` });
            }
        });
    });
}

/**
 * Uninstall all GPU-variant packages before installing new ones.
 * This ensures no leftover CUDA/ROCm/DirectML libs from a previous setup.
 *
 * @param {function} onProgress - Callback: (line: string) => void
 */
async function cleanPreviousGpuPackages(onProgress) {
    // All GPU-specific packages that might have been installed previously
    // Also includes base onnxruntime — it conflicts with onnxruntime-gpu
    const gpuPackages = [
        'torch', 'torchvision', 'torchaudio',          // PyTorch (any variant)
        'onnxruntime',                                   // CPU-only ONNX (conflicts with GPU)
        'onnxruntime-gpu',                               // NVIDIA ONNX
        'onnxruntime-directml',                          // AMD Windows ONNX
        'onnxruntime-silicon',                           // Apple ONNX
        'onnxruntime-rocm',                              // AMD Linux ONNX
    ];

    onProgress('Removing previous GPU packages...');
    const result = await runPipCommand(
        `pip uninstall -y ${gpuPackages.join(' ')}`,
        onProgress
    );

    // Uninstall can "fail" if packages aren't installed — that's fine
    if (result.success) {
        onProgress('Previous GPU packages removed.');
    } else {
        onProgress('Some packages were not installed (this is fine).');
    }
}

/**
 * Run the first-launch GPU setup.
 *
 * @param {function} onProgress - Callback for progress updates:
 *   (update: { step: string, detail: string, progress: number }) => void
 *   progress is 0-100
 * @returns {Promise<Object>} Final GPU info
 */
async function runFirstTimeSetup(onProgress) {
    const emit = (step, detail, progress, extra = {}) => {
        onProgress({ step, detail, progress, ...extra });
    };

    emit('Checking environment', 'Verifying core dependencies...', 5);

    // Step 1: Verify Python is available
    try {
        const { execSync } = require('child_process');
        execSync(`"${config.paths.pythonExe}" --version`, { timeout: 5000 });
        emit('Checking environment', 'Python ✅', 10);
    } catch {
        emit('Error', 'Python not found — installation may be corrupted', 0);
        throw new Error('Embedded Python not found');
    }

    // Step 2: Detect GPU
    emit('Detecting GPU', 'Scanning for GPU hardware...', 15);
    const gpuInfo = await detectGPU();
    emit('Detecting GPU', gpuInfo.note || `Detected: ${gpuInfo.vendor}`, 30, { gpuInfo });

    // Step 3: Determine what to install
    const commands = getInstallCommands(gpuInfo);
    emit('Planning install', commands.description, 35, { gpuInfo });

    // Step 3.5: Clean previous GPU packages (prevents leftover CUDA/ROCm libs)
    if (commands.torchCmd || commands.onnxCmd) {
        emit('Cleaning up', 'Removing previous GPU packages...', 37);
        await cleanPreviousGpuPackages((line) => {
            emit('Cleaning up', line, 38);
        });
        emit('Cleaning up', 'Previous packages removed ✅', 40);
    }

    // Step 4: Install GPU packages (if needed)
    if (commands.torchCmd) {
        emit('Installing PyTorch', `Installing GPU-accelerated PyTorch (${gpuInfo.cudaVariant || gpuInfo.runtime})...`, 42);
        const torchResult = await runPipCommand(commands.torchCmd, (line) => {
            emit('Installing PyTorch', line, 55);
        });
        if (!torchResult.success) {
            emit('Warning', `PyTorch GPU install failed: ${torchResult.error}. Falling back to CPU.`, 60);
            console.warn('[Setup] PyTorch GPU install failed:', torchResult.error);
        } else {
            emit('Installing PyTorch', 'PyTorch GPU installed ✅', 65);
        }
    } else {
        emit('Installing PyTorch', 'Using pre-installed PyTorch (no GPU variant needed)', 65);
    }

    if (commands.onnxCmd) {
        emit('Installing ONNX Runtime', 'Installing GPU-accelerated ONNX Runtime...', 70);
        const onnxResult = await runPipCommand(commands.onnxCmd, (line) => {
            emit('Installing ONNX Runtime', line, 80);
        });
        if (!onnxResult.success) {
            emit('Warning', `ONNX GPU install failed: ${onnxResult.error}. Falling back to CPU.`, 85);
            console.warn('[Setup] ONNX GPU install failed:', onnxResult.error);
        } else {
            emit('Installing ONNX Runtime', 'ONNX Runtime GPU installed ✅', 90);
        }
    } else {
        emit('Installing ONNX Runtime', 'Using pre-installed ONNX Runtime', 90);
    }

    // Step 5: Mark complete
    emit('Finishing', 'Saving configuration...', 95);
    markSetupComplete(gpuInfo);

    emit('Complete', gpuInfo.note || 'Setup complete!', 100);
    return gpuInfo;
}

module.exports = {
    isSetupComplete,
    getSavedSetup,
    markSetupComplete,
    runFirstTimeSetup,
    detectGPU,
    getInstallCommands,
};
