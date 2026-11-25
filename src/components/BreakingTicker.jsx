import { formatTime } from '../api/newsApi';

export default function BreakingTicker({ articles, onArticleClick }) {
  if (!articles.length) return null;
  const items = articles.slice(0, 8);
  const line = (keyPrefix) => (
    <div key={keyPrefix} className="flex items-center gap-10 shrink-0 pr-10">
      {items.map((a, i) => (
        <button
          key={`${keyPrefix}-${a.url || i}`}
          onClick={() => onArticleClick(a)}
          className="whitespace-nowrap font-mono text-xs text-ink-2 hover:text-accent transition-colors"
        >
          <span className="text-ink-3">{a.source?.name || 'Wire'} · {formatTime(a.publishedAt)} — </span>
          {a.title}
        </button>
      ))}
    </div>
  );

  return (
    <div className="border-b border-hairline bg-raised" aria-label="Latest headlines">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-8 flex items-center gap-3 overflow-hidden ticker-hover">
        <span className="flex items-center gap-2 shrink-0">
          <span className="w-1.5 h-1.5 rounded-[2px] bg-accent" aria-hidden="true"></span>
          <span className="font-mono text-xs text-ink-3">Latest</span>
        </span>
        
        <div className="relative flex-1 overflow-hidden">
          <div className="animate-ticker flex w-max">
            {line('a')}
            {line('b')}
          </div>
        </div>
      </div>
    </div>
  );
}
