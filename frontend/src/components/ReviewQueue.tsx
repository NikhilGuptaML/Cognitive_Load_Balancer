/* Shows the next revision date for correct and incorrect answers. Displays "Due now" when the revision time has passed, otherwise shows the scheduled date/time. Shows "None" until the first matching answer is submitted. */

type ReviewQueueProps = {
  correctRevisionDate: Date | null;
  incorrectRevisionDate: Date | null;
};

function formatDateTime(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function isOverdue(date: Date): boolean {
  return date.getTime() <= Date.now();
}

export function ReviewQueue({ correctRevisionDate, incorrectRevisionDate }: ReviewQueueProps) {
  return (
    <div className="glass-panel rounded-[2rem] p-6 float-in stagger-3">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
        Review Schedule
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {/* Correct — 1 week out */}
        <div className="rounded-[1.5rem] bg-white/70 p-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Correct Revision (1 week)
            </p>
          </div>
          <p className={`mt-3 text-lg font-semibold ${correctRevisionDate && isOverdue(correctRevisionDate) ? 'text-emerald-600' : 'text-slate-900'}`}>
            {correctRevisionDate
              ? isOverdue(correctRevisionDate)
                ? 'Due now'
                : formatDateTime(correctRevisionDate)
              : 'None'}
          </p>
          {correctRevisionDate && !isOverdue(correctRevisionDate) && (
            <p className="mt-1 text-xs text-slate-400">{formatDateTime(correctRevisionDate)}</p>
          )}
        </div>

        {/* Incorrect — 1 day out */}
        <div className="rounded-[1.5rem] bg-white/70 p-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Incorrect Revision (1 day)
            </p>
          </div>
          <p className={`mt-3 text-lg font-semibold ${incorrectRevisionDate && isOverdue(incorrectRevisionDate) ? 'text-rose-600' : 'text-slate-900'}`}>
            {incorrectRevisionDate
              ? isOverdue(incorrectRevisionDate)
                ? 'Due now'
                : formatDateTime(incorrectRevisionDate)
              : 'None'}
          </p>
          {incorrectRevisionDate && !isOverdue(incorrectRevisionDate) && (
            <p className="mt-1 text-xs text-slate-400">{formatDateTime(incorrectRevisionDate)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
