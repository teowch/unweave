const { protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('./config');

/**
 * MIME type lookup for audio files.
 */
const MIME_TYPES = {
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.json': 'application/json',
};

/**
 * Register the `unweave://` custom protocol.
 *
 * Supported routes:
 *   unweave://audio/{projectId}/{stemFile}     → serves audio file from disk
 *   unweave://waveform/{projectId}/{stemFile}  → serves precomputed waveform JSON
 *
 * This eliminates the need for blob URLs — audio streams directly from disk
 * through Chromium's media pipeline.
 */
function registerProtocol() {
    protocol.handle('unweave', (request) => {
        try {
            const url = new URL(request.url);
            const routeType = url.hostname; // 'audio' or 'waveform'
            const pathParts = url.pathname.split('/').filter(Boolean);

            if (pathParts.length < 2) {
                return new Response('Bad request: expected /{projectId}/{fileName}', {
                    status: 400,
                    headers: { 'Content-Type': 'text/plain' },
                });
            }

            const projectId = decodeURIComponent(pathParts[0]);
            const fileName = decodeURIComponent(pathParts.slice(1).join('/'));

            let filePath;

            if (routeType === 'audio') {
                // Serve audio stem from Library/{projectId}/{fileName}
                filePath = path.join(config.paths.library, projectId, fileName);
            } else if (routeType === 'waveform') {
                // Serve precomputed waveform JSON from Library/{projectId}/waveforms/{fileName}.json
                const waveformName = path.basename(fileName, path.extname(fileName)) + '.json';
                filePath = path.join(config.paths.library, projectId, 'waveforms', waveformName);
            } else {
                return new Response(`Unknown route type: ${routeType}`, {
                    status: 404,
                    headers: { 'Content-Type': 'text/plain' },
                });
            }

            // Security: prevent path traversal
            const resolvedPath = path.resolve(filePath);
            const resolvedBase = path.resolve(config.paths.library);
            if (!resolvedPath.startsWith(resolvedBase)) {
                return new Response('Forbidden: path traversal detected', {
                    status: 403,
                    headers: { 'Content-Type': 'text/plain' },
                });
            }

            // Check file exists
            if (!fs.existsSync(resolvedPath)) {
                return new Response(`File not found: ${fileName}`, {
                    status: 404,
                    headers: { 'Content-Type': 'text/plain' },
                });
            }

            // Stream the file
            return net.fetch(`file://${resolvedPath}`);

        } catch (err) {
            console.error('[Protocol] Error handling unweave:// request:', err);
            return new Response(`Internal error: ${err.message}`, {
                status: 500,
                headers: { 'Content-Type': 'text/plain' },
            });
        }
    });

    console.log('[Protocol] Registered unweave:// protocol');
}


/**
 * Register the scheme as privileged (must be done before app.ready).
 * This allows the Fetch API to work with unweave:// URLs.
 */
function registerScheme() {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: 'unweave',
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true, // Crucial for WaveSurfer/fetch()
                bypassCSP: true,
                stream: true,
            },
        },
    ]);
}

module.exports = { registerProtocol, registerScheme };
