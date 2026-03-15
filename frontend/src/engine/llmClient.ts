/**
 * LLM Client — replaces backend/llm/ollama_client.py
 * Uses RunAnywhere SDK TextGeneration for on-device inference via llama.cpp WASM.
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
 * Returns a progress callback unsubscribe function while downloading.
 */
export async function ensureModelReady(
  onProgress?: (progress: number) => void
): Promise<void> {
  const models = ModelManager.getModels().filter(
    (m) => m.modality === ModelCategory.Language
  );
  const model = models[0];

  if (!model) {
    throw new LLMUnavailableError('No language model registered.');
  }

  if (model.status !== 'downloaded' && model.status !== 'loaded') {
    // Set up progress tracking
    let unsubscribe: (() => void) | undefined;
    if (onProgress) {
      const handler = (evt: { modelId: string; progress: number }) => {
        if (evt.modelId === MODEL_ID) {
          onProgress(evt.progress ?? 0);
        }
      };
      // .on() returns an unsubscribe function — there is no .off()
      unsubscribe = EventBus.shared.on('model.downloadProgress', handler);
    }

    try {
      await ModelManager.downloadModel(MODEL_ID);
    } finally {
      unsubscribe?.();
    }
  }

  // Load model into WASM engine if not already loaded
  const loaded = ModelManager.getLoadedModel(ModelCategory.Language);
  if (!loaded || loaded.id !== MODEL_ID) {
    await ModelManager.loadModel(MODEL_ID);
  }
}

/**
 * Generate text using the on-device LLM.
 */
export async function generate(
  prompt: string,
  options: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  try {
    const result = await TextGeneration.generate(prompt, {
      maxTokens: options.maxTokens ?? 512,
      temperature: options.temperature ?? 0.2,
      systemPrompt: options.systemPrompt,
    });
    return result.text.trim();
  } catch (err) {
    throw new LLMUnavailableError(
      `LLM generation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Generate text and parse the result as JSON.
 * Extracts the first JSON object from the response.
 */
export async function generateJSON<T = Record<string, unknown>>(
  prompt: string,
  options: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  const response = await generate(prompt, options);
  try {
    const start = response.indexOf('{');
    const end = response.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
      throw new Error('No JSON object found in response.');
    }
    return JSON.parse(response.substring(start, end + 1)) as T;
  } catch (err) {
    throw new Error(`LLM response was not valid JSON: ${response}`);
  }
}

/**
 * Simple fallback grader when LLM is unavailable.
 * Uses keyword overlap between answer and context (same logic as Python backend).
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
      .map((t) => t.toLowerCase().replace(/[.,:;!?()[\]{}'"]/g, ''))
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
      'Fallback grading was used because the local model was unavailable. Answers with more document-grounded concepts score higher.',
  };
}
