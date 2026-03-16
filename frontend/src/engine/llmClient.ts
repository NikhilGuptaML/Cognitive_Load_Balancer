/**
 * LLM Client — on-device inference via RunAnywhere SDK TextGeneration.
 * Uses llama.cpp WASM, no backend needed.
 */

import { TextGeneration } from '@runanywhere/web-llamacpp';
import { ModelManager, ModelCategory, EventBus, MODEL_ID } from '../runanywhere';

export class LLMUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMUnavailableError';
  }
}

/**
 * Ensure the model is downloaded and loaded before generation.
 * Safe to call multiple times — idempotent.
 */
export async function ensureModelReady(
  onProgress?: (progress: number) => void
): Promise<void> {
  const models = ModelManager.getModels().filter(
    (m) => m.modality === ModelCategory.Language
  );
  const model = models[0];

  if (!model) {
    throw new LLMUnavailableError(
      'No language model registered. SDK may not have initialized correctly.'
    );
  }

  if (model.status !== 'downloaded' && model.status !== 'loaded') {
    let unsubscribe: (() => void) | undefined;
    if (onProgress) {
      const handler = (evt: { modelId: string; progress: number }) => {
        if (evt.modelId === MODEL_ID) onProgress(evt.progress ?? 0);
      };
      unsubscribe = EventBus.shared.on('model.downloadProgress', handler);
    }
    try {
      await ModelManager.downloadModel(MODEL_ID);
    } finally {
      unsubscribe?.();
    }
  }

  const loaded = ModelManager.getLoadedModel(ModelCategory.Language);
  if (!loaded || loaded.id !== MODEL_ID) {
    await ModelManager.loadModel(MODEL_ID);
  }
}

/**
 * Generate text with a hard timeout so the UI never hangs indefinitely.
 * On-device LLM inference on CPU can take 30-300s; we cap at 120s.
 */
export async function generate(
  prompt: string,
  options: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const TIMEOUT_MS = 120_000; // 2 minutes max

  const inferencePromise = TextGeneration.generate(prompt, {
    maxTokens: options.maxTokens ?? 256, // keep short for speed
    temperature: options.temperature ?? 0.2,
    systemPrompt: options.systemPrompt,
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('LLM inference timed out after 120s')), TIMEOUT_MS)
  );

  try {
    const result = await Promise.race([inferencePromise, timeoutPromise]);
    return result.text.trim();
  } catch (err) {
    throw new LLMUnavailableError(
      `LLM generation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Generate text and parse the first JSON object from the response.
 */
export async function generateJSON<T = Record<string, unknown>>(
  prompt: string,
  options: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  const response = await generate(prompt, options);
  const start = response.indexOf('{');
  const end = response.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object in LLM response: ${response.substring(0, 200)}`);
  }
  return JSON.parse(response.substring(start, end + 1)) as T;
}

/**
 * Keyword-overlap fallback grader — used when LLM is unavailable.
 */
export function simpleGrade(
  answerText: string,
  contextChunks: string[]
): { correct: boolean; score: number; explanation: string } {
  const answerTerms = new Set(
    answerText
      .split(/\s+/)
      .filter((t) => t.length > 3)
      .map((t) => t.toLowerCase())
  );

  const contextTerms = new Set(
    contextChunks
      .flatMap((chunk) => chunk.split(/\s+/))
      .filter((t) => t.length > 3)
      .map((t) => t.toLowerCase().replace(/[.,:;!?()[\]{}'\"]/g, ''))
  );

  let overlap = 0;
  for (const term of answerTerms) {
    if (contextTerms.has(term)) overlap++;
  }

  const score = Math.min(100, overlap * 12.5);
  return {
    correct: score >= 50,
    score: Math.round(score * 100) / 100,
    explanation:
      'Fallback grading was used (on-device model unavailable). Answers grounded in document concepts score higher.',
  };
}
