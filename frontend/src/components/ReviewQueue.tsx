/* This component shows a minimal timer panel for the next upcoming correct and wrong question reviews. Polls /reviews every 30s, ticks countdown every second. Shows "None" if no reviews are scheduled. */

import { useEffect, useRef, useState } from 'react';

type ReviewItem = {
  question_id: string;
  next_review_at: number;
  was_correct: number; // 0=wrong, 1=partial, 2=correct
};

type ReviewResponse = {
  reviews: ReviewItem[];
};

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Due now';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function ReviewQueue({ sessionId }: { sessionId: string }) {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const pollRef = useRef<number>();
  const tickRef = useRef<number>();

  // Poll backend every 30s
  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const res = await fetch(`/reviews?session_id=${sessionId}`);
        if (res.ok) {
          const data = (await res.json()) as ReviewResponse;
          setReviews(data.reviews);
        }
      } catch {
        // silently ignore
      }
    };
    void fetchReviews();
    pollRef.current = window.setInterval(() => void fetchReviews(), 30_000);
    return () => window.clearInterval(pollRef.current);
  }, [sessionId]);

  // Tick every second
  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(tickRef.current);
  }, []);

  // Find the next wrong/partial review (was_correct < 2)
  const nextWrong = reviews
    .filter((r) => r.was_correct < 2)
    .sort((a, b) => a.next_review_at - b.next_review_at)[0] ?? null;

  // Find the next correct review (was_correct === 2)
  const nextCorrect = reviews
    .filter((r) => r.was_correct === 2)
    .sort((a, b) => a.next_review_at - b.next_review_at)[0] ?? null;

  const wrongSeconds = nextWrong ? Math.max(0, nextWrong.next_review_at - now) : null;
  const correctSeconds = nextCorrect ? Math.max(0, nextCorrect.next_review_at - now) : null;

  return (
    <div className="glass-panel rounded-[2rem] p-6 float-in stagger-3">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
        Review Schedule
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {/* Wrong / Partial — coming back soon */}
        <div className="rounded-[1.5rem] bg-white/70 p-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Next Wrong Review
            </p>
          </div>
          <p className={`mt-3 text-2xl font-semibold tabular-nums ${
            wrongSeconds !== null && wrongSeconds <= 0 ? 'text-rose-600' : 'text-slate-900'
          }`}>
            {wrongSeconds !== null ? formatCountdown(wrongSeconds) : 'None'}
          </p>
        </div>

        {/* Correct — scheduled later */}
        <div className="rounded-[1.5rem] bg-white/70 p-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Next Correct Review
            </p>
          </div>
          <p className={`mt-3 text-2xl font-semibold tabular-nums ${
            correctSeconds !== null && correctSeconds <= 0 ? 'text-emerald-600' : 'text-slate-900'
          }`}>
            {correctSeconds !== null ? formatCountdown(correctSeconds) : 'None'}
          </p>
        </div>
      </div>
    </div>
  );
}
