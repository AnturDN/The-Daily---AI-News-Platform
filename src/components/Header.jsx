import { Search, Sun, Moon, Bookmark, Activity, RefreshCw } from 'lucide-react';
import { COUNTRIES, LANGUAGES } from '../api/newsApi';

export default function Header({
  theme, toggleTheme,
  searchQuery, setSearchQuery, commitSearch,
  activeCategory, handleSelectCategory, categories,
  showBookmarks, setShowBookmarks,
  dateFilter, setDateFilter,
  country, setCountry, language, setLanguage,
  showStats, setShowStats,
  onRefresh, loading,
  trending, searchHistory,
}) {
  const selectClass =
    'h-8 bg-raised rounded-md px-2 text-[13px] text-ink-2 outline-none cursor-pointer hover:bg-surface transition-colors max-w-[10rem]';

  return (
    <nav className="border-b border-hairline sticky top-0 z-20 bg-bg">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex justify-between items-center gap-3">
        <h1 className="font-serif text-2xl font-medium tracking-normal whitespace-nowrap shrink-0">
          The Daily<span className="text-accent-strong">.</span>
        </h1>

        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            id="search-input"
            type="text"
            placeholder="Search"
            aria-label="Search articles"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowBookmarks(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value.trim()) commitSearch(e.target.value);
              if (e.key === 'Escape' && e.target.value) {
                e.stopPropagation();
                setSearchQuery('');
              }
            }}
            className="w-full h-9 bg-raised border border-transparent focus:border-hairline focus:bg-surface rounded-lg pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 outline-none transition-colors"
          />
        </div>
        
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          aria-label="Date filter"
          className={`shrink-0 ${selectClass} hidden sm:block`}
        >
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowStats(!showStats)}
            className={`h-9 w-9 grid place-items-center rounded-lg transition-colors ${
              showStats ? 'text-accent' : 'text-ink-3 hover:text-ink hover:bg-raised'
            }`}
            aria-label="Your reading stats"
          >
            <Activity size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={onRefresh}
            className="h-9 w-9 grid place-items-center rounded-lg text-ink-3 hover:text-ink hover:bg-raised transition-colors hidden md:grid"
            aria-label="Refresh the feed"
          >
            <RefreshCw size={16} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            className={`h-9 w-9 grid place-items-center rounded-lg transition-colors ${
              showBookmarks ? 'text-accent' : 'text-ink-3 hover:text-ink hover:bg-raised'
            }`}
            aria-label="Saved articles"
          >
            <Bookmark size={16} strokeWidth={1.5} className={showBookmarks ? 'fill-accent' : ''} />
          </button>
          <button
            onClick={toggleTheme}
            className="h-9 w-9 grid place-items-center rounded-lg text-ink-3 hover:text-ink hover:bg-raised transition-colors"
            aria-label="Toggle dark mode"
          >
            {theme === 'light' ? <Moon size={16} strokeWidth={1.5} /> : <Sun size={16} strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-6 overflow-x-auto scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleSelectCategory(cat)}
            className={`h-9 pb-1 border-b-2 transition-colors whitespace-nowrap ${
              activeCategory === cat && !searchQuery && !showBookmarks
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            <span className="capitalize text-sm font-medium">{cat}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 shrink-0 pl-2">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Edition — country"
            className={selectClass}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label="Edition — language"
            className={selectClass}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      {!showBookmarks && (trending.length > 0 || searchHistory.length > 0) && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {trending.length > 0 && (
            <>
              <span className="font-mono text-xs text-ink-3 whitespace-nowrap">Trending</span>
              {trending.map((tag) => (
                <button
                  key={`t-${tag}`}
                  onClick={() => commitSearch(tag)}
                  className="h-6 px-2 rounded-[5px] bg-raised text-xs text-ink-2 hover:bg-surface hover:text-ink transition-colors whitespace-nowrap"
                >
                  {tag}
                </button>
              ))}
            </>
          )}
          {trending.length > 0 && searchHistory.length > 0 && (
            <span className="text-ink-3 text-xs shrink-0" aria-hidden="true">·</span>
          )}
          {searchHistory.length > 0 && (
            <>
              <span className="font-mono text-xs text-ink-3 whitespace-nowrap">Recent</span>
              {searchHistory.map((term) => (
                <button
                  key={`r-${term}`}
                  onClick={() => commitSearch(term)}
                  className="h-6 px-2 rounded-[5px] border border-hairline text-xs text-ink-2 hover:bg-raised hover:text-ink transition-colors whitespace-nowrap"
                >
                  {term}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </nav>
  );
}
