/* eslint-disable react-refresh/only-export-components -- utility module, not a component */
import axios from 'axios';
import { fetchRssFeed, fetchRssTicker } from './rssApi';

const API_KEY = import.meta.env.VITE_GNEWS_API_KEY;
const BASE_URL = 'https://gnews.io/api/v4';
const MAX_PER_PAGE = 10; // GNews free plan allows a maximum of 10 articles per request


export const COUNTRIES = [
  { code: 'any', label: 'Worldwide' },
  { code: 'bd', label: 'Bangladesh' },
  { code: 'in', label: 'India' },
  { code: 'pk', label: 'Pakistan' },
  { code: 'us', label: 'United States' },
  { code: 'gb', label: 'United Kingdom' },
  { code: 'ca', label: 'Canada' },
  { code: 'au', label: 'Australia' },
  { code: 'de', label: 'Germany' },
  { code: 'fr', label: 'France' },
  { code: 'es', label: 'Spain' },
  { code: 'it', label: 'Italy' },
  { code: 'nl', label: 'Netherlands' },
  { code: 'se', label: 'Sweden' },
  { code: 'tr', label: 'Turkey' },
  { code: 'sa', label: 'Saudi Arabia' },
  { code: 'ae', label: 'UAE' },
  { code: 'eg', label: 'Egypt' },
  { code: 'ng', label: 'Nigeria' },
  { code: 'za', label: 'South Africa' },
  { code: 'cn', label: 'China' },
  { code: 'jp', label: 'Japan' },
  { code: 'kr', label: 'South Korea' },
  { code: 'sg', label: 'Singapore' },
  { code: 'my', label: 'Malaysia' },
  { code: 'id', label: 'Indonesia' },
  { code: 'br', label: 'Brazil' },
  { code: 'mx', label: 'Mexico' },
  { code: 'ar', label: 'Argentina' },
  { code: 'ru', label: 'Russia' },
];

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'Bengali' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ar', label: 'Arabic' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ru', label: 'Russian' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'th', label: 'Thai' },
];


/**
 * Returns a '&from=YYYY-MM-DD' query fragment for the given date filter.
 * The /search endpoint supports the `from` parameter; /top-headlines does not.
 */
function fromDateParam(dateFilter) {
  if (dateFilter === 'today') {
    return `&from=${new Date(Date.now() - 86400000).toISOString().split('T')[0]}`;
  }
  if (dateFilter === 'week') {
    return `&from=${new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]}`;
  }
  if (dateFilter === 'month') {
    return `&from=${new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]}`;
  }
  return '';
}

/**
 * Client-side date filter, used for category headlines because
 * /top-headlines has no server-side `from` parameter.
 */
export function filterByDate(articles, dateFilter) {
  if (!dateFilter || dateFilter === 'all') return articles;
  const ranges = { today: 86400000, week: 7 * 86400000, month: 30 * 86400000 };
  const cutoff = Date.now() - ranges[dateFilter];
  return articles.filter((a) => a.publishedAt && new Date(a.publishedAt).getTime() >= cutoff);
}

/**
 * Relative publish time in the paper's mono dateline style.
 */
export function formatTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const diff = Math.floor((new Date() - date) / 60000);
  if (diff < 60) return `${Math.max(diff, 1)}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Estimated reading time in minutes, from the words we actually have
 * (title + description) at ~180 words per minute.
 */
export function readingTime(article) {
  const words = `${article.title || ''} ${article.description || ''}`
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'as', 'at', 'by',
  'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'it', 'its',
  'new', 'after', 'before', 'over', 'into', 'how', 'why', 'what', 'when', 'who', 'whom',
  'will', 'has', 'have', 'had', 'not', 'no', 'nor', 'do', 'does', 'did', 'doing', 'you',
  'your', 'yours', 'we', 'our', 'ours', 'their', 'theirs', 'they', 'them', 'his', 'her',
  'hers', 'him', 'she', 'he', 'up', 'down', 'out', 'about', 'against', 'during', 'under',
  'between', 'among', 'through', 'above', 'below', 'can', 'could', 'should', 'would',
  'might', 'must', 'shall', 'than', 'then', 'there', 'these', 'those', 'which', 'while',
  'also', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'too',
  'very', 'just', 'says', 'said', 'say', 'saying', 'report', 'reports', 'vs', 'amid',
  'first', 'two', 'one', 'three', 'u', 's', 'am', 'pm', 'year', 'years', 'day', 'days',
  'week', 'weeks', 'month', 'months', 'time', 'times', 'via', 'due', 'may', 'get', 'got',
  /* Bangla function words, so the Bangla wire trends topics, not grammar */
  'থেকে', 'করে', 'করা', 'করবে', 'করেন', 'করছে', 'হবে', 'হয়', 'হয়ে', 'হয়েছে', 'এই', 'একটি',
  'এক', 'সেই', 'তার', 'তাদের', 'যার', 'যে', 'কি', 'কী', 'না', 'নেই', 'আরও', 'আর', 'ও',
  'সাথে', 'জন্য', 'হিসেবে', 'পর', 'পরে', 'মধ্যে', 'কাছে', 'বলে', 'বলেন', 'দিয়ে', 'নিয়ে',
  'সব', 'দুই', 'তিন', 'বছর', 'বছরের', 'মাস', 'মাসের', 'দিন', 'দিনের', 'সময়', 'সালে',
  'প্রথম', 'নতুন', 'শেষ', 'কম', 'বেশি', 'তাই', 'কিন্তু', 'এবং', 'ওই', 'আজ', 'গতকাল',
]);

/**
 * Topic tags worth tapping, mined from the titles of the current articles.
 * Capitalized neighbours become phrases ("James Bond"), lone names count too —
 * news topics are names, not verbs.
 */
export function computeTrending(articles, limit = 7) {
  const scores = new Map(); // key -> { label, score }

  const add = (key, label, score) => {
    const prev = scores.get(key);
    scores.set(key, { label, score: (prev?.score || 0) + score });
  };

  for (const a of articles) {
    const tokens = (a.title || '')
      .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/^['’-]+|['’-]+$/g, ''))
      .filter(Boolean);

    tokens.forEach((word, i) => {
      if (word.length < 4 || /\d/.test(word)) return;
      if (STOPWORDS.has(word.toLowerCase())) return;
      const possessive = /['’]s$/i.test(word);
      const proper = /^[A-Z]/.test(word) && !/^[A-Z]+$/.test(word) && !possessive;
      const lower = word.toLowerCase();

      if (proper) {
        add(lower, word, 1.5);
        const next = (tokens[i + 1] || '').replace(/^['’-]+|['’-]+$/g, '');
        const nextProper =
          next.length >= 3 && !/\d/.test(next) &&
          /^[A-Z]/.test(next) && !/^[A-Z]+$/.test(next) &&
          !STOPWORDS.has(next.toLowerCase()) && !/['’]s$/i.test(next);
        if (nextProper) {
          add(`${lower} ${next.toLowerCase()}`, `${word} ${next}`, 3);
        }
      } else {
        add(lower, word, 0.6);
      }
    });
  }

  // Best first, and no two tags may share a word — "James Gunn" in, "James" out.
  const ranked = [...scores.values()]
    .filter((c) => c.score >= 3)
    .sort((a, b) => b.score - a.score);
  const usedWords = new Set();
  const picked = [];
  for (const candidate of ranked) {
    const words = candidate.label.toLowerCase().split(/\s+/);
    if (words.some((w) => usedWords.has(w))) continue;
    words.forEach((w) => usedWords.add(w));
    picked.push(candidate.label);
    if (picked.length >= limit) break;
  }
  return picked;
}


function editionParams(country, language) {
  const c = country && country !== 'any' ? `&country=${country}` : '';
  const l = language && language !== 'any' ? `&lang=${language}` : '';
  return c + l;
}

/* The free plan allows about one request per second — every GNews call from
   this app waits its turn, so the feed, the wire and "load more" never trip
   each other into a 429. */
let lastRequestAt = 0;
const MIN_REQUEST_GAP = 1100;
async function takeTurn() {
  const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP - Date.now());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}


const QUOTA_KEY = 'gnews_quota_until';
const FEED_CACHE_KEY = 'gnews_feed_cache';
const TICKER_CACHE_KEY = 'gnews_ticker_cache';
const FEED_CACHE_CONTEXTS = 6; // the front pages of your six most recent contexts

/* A 403 from GNews means the free plan's 100 requests for today are spent.
   From that moment we park EVERY GNews call — the feed, the wire, pagination
   — until the next UTC midnight, the exact moment their counter resets, so
   reloads and tab-switches stop asking an API that will only answer 403. */
export function gnewsQuotaActive() {
  try {
    return Date.now() < parseInt(localStorage.getItem(QUOTA_KEY) || '0', 10);
  } catch {
    return false;
  }
}

export function parkGnewsForQuota() {
  const now = new Date();
  const resetsAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 1);
  try {
    localStorage.setItem(QUOTA_KEY, String(resetsAt));
  } catch {
    /* storage blocked — parking simply will not persist past this visit */
  }
  return resetsAt;
}

export function clearGnewsQuota() {
  try {
    localStorage.removeItem(QUOTA_KEY);
  } catch {
    /* nothing to clear */
  }
}

/* Thrown before any request leaves the browser while the quota rests. */
function quotaRefusal() {
  const err = new Error('GNews daily quota reached — parked until midnight UTC');
  err.quota = true;
  return err;
}

/* The last front page you actually saw, per search / category / date / edition —
   the "offline edition" the paper falls back to when the quota is spent or
   the network is gone. Raw articles: the caller re-applies its date filter. */
function feedCacheKey({ searchQuery, category, dateFilter, country, language }) {
  return [searchQuery || '', category || 'general', dateFilter || 'all', country || 'any', language || 'en'].join('|');
}

export function readFeedCache(context) {
  try {
    const map = JSON.parse(localStorage.getItem(FEED_CACHE_KEY)) || {};
    const entry = map[feedCacheKey(context)];
    return entry && Array.isArray(entry.articles) ? entry : null;
  } catch {
    return null;
  }
}

export function saveFeedCache(context, articles) {
  if (!Array.isArray(articles) || !articles.length) return;
  try {
    const map = JSON.parse(localStorage.getItem(FEED_CACHE_KEY)) || {};
    map[feedCacheKey(context)] = { articles: articles.slice(0, 10), ts: Date.now() };
    const keys = Object.keys(map).sort((a, b) => (map[a].ts || 0) - (map[b].ts || 0));
    keys.slice(0, Math.max(0, keys.length - FEED_CACHE_CONTEXTS)).forEach((k) => delete map[k]);
    localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* storage full or blocked — the offline edition is best-effort */
  }
}

/* The last wire, per edition — quieter than an empty ticker strip. */
function readTickerCache(country, language) {
  try {
    const map = JSON.parse(localStorage.getItem(TICKER_CACHE_KEY)) || {};
    const entry = map[`${country || 'any'}|${language || 'en'}`];
    return entry && Array.isArray(entry.articles) ? entry.articles : [];
  } catch {
    return [];
  }
}

function saveTickerCache(country, language, articles) {
  if (!Array.isArray(articles) || !articles.length) return;
  try {
    const map = JSON.parse(localStorage.getItem(TICKER_CACHE_KEY)) || {};
    map[`${country || 'any'}|${language || 'en'}`] = { articles: articles.slice(0, 8), ts: Date.now() };
    localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* best-effort again */
  }
}

/**
 * Fetch one page of news for the current edition.
 *
 * The keyless RSS wire (Google News + Prothom Alo) is the primary source — it
 * carries no daily quota to spend. GNews remains the metered fallback when
 * every route to the wire is out:
 * - A search query uses /search (supports `from` for date filtering).
 * - Otherwise the category uses /top-headlines, which returns real
 *   category headlines. Date filtering is applied client-side in that case.
 */
export async function fetchNews({ searchQuery, category, page, dateFilter = 'all', country = 'any', language = 'en' }) {
  /* Primary — the keyless wire. An empty array is an honest answer (the
     edition simply has nothing right now); null means the wire is out. */
  const rss = await fetchRssFeed({ searchQuery, category, dateFilter, country, language, page });
  if (rss) {
    if (page === 1) saveFeedCache({ searchQuery, category, dateFilter, country, language }, rss);
    return rss;
  }

  if (!API_KEY) {
    throw new Error('GNews API key is missing. Set VITE_GNEWS_API_KEY in your .env file.');
  }
  if (gnewsQuotaActive()) throw quotaRefusal(); // parked — no request leaves the browser

  const edition = editionParams(country, language);
  let url;
  if (searchQuery) {
    url = `${BASE_URL}/search?q=${encodeURIComponent(searchQuery)}${edition}&max=${MAX_PER_PAGE}&page=${page}${fromDateParam(dateFilter)}&apikey=${API_KEY}`;
  } else {
    url = `${BASE_URL}/top-headlines?category=${category}${edition}&max=${MAX_PER_PAGE}&page=${page}&apikey=${API_KEY}`;
  }

  let response;
  try {
    response = await takeTurn().then(() => axios.get(url));
  } catch (err) {
    if (err.response?.status === 403) parkGnewsForQuota(); // spent for today — park everything
    throw err;
  }
  const articles = response.data.articles || [];
  if (page === 1) saveFeedCache({ searchQuery, category, dateFilter, country, language }, articles);
  return articles;
}

/**
 * Headlines for the "Latest" ticker strip. The keyless wire serves it first;
 * `breaking-news` is a distinct GNews topic on the fallback path, so the
 * GNews wire shows stories the grid may not have yet. While the daily quota
 * rests (or just met its 403), the strip runs the last wire we had for this
 * edition instead of going dark — without a single further request.
 */
export async function fetchTickerHeadlines({ country = 'any', language = 'en' }) {
  const rss = await fetchRssTicker({ country, language });
  if (rss && rss.length) {
    saveTickerCache(country, language, rss);
    return rss;
  }
  if (!API_KEY) return [];
  if (gnewsQuotaActive()) return readTickerCache(country, language);
  const edition = editionParams(country, language);
  const url = `${BASE_URL}/top-headlines?topic=breaking-news${edition}&max=8&apikey=${API_KEY}`;
  let response;
  try {
    response = await takeTurn().then(() => axios.get(url));
  } catch (err) {
    if (err.response?.status === 403) parkGnewsForQuota(); // the wire found out first — park it all
    throw err;
  }
  const articles = response.data.articles || [];
  saveTickerCache(country, language, articles);
  return articles;
}
