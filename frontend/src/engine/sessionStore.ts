/**
 * Session Store — replaces backend/core/session_manager.py + backend/db/
 * In-memory session state with localStorage persistence for session reports.
 */

import type { Band } from './loadAggregator';

export interface StudySession {
  id: string;
  userId: string;
  docId: string;
  pomodoroLength: number;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'completed';
}

export interface LoadEvent {
  timestamp: string;
  keystrokeScore: number | null;
  faceScore: number | null;
  latencyScore: number | null;
  compositeScore: number;
  band: Band;
  signalsActive: string[];
}

export interface StoredQuestion {
  id: string;
  sessionId: string;
  text: string;
  band: Band;
  loadAtTime: number;
  askedAt: string;
  hint: string | null;
}

export interface StoredAnswer {
  id: number;
  questionId: string;
  sessionId: string;
  answerText: string;
  latencyMs: number;
  correct: boolean;
  score: number;
}

export interface BandChangeRecord {
  timestamp: string;
  fromBand: Band | null;
  toBand: Band;
  triggerScore: number;
  reason: string;
}

export interface SessionReport {
  sessionId: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  avgLoad: number;
  accuracy: number;
  answerCount: number;
  correctCount: number;
  loadSeries: LoadEvent[];
  bandChanges: BandChangeRecord[];
  recentQuestions: Array<{ id: string; text: string; band: string; hint: string | null }>;
}

const STORAGE_KEY = 'clb.sessionStore';

class SessionStore {
  private sessions: Map<string, StudySession> = new Map();
  private loadEvents: Map<string, LoadEvent[]> = new Map();
  private questions: Map<string, StoredQuestion[]> = new Map();
  private answers: Map<string, StoredAnswer[]> = new Map();
  private bandChanges: Map<string, BandChangeRecord[]> = new Map();
  private answerIdCounter = 0;

  constructor() {
    this.loadFromStorage();
  }

  /* ---- Session lifecycle ---- */

  createSession(userId: string, docId: string, pomodoroLength: number): StudySession {
    const id = crypto.randomUUID();
    const session: StudySession = {
      id,
      userId,
      docId,
      pomodoroLength,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'active',
    };
    this.sessions.set(id, session);
    this.loadEvents.set(id, []);
    this.questions.set(id, []);
    this.answers.set(id, []);
    this.bandChanges.set(id, []);
    this.persist();
    return session;
  }

  endSession(sessionId: string): StudySession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.status = 'completed';
    session.endedAt = new Date().toISOString();
    this.persist();
    return session;
  }

  getSession(sessionId: string): StudySession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /* ---- Load events ---- */

  recordLoadEvent(
    sessionId: string,
    event: Omit<LoadEvent, 'timestamp'>
  ): void {
    const events = this.loadEvents.get(sessionId);
    if (!events) return;

    const fullEvent: LoadEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    // Check for band change
    const previousBand = events.length > 0 ? events[events.length - 1].band : null;
    if (previousBand !== event.band) {
      this.recordBandChange(sessionId, previousBand, event.band, event.compositeScore, 'signal_update');
    }

    events.push(fullEvent);
    // Don't persist on every load event (too frequent); persist periodically
  }

  /* ---- Questions ---- */

  recordQuestion(question: StoredQuestion): void {
    const list = this.questions.get(question.sessionId);
    if (list) list.push(question);
    this.persist();
  }

  getRecentQuestions(sessionId: string, limit = 5): StoredQuestion[] {
    const list = this.questions.get(sessionId) ?? [];
    return list.slice(-limit).reverse();
  }

  /* ---- Answers ---- */

  recordAnswer(answer: Omit<StoredAnswer, 'id'>): StoredAnswer {
    this.answerIdCounter += 1;
    const full: StoredAnswer = { ...answer, id: this.answerIdCounter };
    const list = this.answers.get(answer.sessionId);
    if (list) list.push(full);
    this.persist();
    return full;
  }

  /* ---- Band changes ---- */

  private recordBandChange(
    sessionId: string,
    fromBand: Band | null,
    toBand: Band,
    triggerScore: number,
    reason: string
  ): void {
    const list = this.bandChanges.get(sessionId);
    if (!list) return;
    list.push({
      timestamp: new Date().toISOString(),
      fromBand,
      toBand,
      triggerScore,
      reason,
    });
  }

  /* ---- Report ---- */

  buildSessionReport(sessionId: string): SessionReport {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found.');

    const events = this.loadEvents.get(sessionId) ?? [];
    const answerList = this.answers.get(sessionId) ?? [];
    const changes = this.bandChanges.get(sessionId) ?? [];
    const questionList = this.questions.get(sessionId) ?? [];

    const avgLoad =
      events.length > 0
        ? Math.round(
            (events.reduce((sum, e) => sum + e.compositeScore, 0) / events.length) * 100
          ) / 100
        : 0;

    const answerCount = answerList.length;
    const correctCount = answerList.filter((a) => a.correct).length;
    const accuracy = answerCount > 0 ? Math.round((correctCount / answerCount) * 10000) / 100 : 0;

    return {
      sessionId: session.id,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      avgLoad,
      accuracy,
      answerCount,
      correctCount,
      loadSeries: events.map((e) => ({
        timestamp: e.timestamp,
        keystrokeScore: e.keystrokeScore,
        faceScore: e.faceScore,
        latencyScore: e.latencyScore,
        compositeScore: e.compositeScore,
        band: e.band,
        signalsActive: e.signalsActive,
      })),
      bandChanges: changes.map((c) => ({
        timestamp: c.timestamp,
        fromBand: c.fromBand,
        toBand: c.toBand,
        triggerScore: c.triggerScore,
        reason: c.reason,
      })),
      recentQuestions: questionList.slice(-5).reverse().map((q) => ({
        id: q.id,
        text: q.text,
        band: q.band,
        hint: q.hint,
      })),
    };
  }

  /* ---- Persistence ---- */

  persist(): void {
    try {
      const data = {
        sessions: Object.fromEntries(this.sessions),
        answerIdCounter: this.answerIdCounter,
        answers: Object.fromEntries(
          Array.from(this.answers.entries()).map(([k, v]) => [k, v])
        ),
        questions: Object.fromEntries(
          Array.from(this.questions.entries()).map(([k, v]) => [k, v])
        ),
        bandChanges: Object.fromEntries(
          Array.from(this.bandChanges.entries()).map(([k, v]) => [k, v])
        ),
        // Don't persist load events (too large, not critical)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage may be full or unavailable — degrade gracefully
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (data.sessions) {
        for (const [k, v] of Object.entries(data.sessions)) {
          this.sessions.set(k, v as StudySession);
          if (!this.loadEvents.has(k)) this.loadEvents.set(k, []);
        }
      }
      if (data.answerIdCounter) this.answerIdCounter = data.answerIdCounter;
      if (data.answers) {
        for (const [k, v] of Object.entries(data.answers)) {
          this.answers.set(k, v as StoredAnswer[]);
        }
      }
      if (data.questions) {
        for (const [k, v] of Object.entries(data.questions)) {
          this.questions.set(k, v as StoredQuestion[]);
        }
      }
      if (data.bandChanges) {
        for (const [k, v] of Object.entries(data.bandChanges)) {
          this.bandChanges.set(k, v as BandChangeRecord[]);
        }
      }
    } catch {
      // Corrupted storage — start fresh
    }
  }
}

/** Singleton instance shared across the app. */
export const sessionStore = new SessionStore();
