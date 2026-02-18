const { exec } = require('child_process');
const os = require('os');

/**
 * GPU Detection Module
 *
 * Detects GPU hardware and determines the appropriate PyTorch/ONNX Runtime
 * variant to install. Runs during first-launch setup and when the user
 * clicks "Re-detect GPU" in Settings.
 *
 * Detection order: NVIDIA → AMD → Apple Silicon → CPU fallback
 */


/**
 * Execute a shell command and return stdout.
 * @param {string} cmd - The command to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{success: boolean, stdout: string}>}
 */
function run(cmd, timeoutMs = 10000) {
    return new Promise((resolve) => {
        exec(cmd, { timeout: timeoutMs }, (err, stdout) => {
            if (err) {
                resolve({ success: false, stdout: '' });
            } else {
                resolve({ success: true, stdout: stdout.trim() });
            }
        });
    });
}

/**
 * Detect the current GPU hardware and determine the best runtime.
 *
 * @returns {Promise<Object>} GPU info object:
 *   - vendor: 'nvidia' | 'amd' | 'apple' | 'intel_mac' | 'none'
 *   - runtime: 'cuda' | 'rocm' | 'directml' | 'mps' | 'cpu'
 *   - cudaVariant: 'cu121' | 'cu124' | 'cu128' | null
 *   - gpuName: string | null
 *   - driverVersion: string | null
 *   - computeCapability: number | null
 *   - arch: string | null       (e.g. 'blackwell', 'ada/ampere', 'turing/volta')
 *   - note: string | null       (human-readable explanation)
 *   - error: string | null      (if detection had problems)
 */
async function detectGPU() {
    // ── 1. Check NVIDIA ──
    const nvidiaResult = await run(
        'nvidia-smi --query-gpu=name,driver_version,compute_cap --format=csv,noheader'
    );

    if (nvidiaResult.success && nvidiaResult.stdout) {
        const parts = nvidiaResult.stdout.split(',').map(s => s.trim());
        if (parts.length >= 3) {
            const gpuName = parts[0];
            const driverVersion = parts[1];
            const computeCap = parseFloat(parts[2]);
            const driverMajor = parseFloat(driverVersion);

            // Check minimum driver version
            if (driverMajor < 525) {
                return {
                    vendor: 'nvidia',
                    runtime: 'cpu',
                    cudaVariant: null,
                    gpuName,
                    driverVersion,
                    computeCapability: computeCap,
                    arch: null,
                    note: `Driver ${driverVersion} is too old (minimum: 525.60). Please update your NVIDIA driver.`,
                    error: 'driver_too_old',
                };
            }

            // Map compute capability → CUDA variant
            if (computeCap >= 10.0) {
                return {
                    vendor: 'nvidia', runtime: 'cuda', cudaVariant: 'cu128',
                    gpuName, driverVersion, computeCapability: computeCap,
                    arch: 'blackwell',
                    note: `${gpuName} (Blackwell) — full CUDA acceleration`,
                    error: null,
                };
            }
            if (computeCap >= 8.0) {
                return {
                    vendor: 'nvidia', runtime: 'cuda', cudaVariant: 'cu124',
                    gpuName, driverVersion, computeCapability: computeCap,
                    arch: 'ada/ampere',
                    note: `${gpuName} (Ada/Ampere) — full CUDA acceleration`,
                    error: null,
                };
            }
            if (computeCap >= 7.0) {
                return {
                    vendor: 'nvidia', runtime: 'cuda', cudaVariant: 'cu121',
                    gpuName, driverVersion, computeCapability: computeCap,
                    arch: 'turing/volta',
                    note: `${gpuName} (Turing/Volta) — full CUDA acceleration`,
                    error: null,
                };
            }

            // Too old for CUDA
            return {
                vendor: 'nvidia', runtime: 'cpu', cudaVariant: null,
                gpuName, driverVersion, computeCapability: computeCap,
                arch: null,
                note: `${gpuName} (compute ${computeCap}) is too old for CUDA — using CPU`,
                error: null,
            };
        }
    }

    // ── 2. Check AMD ──
    if (process.platform === 'linux') {
        const rocmResult = await run('rocminfo 2>/dev/null');
        if (rocmResult.success) {
            return {
                vendor: 'amd', runtime: 'rocm', cudaVariant: null,
                gpuName: null, driverVersion: null, computeCapability: null,
                arch: 'rocm',
                note: 'AMD GPU with ROCm — full GPU acceleration',
                error: null,
            };
        }
    }

    if (process.platform === 'win32') {
        const wmicResult = await run('wmic path win32_VideoController get name');
        if (wmicResult.success) {
            const lines = wmicResult.stdout.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (line.toUpperCase().includes('AMD') || line.toUpperCase().includes('RADEON')) {
                    return {
                        vendor: 'amd', runtime: 'directml', cudaVariant: null,
                        gpuName: line, driverVersion: null, computeCapability: null,
                        arch: 'directml',
                        note: `${line} — DirectML for ONNX models, CPU for Demucs`,
                        error: null,
                    };
                }
            }
        }
    }

    // ── 3. Check Apple Silicon ──
    if (process.platform === 'darwin') {
        const sysResult = await run('sysctl -n machdep.cpu.brand_string');
        if (sysResult.success) {
            if (sysResult.stdout.includes('Apple')) {
                return {
                    vendor: 'apple', runtime: 'mps', cudaVariant: null,
                    gpuName: sysResult.stdout, driverVersion: null,
                    computeCapability: null, arch: 'apple_silicon',
                    note: `${sysResult.stdout} — MPS acceleration`,
                    error: null,
                };
            }
            return {
                vendor: 'intel_mac', runtime: 'cpu', cudaVariant: null,
                gpuName: sysResult.stdout, driverVersion: null,
                computeCapability: null, arch: null,
                note: 'Intel Mac — CPU only',
                error: null,
            };
        }
    }

    // ── 4. Fallback ──
    return {
        vendor: 'none', runtime: 'cpu', cudaVariant: null,
        gpuName: null, driverVersion: null, computeCapability: null,
        arch: null,
        note: 'No compatible GPU detected — running on CPU (still works great!)',
        error: null,
    };
}

/**
 * Get the pip install commands for the detected GPU config.
 *
 * @param {Object} gpuInfo - Result from detectGPU()
 * @returns {Object} { torchCmd: string|null, onnxCmd: string|null, description: string }
 */
function getInstallCommands(gpuInfo) {
    const base = {
        torchCmd: null,     // null = keep CPU torch (already installed)
        onnxCmd: null,      // null = keep CPU onnxruntime (already installed)
        description: 'CPU only — no additional packages needed',
    };

    if (gpuInfo.runtime === 'cuda') {
        const indexUrl = gpuInfo.cudaVariant === 'cu128'
            ? 'https://download.pytorch.org/whl/nightly/cu128'
            : `https://download.pytorch.org/whl/${gpuInfo.cudaVariant}`;

        return {
            torchCmd: `pip install torch torchvision torchaudio --index-url ${indexUrl}`,
            onnxCmd: 'pip install onnxruntime-gpu',
            description: `CUDA ${gpuInfo.cudaVariant} — installing GPU PyTorch + ONNX Runtime`,
        };
    }

    if (gpuInfo.runtime === 'rocm') {
        return {
            torchCmd: 'pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/rocm6.2',
            onnxCmd: 'pip install onnxruntime-rocm',
            description: 'AMD ROCm — installing GPU PyTorch + ONNX Runtime',
        };
    }

    if (gpuInfo.runtime === 'directml') {
        return {
            torchCmd: null,  // Keep CPU torch
            onnxCmd: 'pip install onnxruntime-directml',
            description: 'AMD DirectML — installing ONNX Runtime DirectML (Demucs stays on CPU)',
        };
    }

    if (gpuInfo.runtime === 'mps') {
        return {
            torchCmd: null,  // macOS torch already has MPS built-in
            onnxCmd: 'pip install onnxruntime-silicon',
            description: 'Apple Silicon — installing ONNX Runtime Silicon',
        };
    }

    return base;
}

module.exports = { detectGPU, getInstallCommands };
