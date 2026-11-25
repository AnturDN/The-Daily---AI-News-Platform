import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function StatsModal({ stats, savedCount, onClose, onReset }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const top = (obj) => {
    const entries = Object.entries(obj || {});
    if (!entries.length) return null;
    return entries.sort((a, b) => b[1] - a[1])[0];
  };
  
  const topCategory = top(stats.categories);
  const topSource = top(stats.sources);

  const since = stats.since
    ? new Date(stats.since).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'today';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true"></div>

      <div
        className="relative w-full max-w-md bg-surface border border-hairline rounded-[10px] p-8 animate-rise-in"
        role="dialog"
        aria-modal="true"
        aria-label="Your reading stats"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-ink-3 hover:text-ink transition-colors"
          aria-label="Close stats"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        <p className="font-mono text-xs text-ink-3 mb-1">Your reading</p>
        <p className="font-serif text-2xl font-medium mb-1">The box score</p>
        <p className="font-mono text-xs text-ink-3 mb-8">since {since}</p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Articles read', value: stats.reads },
            { label: 'Saved', value: savedCount },
            { label: 'Searches', value: stats.searches },
          ].map(({ label, value }) => (
            <div key={label} className="border-t border-hairline pt-3">
              <p className="font-mono text-2xl tabular-nums text-ink">{value}</p>
              <p className="text-[13px] text-ink-3 mt-1">{label}</p>
            </div>
          ))}
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-3">Estimated reading</dt>
            <dd className="font-mono text-xs tabular-nums text-ink-2">{stats.minutes} min</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-3">Top category</dt>
            <dd className="text-ink-2 capitalize">{topCategory ? `${topCategory[0]} · ${topCategory[1]}` : '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-3">Most-read source</dt>
            <dd className="text-ink-2 truncate">{topSource ? `${topSource[0]} · ${topSource[1]}` : '—'}</dd>
          </div>
        </dl>

        <div className="mt-8 pt-4 border-t border-hairline flex justify-end">
          <button
            onClick={onReset}
            className="h-8 px-3 rounded-lg text-[13px] font-medium text-ink-3 hover:text-accent hover:bg-raised transition-colors"
          >
            Reset stats
          </button>
        </div>
      </div>
    </div>
  );
}
