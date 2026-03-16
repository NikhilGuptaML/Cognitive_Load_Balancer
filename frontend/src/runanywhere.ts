/**
 * RunAnywhere SDK initialization and model catalog.
 * Call initSDK() once at app boot before any AI features.
 */

import {
  RunAnywhere,
  SDKEnvironment,
  ModelManager,
  ModelCategory,
  LLMFramework,
  EventBus,
  type CompactModelDef,
} from '@runanywhere/web';
import { LlamaCPP } from '@runanywhere/web-llamacpp';
import { LlamaCppBridge } from '@runanywhere/web-llamacpp';

const MODELS: CompactModelDef[] = [
  {
    id: 'lfm2-350m-q4_k_m',
    name: 'LFM2 350M Q4_K_M',
    repo: 'LiquidAI/LFM2-350M-GGUF',
    files: ['LFM2-350M-Q4_K_M.gguf'],
    framework: LLMFramework.LlamaCpp,
    modality: ModelCategory.Language,
    memoryRequirement: 250_000_000,
  },
];

/**
 * Override the WASM URL on LlamaCppBridge before register() is called.
 *
 * The SDK normally computes this as:
 *   new URL('../../wasm/racommons-llamacpp.js', import.meta.url)
 *
 * When Vite pre-bundles or transforms the package, import.meta.url shifts
 * to a shallower depth, producing the broken URL:
 *   /node_modules/wasm/racommons-llamacpp.js
 *
 * By hard-coding the URL here we bypass import.meta.url entirely and tell
 * the SDK exactly where to find the file. The Vite dev server serves both
 * the scoped path and /node_modules/wasm/ (via symlink), so either works.
 */
function patchWasmUrls() {
  const bridge = LlamaCppBridge.shared;
  // Use the explicit node_modules path — guaranteed to exist and be served
  bridge.wasmUrl =
    '/node_modules/@runanywhere/web-llamacpp/wasm/racommons-llamacpp.js';
  bridge.webgpuWasmUrl =
    '/node_modules/@runanywhere/web-llamacpp/wasm/racommons-llamacpp-webgpu.js';
}

let _initPromise: Promise<void> | null = null;

export async function initSDK(): Promise<void> {
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    await RunAnywhere.initialize({
      environment: SDKEnvironment.Development,
      debug: true,
    });

    // Patch WASM URLs BEFORE calling register() so the bridge never tries to
    // resolve them via import.meta.url
    try {
      patchWasmUrls();
    } catch (e) {
      console.warn('[runanywhere] Could not patch WASM URLs, using SDK defaults:', e);
    }

    await LlamaCPP.register();

    RunAnywhere.registerModels(MODELS);
  })();

  return _initPromise;
}

export const MODEL_ID = 'lfm2-350m-q4_k_m';

export { RunAnywhere, ModelManager, ModelCategory, EventBus, LlamaCPP };
