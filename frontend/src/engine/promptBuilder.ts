/**
 * Prompt Builder — ported from backend/llm/prompt_builder.py
 * Renders structured prompts for question generation and answer evaluation.
 */

import type { BandConfig } from './difficultyController';

export function renderQuestionPrompt(
  band: string,
  config: BandConfig,
  contextChunks: string[],
  history: Array<{ question: string; band: string; hint: string | null }>
): string {
  const contextBlock =
    contextChunks.length > 0
      ? contextChunks.map((chunk, i) => `Chunk ${i + 1}: ${chunk}`).join('\n\n')
      : 'No context available.';

  const historyBlock =
    history.length > 0 ? JSON.stringify(history.slice(-3), null, 2) : '[]';

  return `You are the Cognitive Load Balancer's local tutor.
Return valid JSON only with keys: question_text, hint.

Current load band: ${band}
Band configuration: ${JSON.stringify(config)}
Recent question history: ${historyBlock}

Context:
${contextBlock}

Requirements:
- Generate exactly one question.
- Match the difficulty to the band configuration.
- Prefer one of these question types: ${config.questionTypes.join(', ')}.
- Use the Bloom level ${config.bloomLevel}.
- Scaffolding level must be ${config.scaffolding}.
- Keep the hint short and actionable.`;
}

export function renderAnswerEvaluationPrompt(
  questionText: string,
  answerText: string,
  contextChunks: string[]
): string {
  const contextBlock = contextChunks.length > 0 ? contextChunks.join('\n\n') : 'No context available.';

  return `You are grading a student's answer offline.
Return valid JSON only with keys: correct, score, explanation.

Question:
${questionText}

Student answer:
${answerText}

Reference context:
${contextBlock}

Scoring rules:
- score must be from 0 to 100.
- correct should be true when the answer is substantially correct.
- explanation should be 1-3 sentences.`;
}
