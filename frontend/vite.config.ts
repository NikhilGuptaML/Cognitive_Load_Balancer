/* Vite config for Cognitive Load Balancer — browser-only build with RunAnywhere SDK WASM support. */

import { defineConfig, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { ServerResponse } from 'http';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const LLAMACPP_WASM_DIR = path.resolve(
  __dir,
  'node_modules/@runanywhere/web-llamacpp/wasm'
);

/**
 * In dev mode, the SDK uses dynamic import() to load racommons-llamacpp.js
 * from a path relative to the package — which Vite resolves to a URL like
 *   /node_modules/wasm/racommons-llamacpp.js
 * or
 *   /node_modules/@runanywhere/web-llamacpp/wasm/racommons-llamacpp.js
 *
 * Vite's dev server won't serve these by default. This plugin intercepts
 * any request for those files and streams them from disk.
 */
function serveWasmDevPlugin(): Plugin {
  return {
    name: 'serve-wasm-dev',
    configureServer(server) {
      server.middlewares.use((req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        const url = req.url ?? '';

        // Match any path that ends with one of the WASM bundle files
        const wasmFiles = [
          'racommons-llamacpp.js',
          'racommons-llamacpp.wasm',
          'racommons-llamacpp-webgpu.js',
          'racommons-llamacpp-webgpu.wasm',
        ];

        const matchedFile = wasmFiles.find((f) => url.endsWith(f) || url.includes(f + '?'));
        if (!matchedFile) {
          next();
          return;
        }

        // Strip query params to get the plain filename
        const filename = matchedFile;
        const filePath = path.join(LLAMACPP_WASM_DIR, filename);

        if (!fs.existsSync(filePath)) {
          next();
          return;
        }

        const contentType = filename.endsWith('.wasm')
          ? 'application/wasm'
          : 'application/javascript';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      });
    },
  };
}

/**
 * Copies WASM binaries from @runanywhere npm packages into dist/assets/
 * for production builds. In dev mode the middleware above serves them.
 */
function copyWasmPlugin(): Plugin {
  return {
    name: 'copy-wasm',
    writeBundle(options) {
      const outDir = options.dir ?? path.resolve(__dir, 'dist');
      const assetsDir = path.join(outDir, 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });

      for (const file of [
        'racommons-llamacpp.wasm',
        'racommons-llamacpp.js',
        'racommons-llamacpp-webgpu.wasm',
        'racommons-llamacpp-webgpu.js',
      ]) {
        const src = path.join(LLAMACPP_WASM_DIR, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(assetsDir, file));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), serveWasmDevPlugin(), copyWasmPlugin()],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    fs: {
      // Allow Vite dev server to access files outside of src/
      allow: ['..'],
    },
  },
  assetsInclude: ['**/*.wasm'],
  worker: { format: 'es' },
  optimizeDeps: {
    // CRITICAL: exclude WASM packages from pre-bundling so import.meta.url
    // resolves correctly for automatic WASM file discovery
    exclude: ['@runanywhere/web-llamacpp'],
  },
});
