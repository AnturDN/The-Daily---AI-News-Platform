import { useEffect, useRef } from 'react';
import NewsCard from './NewsCard';
import SkeletonCard from './SkeletonCard';
import { Loader2, RotateCw } from 'lucide-react';

export default function NewsSection({
  news, loading, error, searchQuery,
  bookmarks, toggleBookmark, onArticleClick,
  showBookmarks, page, setPage,
  noMore, sortBy, setSortBy, hideRead, setHideRead,
  onClearBookmarks, onReachEnd,
  isRead, quotaBlocked, onForceRetry,
}) {
  
  const sentinelRef = useRef(null);
  const autoLoad = !showBookmarks && !loading && !error && !noMore;
  const retryButton = (
    <button
      onClick={onForceRetry}
      className="h-8 px-3 rounded-md text-[13px] font-medium text-ink-3 hover:text-accent hover:bg-raised transition-colors inline-flex items-center gap-1.5"
    >
      <RotateCw size={14} strokeWidth={1.5} /> Try again
    </button>
  );

  // When the sentinel slides into view, bring on the next page by itself.
  /* The observer is re-created after every page of news lands (news.length in
     the deps): a fresh observe() re-checks the sentinel's position immediately,
     so a page that leaves the sentinel already in view loads the next one
     without waiting for another scroll, and one pushed far below the fold
     waits for the reader like before. */
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !autoLoad || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) onReachEnd();
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [autoLoad, onReachEnd, news.length]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const context = showBookmarks
    ? `${news.length} saved`
    : searchQuery
      ? `${news.length} ${news.length === 1 ? 'article' : 'articles'}`
      : today;

  return (
    <main className="flex-grow max-w-6xl w-full mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline pb-3 mb-8">
        <h2 className="text-[13px] font-medium text-ink-2">
          {showBookmarks ? 'Saved articles' : searchQuery ? `Results for “${searchQuery}”` : 'Top stories'}
        </h2>

        <div className="flex items-center gap-2 ml-auto">
          {showBookmarks ? (
            news.length > 0 && (
              <button
                onClick={onClearBookmarks}
                className="h-8 px-2 rounded-md text-[13px] font-medium text-ink-3 hover:text-accent hover:bg-raised transition-colors"
              >
                Clear all
              </button>
            )
          ) : (
            <>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort articles"
                className="h-8 bg-raised rounded-md px-2 text-[13px] text-ink-2 outline-none cursor-pointer hover:bg-surface transition-colors"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="source">By source</option>
              </select>
              <button
                onClick={() => setHideRead(!hideRead)}
                aria-pressed={hideRead}
                className={`h-8 px-2 rounded-md text-[13px] font-medium transition-colors ${
                  hideRead ? 'text-accent bg-raised' : 'text-ink-3 hover:text-ink hover:bg-raised'
                }`}
              >
                Hide read
              </button>
            </>
          )}
          <span className="font-mono text-xs text-ink-3 tabular-nums whitespace-nowrap">{context}</span>
        </div>
      </div>

      {error && !loading && page === 1 && !showBookmarks && news.length === 0 ? (
        <div className="text-center py-10 text-sm text-accent">
          {error}
          {quotaBlocked && onForceRetry && (
            <div className="mt-4">{retryButton}</div>
          )}
        </div>
      ) : loading && page === 1 && !showBookmarks ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-20 text-ink-3">
          {showBookmarks ? 'No saved articles yet' : 'No articles found'}
        </div>
      ) : (
        <>
          {error && !loading && page === 1 && !showBookmarks && (
            <div className="mb-8 flex flex-wrap items-center gap-3 border-l-2 border-accent pl-4">
              <p className="text-sm text-ink-3 leading-relaxed flex-1 min-w-[200px]">{error}</p>
              {quotaBlocked && onForceRetry && retryButton}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
            {news.map((article) => (
              <NewsCard
                key={article.url || article.title}
                article={article}
                isBookmarked={bookmarks.some(b => b.url === article.url)}
                isRead={isRead(article.url)}
                toggleBookmark={toggleBookmark}
                onArticleClick={onArticleClick}
              />
            ))}
          </div>

          {!showBookmarks && (
            <>
              <div ref={sentinelRef} className="h-1" aria-hidden="true"></div>

              {noMore ? (
                !loading && !error && news.length > 0 && (
                  <p className="text-center mt-12 font-mono text-xs text-ink-3">End of feed</p>
                )
              ) : (
                <div className="text-center mt-12">
                  {loading && page > 1 ? (
                    <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-ink-3 mx-auto" />
                  ) : (
                    <button
                      onClick={() => setPage(prev => prev + 1)}
                      className="h-10 px-5 rounded-lg bg-ink text-bg text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] duration-150"
                    >
                      Load more
                    </button>
                  )}
                </div>
              )}

              {error && page > 1 && (
                <div className="text-center mt-12 text-sm text-ink-3">{error}</div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
