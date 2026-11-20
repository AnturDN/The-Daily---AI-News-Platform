import { useState, useEffect, useRef } from 'react';
import { X, Loader2, ExternalLink, Share2, Bookmark, Minus, Plus, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { formatTime, readingTime } from '../api/newsApi';
import useOgImage from '../hooks/useOgImage';
import {
  AI_RETRYABLE, AI_STATUS_MESSAGES,
  classifyAiError, summarizeArticle, offlineDigest,
  readSummaryCache, writeSummaryCache,
} from '../api/aiSummary';

/* The summary itself is served by the same-origin /api/ai-summary relay —
   the Groq and Gemini keys live server-side (Vercel Environment Variables),
   never in the browser bundle. */

const actionBtn =
  'h-8 px-2 rounded-md text-[13px] font-medium text-ink-2 hover:bg-raised hover:text-ink transition-colors inline-flex items-center gap-1.5';

export default function ArticleModal({
  article, articles, onClose, onNavigate,
  isBookmarked, onToggleBookmark, onShare,
  fontScale, setFontScale,
}) {
  
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null); // { kind, message } — never a raw provider string
  const [aiFromCache, setAiFromCache] = useState(false);
  const [aiAttempt, setAiAttempt] = useState(0);
  const [progress, setProgress] = useState(0);

  const sheetRef = useRef(null);
  const heroImage = useOgImage(article);

  const index = articles.findIndex((a) => a.url === article.url);
  const canPrev = index > 0;
  const canNext = index !== -1 && index < articles.length - 1;

  /* ---------- lifecycle ---------- */

  // Lock page scroll while the sheet is open.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  // A different article: reset the progress and the summary (render-time
  // adjust), then let the effects below handle the external systems.
  const [prevArticle, setPrevArticle] = useState(article);
  if (article !== prevArticle) {
    setPrevArticle(article);
    setProgress(0);
    setAiSummary(null); // the old article's summary must not bleed into the new one
    setAiError(null);
    setAiFromCache(false);
  }

  // New article: turn the page back to the top.
  useEffect(() => {
    sheetRef.current?.scrollTo({ top: 0 });
  }, [article]);

  // Keyboard: Esc close, arrows navigate, b saves, s shares.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (inField) return;
      if (e.key === 'ArrowLeft' && canPrev) { onNavigate(index - 1); return; }
      if (e.key === 'ArrowRight' && canNext) { onNavigate(index + 1); return; }
      if (e.key === 'b') { onToggleBookmark(article); return; }
      if (e.key === 's') { onShare(article); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers rebind per state via deps below
  }, [article, index, canPrev, canNext, isBookmarked, articles]);

  // Reading progress follows the sheet's scroll.
  const handleScroll = (e) => {
    const el = e.target;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
  };

 
  useEffect(() => {
    const controller = new AbortController();

    const handleAiFetch = async () => {
      setAiLoading(true);
      setAiError(null);
      setAiFromCache(false);

      const cached = readSummaryCache(article.url);
      if (cached) {
        setAiSummary(cached);
        setAiFromCache(true);
        setAiLoading(false);
        return;
      }

      try {
        const result = await summarizeArticle(article, controller.signal);
        setAiSummary(result);
        writeSummaryCache(article.url, result);
      } catch (err) {
        if (err.name === 'AbortError') return; // sheet closed or article changed
        const kind = err.kind || classifyAiError(err.message);
        console.warn('AI summary unavailable:', err.message || err);
        setAiError({
          kind,
          // err.friendly may carry the exact message to show (never a bare flag)
          message: (typeof err.friendly === 'string' && err.friendly)
            || AI_STATUS_MESSAGES[kind]
            || AI_STATUS_MESSAGES.other,
        });
      } finally {
        if (!controller.signal.aborted) setAiLoading(false);
      }
    };

    handleAiFetch();
    return () => controller.abort();
  }, [article, aiAttempt]);

  // The quota-free digest, shown whenever no model summary could land.
  const digest = (!aiLoading && !aiSummary) ? offlineDigest(article) : null;


  const providerBadge = (provider) => {
    if (!provider) return null;
    const label = provider === 'groq' ? 'Groq' : provider === 'gemini' ? 'Gemini' : provider;
    return (
      <span className="ml-2 font-mono text-[11px] font-normal text-ink-3">· {label}</span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true"></div>

      <div
        className="relative w-full max-w-2xl bg-surface h-full border-l border-hairline animate-slide-in"
        role="dialog"
        aria-modal="true"
        aria-label={article.title}
      >
        <div className="absolute top-0 inset-x-0 z-20 h-0.5" aria-hidden="true">
          <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }}></div>
        </div>

        <button
          onClick={onClose}
          className="absolute cursor-pointer top-5 right-5 p-2 rounded-lg text-ink-3 hover:text-ink transition-colors z-10 bg-surface"
          aria-label="Close article"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        <div ref={sheetRef} onScroll={handleScroll} className="h-full overflow-y-auto p-6 md:p-10 pb-8">
          <p className="font-mono text-xs text-ink-3 mb-3 pr-12">
            {article.source?.name || 'Unknown source'} · {formatTime(article.publishedAt)} · {readingTime(article)} min read
          </p>

          <div className="flex items-center gap-1 mb-6 pr-12 flex-wrap">
            <button onClick={() => onShare(article)} className={actionBtn} aria-label="Share this article">
              <Share2 size={16} strokeWidth={1.5} /> Share
            </button>
            <button onClick={() => onToggleBookmark(article)} className={actionBtn} aria-label={isBookmarked ? 'Remove from saved' : 'Save article'}>
              <Bookmark size={16} strokeWidth={1.5} className={isBookmarked ? 'fill-accent text-accent' : ''} />
              {isBookmarked ? 'Saved' : 'Save'}
            </button>

            <span className="flex-1"></span>

            <button
              onClick={() => setFontScale((s) => Math.max(0.9, +(s - 0.1).toFixed(2)))}
              className="h-8 w-8 grid place-items-center rounded-md text-ink-3 hover:bg-raised hover:text-ink transition-colors"
              aria-label="Smaller text"
            >
              <Minus size={16} strokeWidth={1.5} />
            </button>
            <span className="font-mono text-xs text-ink-3 tabular-nums w-10 text-center">{fontScale.toFixed(2).replace(/0$/, '')}×</span>
            <button
              onClick={() => setFontScale((s) => Math.min(1.4, +(s + 0.1).toFixed(2)))}
              className="h-8 w-8 grid place-items-center rounded-md text-ink-3 hover:bg-raised hover:text-ink transition-colors"
              aria-label="Larger text"
            >
              <Plus size={16} strokeWidth={1.5} />
            </button>
          </div>

          <h2 className="font-serif text-3xl font-medium leading-tight mb-6 pr-8">
            {article.title}
          </h2>

          {heroImage && (
            <img
              src={heroImage}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="w-full h-72 object-cover mb-8 bg-raised"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}

          <div style={{ fontSize: `${fontScale}rem` }}>
            <p className="font-serif leading-relaxed text-ink-2 mb-8" style={{ fontSize: '1.125em' }}>
              {article.description}
            </p>

            <div className="border-t border-hairline pt-8 mt-4">
              <h3 className="text-[13px] font-medium text-ink-2 mb-4">
                AI summary
                {aiFromCache && (
                  <span className="ml-2 font-mono text-[11px] font-normal text-ink-3">· cached</span>
                )}
                {providerBadge(aiSummary?.provider)}
              </h3>

              {aiLoading && (
                <div className="flex items-center gap-2 text-ink-3 text-sm">
                  <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> Generating summary
                </div>
              )}

              {aiError && !aiLoading && !digest && (
                <div>
                  <p className="text-sm text-ink-3 leading-relaxed">{aiError.message}</p>
                  {AI_RETRYABLE.has(aiError.kind) && (
                    <button
                      onClick={() => setAiAttempt((a) => a + 1)}
                      className="mt-3 h-8 px-3 rounded-md text-[13px] font-medium text-ink-2 hover:bg-raised hover:text-accent transition-colors inline-flex items-center gap-1.5"
                    >
                      <RotateCw size={14} strokeWidth={1.5} /> Try again
                    </button>
                  )}
                </div>
              )}

              {digest && (
                <div className="mt-2 space-y-4">
                  {aiError && (
                    <p className="text-xs text-ink-3 leading-relaxed border-l-2 border-hairline pl-3">
                      {aiError.message}
                    </p>
                  )}
                  <p className="font-mono text-[11px] text-ink-3">
                    Offline digest — extracted locally, no AI quota used
                  </p>
                  <p className="font-serif leading-relaxed border-l-2 border-accent pl-4" style={{ fontSize: '1em' }}>
                    {digest.summary}
                  </p>
                  {digest.points.length > 0 && (
                    <ul className="list-disc pl-5 space-y-2 marker:text-ink-3" style={{ fontSize: '0.9em' }}>
                      {digest.points.map((p, i) => <li key={i} className="text-ink-2">{p}</li>)}
                    </ul>
                  )}
                  {AI_RETRYABLE.has(aiError?.kind) && (
                    <button
                      onClick={() => setAiAttempt((a) => a + 1)}
                      className="h-8 px-3 rounded-md text-[13px] font-medium text-ink-2 hover:bg-raised hover:text-accent transition-colors inline-flex items-center gap-1.5"
                    >
                      <RotateCw size={14} strokeWidth={1.5} /> Try AI again
                    </button>
                  )}
                </div>
              )}

              {aiSummary && (
                <div className="mt-2 space-y-4">
                  <p className="font-serif leading-relaxed border-l-2 border-accent pl-4" style={{ fontSize: '1em' }}>
                    {aiSummary.summary}
                  </p>
                  <ul className="list-disc pl-5 space-y-2 marker:text-ink-3" style={{ fontSize: '0.9em' }}>
                    {Array.isArray(aiSummary.points) &&
                      aiSummary.points.map((p, i) => <li key={i} className="text-ink-2">{p}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-10 text-sm font-medium text-ink-2 hover:text-accent transition-colors"
          >
            Read full article at {article.source?.name || 'source'} <ExternalLink size={16} strokeWidth={1.5} />
          </a>

          {(canPrev || canNext) && (
            <div className="mt-12 pt-6 border-t border-hairline grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <button
                onClick={() => onNavigate(index - 1)}
                disabled={!canPrev}
                className={`justify-self-start inline-flex items-center gap-1 text-[13px] font-medium transition-colors ${
                  canPrev ? 'text-ink-2 hover:text-accent' : 'text-ink-3 cursor-default'
                }`}
              >
                <ChevronLeft size={16} strokeWidth={1.5} /> Previous
              </button>
              <span className="font-mono text-xs text-ink-3 tabular-nums whitespace-nowrap">
                {index + 1} of {articles.length}
              </span>
              <button
                onClick={() => onNavigate(index + 1)}
                disabled={!canNext}
                className={`justify-self-end inline-flex items-center gap-1 text-[13px] font-medium transition-colors ${
                  canNext ? 'text-ink-2 hover:text-accent' : 'text-ink-3 cursor-default'
                }`}
              >
                Next <ChevronRight size={16} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
