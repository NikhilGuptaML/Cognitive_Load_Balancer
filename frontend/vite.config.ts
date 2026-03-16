/* Vite config for Cognitive Load Balancer — browser-only build with RunAnywhere SDK WASM support. */

/**
 * ROOT CAUSE OF THE WASM ERROR
 * ─────────────────────────────
 * LlamaCppBridge.js (inside @runanywhere/web-llamacpp) resolves the WASM URL as:
 *
 *   new URL('../../wasm/racommons-llamacpp.js', import.meta.url).href
 *
 * The file lives at:  dist/Foundation/LlamaCppBridge.js
 * Two levels up  →    @runanywhere/web-llamacpp/wasm/racommons-llamacpp.js  ✓
 *
 * BUT when Vite pre-bundles this package it places the transformed file at a
 * shallower path inside .vite cache, so the browser ends up requesting:
 *
 *   /node_modules/wasm/racommons-llamacpp.js   ← non-existent path
 *
 * FIX (two-pronged):
 *   1. Create a node_modules/wasm → real WASM dir symlink on every server start
 *      so that broken URL actually resolves to a real file on disk.
 *   2. Add a catch-all middleware that intercepts ANY request whose filename
 *      matches a known WASM file and streams it from the real directory —
 *      covering every URL variant the SDK might generate.
 */

import { defineConfig, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { ServerResponse, IncomingMessage } from 'http';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const NODE_MODULES = path.resolve(__dir, 'node_modules');

// Real location of the WASM binaries inside the npm package
const LLAMACPP_WASM_DIR = path.resolve(
  NODE_MODULES,
  '@runanywhere/web-llamacpp/wasm'
);

// The short path that the SDK requests after Vite rewrites import.meta.url
// (two levels up from dist/Foundation/ inside the pre-bundle output → /node_modules/wasm/)
const WASM_SYMLINK = path.resolve(NODE_MODULES, 'wasm');

// All filenames the SDK may request dynamically
const WASM_FILES = [
  'racommons-llamacpp.js',
  'racommons-llamacpp.wasm',
  'racommons-llamacpp-webgpu.js',
  'racommons-llamacpp-webgpu.wasm',
];

// ─── Util: ensure node_modules/wasm symlink is correct ──────────────────────

function ensureWasmSymlink() {
  try {
    if (fs.existsSync(WASM_SYMLINK)) {
      const stat = fs.lstatSync(WASM_SYMLINK);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(WASM_SYMLINK);
        if (target === LLAMACPP_WASM_DIR) return; // already correct
        fs.unlinkSync(WASM_SYMLINK);
      } else {
        return; // real directory — leave it
      }
    }
    fs.symlinkSync(LLAMACPP_WASM_DIR, WASM_SYMLINK, 'dir');
    console.log(`[wasm-fix] symlink created: ${WASM_SYMLINK} → ${LLAMACPP_WASM_DIR}`);
  } catch (e) {
    console.error('[wasm-fix] Could not create symlink:', e);
  }
}

// ─── Plugin 1: COOP/COEP headers on EVERY response ──────────────────────────
// SharedArrayBuffer requires the page to be cross-origin isolated.
// Browsers only grant this when BOTH headers are present on the HTML document
// and all sub-resources.  We inject them ahead of all other middleware.

function crossOriginIsolationPlugin(): Plugin {
  return {
    name: 'cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        next();
      });
    },
  };
}

// ─── Plugin 2: Serve WASM files from the real package directory ──────────────
// Intercepts requests whose last path segment is a known WASM filename and
// streams the file from LLAMACPP_WASM_DIR, regardless of the URL prefix.
// This handles ALL variants:
//   /node_modules/wasm/racommons-llamacpp.js          ← pre-bundle broken URL
//   /node_modules/@runanywhere/web-llamacpp/wasm/...  ← correct URL
//   /@fs/.../wasm/racommons-llamacpp.js               ← Vite /@fs/ rewrite

function serveWasmDevPlugin(): Plugin {
  return {
    name: 'serve-wasm-dev',
    configureServer(server) {
      // Always recreate the symlink so it survives npm install
      ensureWasmSymlink();

      server.middlewares.use((req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        const urlPath = (req.url ?? '').split('?')[0];
        const basename = urlPath.split('/').pop() ?? '';

        if (!WASM_FILES.includes(basename)) {
          next();
          return;
        }

        const filePath = path.join(LLAMACPP_WASM_DIR, basename);

        if (!fs.existsSync(filePath)) {
          console.error(`[serve-wasm-dev] missing: ${filePath}`);
          res.statusCode = 404;
          res.end(`Not found: ${basename}`);
          return;
        }

        console.log(`[serve-wasm-dev] ${urlPath} → ${filePath}`);

        const contentType = basename.endsWith('.wasm')
          ? 'application/wasm'
          : 'application/javascript';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cache-Control', 'no-store');

        const stream = fs.createReadStream(filePath);
        stream.on('error', (err) => {
          console.error('[serve-wasm-dev] stream error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
        stream.pipe(res);
      });
    },
  };
}

// ─── Plugin 3: Copy WASM into dist/assets/ for production builds ─────────────

function copyWasmPlugin(): Plugin {
  return {
    name: 'copy-wasm',
    writeBundle(options) {
      const outDir = options.dir ?? path.resolve(__dir, 'dist');
      const assetsDir = path.join(outDir, 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });

      for (const file of WASM_FILES) {
        const src = path.join(LLAMACPP_WASM_DIR, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(assetsDir, file));
          console.log(`[copy-wasm] ${file} → ${assetsDir}`);
        }
      }
    },
  };
}

// ─── Vite config ─────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [
    crossOriginIsolationPlugin(), // first — headers before anything else
    react(),
    serveWasmDevPlugin(),         // intercepts WASM fetches before Vite 404s them
    copyWasmPlugin(),
  ],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      allow: ['..'],
      strict: false, // follow symlinks that resolve outside project root
    },
  },
  assetsInclude: ['**/*.wasm'],
  worker: { format: 'es' },
  optimizeDeps: {
    // Keep the llamacpp package out of pre-bundling.
    // Pre-bundling rewrites import.meta.url depth, which is what causes the
    // broken /node_modules/wasm/ URL in the first place.
    // The symlink above catches that broken URL as the safety net.
    exclude: ['@runanywhere/web-llamacpp'],
  },
});
