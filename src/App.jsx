import { useState, useEffect, useMemo, useCallback } from 'react';
import Header from './components/Header';
import NewsSection from './components/NewsSection';
import Footer from './components/Footer';
import ArticleModal from './components/ArticleModal';
import BreakingTicker from './components/BreakingTicker';
import StatsModal from './components/StatsModal';
import Toasts from './components/Toasts';
import BackToTop from './components/BackToTop';
import {
  fetchNews, fetchTickerHeadlines, filterByDate, computeTrending, readingTime, formatTime,
  gnewsQuotaActive, parkGnewsForQuota, clearGnewsQuota, readFeedCache,
} from './api/newsApi';

const MAX_PER_PAGE = 10;

const DEFAULT_STATS = { reads: 0, searches: 0, minutes: 0, since: Date.now(), categories: {}, sources: {} };

function readStoredJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && !Array.isArray(fallback)) {
      return {
        ...fallback,
        ...value,
        ...(fallback.categories ? { categories: { ...fallback.categories, ...value.categories } } : {}),
        ...(fallback.sources ? { sources: { ...fallback.sources, ...value.sources } } : {}),
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noMore, setNoMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('general');
  const [page, setPage] = useState(1);
  const [dateFilter, setDateFilter] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);

 
  const [country, setCountry] = useState(() => localStorage.getItem('edition-country') || 'any');
  const [language, setLanguage] = useState(() => localStorage.getItem('edition-lang') || 'en');


  const [sortBy, setSortBy] = useState(() => localStorage.getItem('sort_by') || 'newest');
  const [hideRead, setHideRead] = useState(() => localStorage.getItem('hide_read') === '1');
  const [fontScale, setFontScale] = useState(() => parseFloat(localStorage.getItem('modal_font')) || 1);
  const [readArticles, setReadArticles] = useState(() => readStoredJSON('read_articles', []));
  const [stats, setStats] = useState(() => readStoredJSON('app_stats', DEFAULT_STATS));

  
  const [bookmarks, setBookmarks] = useState(() => readStoredJSON('bookmarks', []));
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [tickerArticles, setTickerArticles] = useState([]);
  const [searchHistory, setSearchHistory] = useState(() => readStoredJSON('search_history', []));
  /* true while the free plan's daily quota is parked until midnight UTC */
  const [quotaBlocked, setQuotaBlocked] = useState(() => gnewsQuotaActive());

  const categories = ['general', 'world', 'technology', 'business', 'science', 'sports'];

  /* নতুন সার্চ, ক্যাটাগরি, ডেট বা edition বদলালে পেজ ১ এ ফেরানো (render-time reset —
     এটা effect-এ setState করার চেয়ে React-এর recommended প্যাটার্ন এবং দ্রুত) */
  const [prevFilters, setPrevFilters] = useState({ searchQuery, activeCategory, dateFilter, country, language, refreshKey });
  if (
    searchQuery !== prevFilters.searchQuery ||
    activeCategory !== prevFilters.activeCategory ||
    dateFilter !== prevFilters.dateFilter ||
    country !== prevFilters.country ||
    language !== prevFilters.language ||
    refreshKey !== prevFilters.refreshKey
  ) {
    setPrevFilters({ searchQuery, activeCategory, dateFilter, country, language, refreshKey });
    setPage(1);
    setNoMore(false);
    setLoading(true); // the skeleton takes the grid at once — no ghost grid for the scroll sentinel
  }

  const readSet = useMemo(() => new Set(readArticles.map((r) => r.url)), [readArticles]);

  /* what the grid shows: bookmarks, or the feed minus hidden read articles, sorted */
  const visibleList = useMemo(() => {
    if (showBookmarks) {
      return [...bookmarks].sort(
        (a, b) => new Date(b.savedAt || b.publishedAt) - new Date(a.savedAt || a.publishedAt),
      );
    }
    let list = hideRead ? news.filter((a) => !readSet.has(a.url)) : news;
    if (sortBy === 'newest') {
      list = [...list].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    } else if (sortBy === 'oldest') {
      list = [...list].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
    } else if (sortBy === 'source') {
      list = [...list].sort((a, b) => (a.source?.name || '').localeCompare(b.source?.name || ''));
    }
    return list;
  }, [showBookmarks, bookmarks, news, hideRead, readSet, sortBy]);

  const trending = useMemo(
    () => computeTrending(news.slice(0, 30)).filter((tag) => tag.toLowerCase() !== searchQuery.toLowerCase()),
    [news, searchQuery],
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme]);

  /* one place per preference — state changes, effects persist them */
  useEffect(() => { localStorage.setItem('edition-country', country); }, [country]);
  useEffect(() => { localStorage.setItem('edition-lang', language); }, [language]);
  useEffect(() => { localStorage.setItem('sort_by', sortBy); }, [sortBy]);
  useEffect(() => { localStorage.setItem('hide_read', hideRead ? '1' : '0'); }, [hideRead]);
  useEffect(() => { localStorage.setItem('modal_font', String(fontScale)); }, [fontScale]);
  useEffect(() => { localStorage.setItem('bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(() => { localStorage.setItem('search_history', JSON.stringify(searchHistory)); }, [searchHistory]);
  useEffect(() => { localStorage.setItem('read_articles', JSON.stringify(readArticles)); }, [readArticles]);
  useEffect(() => { localStorage.setItem('app_stats', JSON.stringify(stats)); }, [stats]);

  /* main feed — debounced, edition-aware, deduped across pages. The effect
     owns a `cancelled` flag: an older edition's slow response must never
     overwrite the grid of the edition the reader switched to mid-flight. */
  useEffect(() => {
    if (showBookmarks) return;
    let cancelled = false;
    const fetchPage = async () => {
      /* Only a front-page attempt resets the note — a background page fetch must
         never wipe the banner the front page is showing. */
      if (page === 1 && !cancelled) setError(null);
      try {
        const articles = await fetchNews({ searchQuery, category: activeCategory, page, dateFilter, country, language });

        // /top-headlines has no server-side date filter, so apply it here.
        const fresh = searchQuery ? articles : filterByDate(articles, dateFilter);

        if (cancelled) return;
        if (page === 1) {
          setNews(fresh);
        } else if (fresh.length) {
          setNews((prev) => {
            const seen = new Set(prev.map((a) => a.url));
            return [...prev, ...fresh.filter((a) => a.url && !seen.has(a.url))];
          });
        }
        if (fresh.length < MAX_PER_PAGE) setNoMore(true);
        setQuotaBlocked(false); // a live answer means the plan is serving again
      } catch (err) {
        if (cancelled) return;
        const status = err.response?.status;

        /* The front page, rescued from the last time this exact context was
           live. Falls back to the plain error when nothing was ever cached. */
        const fallBackToCache = (notice) => {
          const cached = readFeedCache({ searchQuery, category: activeCategory, dateFilter, country, language });
          const fresh = cached
            ? (searchQuery ? cached.articles : filterByDate(cached.articles, dateFilter))
            : [];
          if (!fresh.length) return false;
          setNews(fresh);
          setNoMore(true); // there is no page 2 while the quota rests
          setError(`${notice} — these are the headlines from your last visit (${formatTime(new Date(cached.ts).toISOString())}). Saved articles and AI summaries still work.`);
          return true;
        };

        if (err.quota || status === 403) {
          if (status === 403) parkGnewsForQuota(); // a real refusal — park every call until UTC midnight
          setQuotaBlocked(true);
          if (page === 1) {
            const rescued = fallBackToCache('Live news feeds and the GNews backup are unreachable');
            if (!rescued) {
              setError('The news feeds are unreachable right now and the GNews backup quota is spent (100 requests a day, resets at midnight UTC). Saved articles and AI summaries still work.');
            }
          } else {
            setNoMore(true); // discovered mid-scroll — end the feed politely
          }
        } else if (status === 401) {
          setError('GNews API key was rejected — check VITE_GNEWS_API_KEY in your .env file.');
        } else if (status === 429) {
          setError('The news service is busy right now — trying again in a moment');
        } else if (page > 1) {
          setNoMore(true); // a failed next page quietly ends the feed
        } else if (err.message === 'Network Error' || !navigator.onLine) {
          const rescued = fallBackToCache('You are offline');
          if (!rescued) {
            setError('You are offline — saved articles and pages already loaded still work.');
          }
        } else {
          setError(err.message || 'Unable to load news');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const delay = setTimeout(() => fetchPage(), 500);
    return () => { cancelled = true; clearTimeout(delay); };
  }, [searchQuery, activeCategory, page, showBookmarks, dateFilter, country, language, refreshKey]);

  /* the "Latest" wire — fetched apart from the grid so it never blocks the paper */
  useEffect(() => {
    let cancelled = false;
    const load = async (attempt) => {
      try {
        const articles = await fetchTickerHeadlines({ country, language });
        if (!cancelled) setTickerArticles(articles);
      } catch {
        /* one quiet retry, then the ticker stays down */
        if (!cancelled && attempt === 0) setTimeout(() => load(1), 3000);
      }
    };
    const timer = setTimeout(() => load(0), 1600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [country, language, refreshKey]);


  const pushToast = useCallback((text) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  useEffect(() => {
    const offline = () => pushToast('You are offline — cached stories still work');
    const online = () => pushToast('Back online');
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [pushToast]);

  /* Keyboard shortcuts — only when no sheet is open (the sheet has its own set) */
  useEffect(() => {
    const onKey = (e) => {
      if (selectedArticle) return;
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (inField) return;
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      } else if (e.key === 't') {
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
      } else if (e.key === '?') {
        setShowStats(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedArticle]);


  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  /* Quota parked but the plan was upgraded / the key was swapped? One click
     lifts the parking and re-asks for real. A still-spent quota simply parks
     itself again on the first 403. */
  const forceRetry = () => {
    clearGnewsQuota();
    setQuotaBlocked(false);
    setError(null);
    setRefreshKey((k) => k + 1);
  };

  const toggleBookmark = (article) => {
    setBookmarks((prev) =>
      prev.some((b) => b.url === article.url)
        ? prev.filter((b) => b.url !== article.url)
        : [...prev, { ...article, savedAt: Date.now() }],
    );
  };

  const clearBookmarks = () => {
    setBookmarks([]);
    pushToast('Removed all saved articles');
  };

  const commitSearch = (raw) => {
    const query = String(raw || '').trim();
    if (!query) return;
    setSearchQuery(query);
    setShowBookmarks(false);
    if (query.toLowerCase() !== searchQuery.toLowerCase()) {
      setStats((prev) => ({ ...prev, searches: prev.searches + 1 }));
    }
    setSearchHistory((prev) =>
      [query, ...prev.filter((s) => s.toLowerCase() !== query.toLowerCase())].slice(0, 8));
  };

  const handleSelectCategory = (cat) => {
    setActiveCategory(cat);
    setSearchQuery('');
    setShowBookmarks(false);
    setStats((prev) => ({ ...prev, categories: { ...prev.categories, [cat]: (prev.categories[cat] || 0) + 1 } }));
  };

  const openArticle = (article) => {
    setSelectedArticle(article);
    if (article.url && !readSet.has(article.url)) {
      const source = article.source?.name || 'Unknown source';
      setReadArticles((prev) =>
        [{ url: article.url, at: Date.now() }, ...prev.filter((r) => r.url !== article.url)].slice(0, 400));
      setStats((prev) => ({
        ...prev,
        reads: prev.reads + 1,
        minutes: prev.minutes + readingTime(article),
        sources: { ...prev.sources, [source]: (prev.sources[source] || 0) + 1 },
      }));
    }
  };

  const navigateArticle = (idx) => {
    const target = visibleList[idx];
    if (target) openArticle(target);
  };

  const handleShare = async (article) => {
    const shareData = { title: article.title, text: article.description || '', url: article.url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // the reader changed their mind
      }
    }
    try {
      await navigator.clipboard.writeText(article.url);
      pushToast('Link copied');
    } catch {
      pushToast(article.url);
    }
  };

  const resetStats = () => {
    setStats({ ...DEFAULT_STATS, since: Date.now() });
    pushToast('Stats reset');
  };

  const onReachEnd = useCallback(() => setPage((p) => p + 1), []);
  const isRead = useCallback((url) => readSet.has(url), [readSet]);

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink transition-colors duration-300">

      <BreakingTicker articles={tickerArticles} onArticleClick={openArticle} />

      <Header
        theme={theme} toggleTheme={toggleTheme}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery} commitSearch={commitSearch}
        activeCategory={activeCategory} handleSelectCategory={handleSelectCategory} categories={categories}
        showBookmarks={showBookmarks} setShowBookmarks={setShowBookmarks}
        dateFilter={dateFilter} setDateFilter={setDateFilter}
        country={country} setCountry={setCountry}
        language={language} setLanguage={setLanguage}
        showStats={showStats} setShowStats={setShowStats}
        onRefresh={handleRefresh} loading={loading}
        trending={trending} searchHistory={searchHistory}
      />

      <NewsSection
        news={visibleList}
        loading={loading} error={error}
        searchQuery={searchQuery}
        bookmarks={bookmarks} toggleBookmark={toggleBookmark}
        onArticleClick={openArticle}
        showBookmarks={showBookmarks}
        page={page} setPage={setPage}
        noMore={noMore} sortBy={sortBy} setSortBy={setSortBy}
        hideRead={hideRead} setHideRead={setHideRead}
        onClearBookmarks={clearBookmarks}
        onReachEnd={onReachEnd}
        isRead={isRead}
        quotaBlocked={quotaBlocked}
        onForceRetry={forceRetry}
      />

      <Footer handleSelectCategory={handleSelectCategory} />

      {selectedArticle && (
        <ArticleModal
          article={selectedArticle}
          articles={visibleList}
          onClose={() => setSelectedArticle(null)}
          onNavigate={navigateArticle}
          isBookmarked={bookmarks.some((b) => b.url === selectedArticle.url)}
          onToggleBookmark={toggleBookmark}
          onShare={handleShare}
          fontScale={fontScale}
          setFontScale={setFontScale}
        />
      )}

      {showStats && (
        <StatsModal
          stats={stats}
          savedCount={bookmarks.length}
          onClose={() => setShowStats(false)}
          onReset={resetStats}
        />
      )}

      <Toasts toasts={toasts} />
      <BackToTop />
    </div>
  );
}
