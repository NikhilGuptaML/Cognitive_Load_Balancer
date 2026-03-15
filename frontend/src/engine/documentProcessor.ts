/**
 * Document Processor — ported from backend/core/document_processor.py
 * PDF extraction (via pdf.js), text chunking, and TF-IDF keyword-based context retrieval.
 * Replaces PyMuPDF + ChromaDB + sentence-transformers with pure browser logic.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface DocumentIndex {
  id: string;
  filename: string;
  chunks: string[];
  /** TF-IDF term frequencies per chunk, precomputed for fast retrieval. */
  chunkTermFreqs: Map<string, number>[];
}

/* ---- PDF extraction ---- */

async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n');
}

/* ---- Text chunking ---- */

function chunkText(text: string, chunkSize = 512, overlap = 50): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunk = words.slice(start, end).join(' ').trim();
    if (chunk) chunks.push(chunk);
    if (end >= words.length) break;
    start = end - overlap;
  }

  return chunks;
}

/* ---- TF-IDF retrieval helpers ---- */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function buildTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}

function cosineSimilarity(
  queryTf: Map<string, number>,
  chunkTf: Map<string, number>
): number {
  let dotProduct = 0;
  let queryMag = 0;
  let chunkMag = 0;

  for (const [term, freq] of queryTf) {
    queryMag += freq * freq;
    const chunkFreq = chunkTf.get(term) ?? 0;
    dotProduct += freq * chunkFreq;
  }

  for (const [, freq] of chunkTf) {
    chunkMag += freq * freq;
  }

  if (queryMag === 0 || chunkMag === 0) return 0;
  return dotProduct / (Math.sqrt(queryMag) * Math.sqrt(chunkMag));
}

/* ---- Public API ---- */

const indexStore = new Map<string, DocumentIndex>();

export async function indexDocument(
  file: File,
  sessionId: string
): Promise<DocumentIndex> {
  const sourceText = (await extractTextFromPdf(file)).trim();
  if (!sourceText) {
    throw new Error('The uploaded document did not contain extractable text.');
  }

  const chunks = chunkText(sourceText);
  if (chunks.length === 0) {
    throw new Error('Document chunking produced no usable text segments.');
  }

  const chunkTermFreqs = chunks.map((chunk) => buildTermFrequency(tokenize(chunk)));

  const index: DocumentIndex = {
    id: sessionId,
    filename: file.name,
    chunks,
    chunkTermFreqs,
  };

  indexStore.set(sessionId, index);
  return index;
}

export function retrieveContext(
  sessionId: string,
  topic: string,
  k = 3
): string[] {
  const index = indexStore.get(sessionId);
  if (!index) {
    throw new Error(`Document index for session '${sessionId}' was not found.`);
  }

  const queryTokens = tokenize(topic.trim() || 'core concepts');
  const queryTf = buildTermFrequency(queryTokens);

  const scored = index.chunks.map((chunk, i) => ({
    chunk,
    score: cosineSimilarity(queryTf, index.chunkTermFreqs[i]),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map((s) => s.chunk);
}

export function getDocumentIndex(sessionId: string): DocumentIndex | null {
  return indexStore.get(sessionId) ?? null;
}
