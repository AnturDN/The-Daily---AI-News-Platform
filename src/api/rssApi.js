/* The keyless news wire. Google News publishes RSS for every edition this
   app offers, and the Bangla edition is reinforced by the papers' own
   photography feeds — Prothom Alo, BBC Bangla and Bangla Tribune — so most
   cards carry real pictures without any API key or daily quota.

   Delivery, in order: the Vite relay routes /rss-fetch and /og-image
   (same-origin, follow Google's topic redirects server-side, present under
   `npm run dev` and `npm run preview`), then public CORS relays
   (allorigins, codetabs, corsproxy), then rss2json (free, paced, rested
   after a 429). Whatever lands is normalized to the GNews article shape and
   kept in a per-context TTL cache, so tab switches, reloads and page 2..n
   cost nothing. Google News items arrive bare, so bare cards ask the
   /og-image relay for the publisher's own lead photo, cached per article. */

const FEED_TTL = 10 * 60 * 1000;
const TICKER_TTL = 5 * 60 * 1000;
const FEED_CACHE_KEY = 'rss_feed_cache';
const TICKER_CACHE_KEY = 'rss_ticker_cache';
const FEED_CACHE_CONTEXTS = 12;
const PAGE_SIZE = 10;

const TOPIC_BY_CATEGORY = {
  world: 'WORLD', nation: 'NATION', business: 'BUSINESS', technology: 'TECHNOLOGY',
  entertainment: 'ENTERTAINMENT', sports: 'SPORTS', science: 'SCIENCE', health: 'HEALTH',
};

/* Google News 302s a language-only request to its default edition, so every
   URL pins the full edition triple; "Worldwide" means the language's home. */
const HOME_COUNTRY_BY_LANG = {
  en: 'US', bn: 'BD', hi: 'IN', ar: 'SA', de: 'DE', fr: 'FR', es: 'ES', pt: 'PT',
  it: 'IT', nl: 'NL', tr: 'TR', ru: 'RU', zh: 'CN', ja: 'JP', ko: 'KR', vi: 'VN', th: 'TH',
};

/* The photography layer of the wire — keyless feeds that carry their own
   pictures, merged into the front page and the wire of their language. */
const EDITION_FEEDS = {
  bn: [
    { url: 'https://www.prothomalo.com/stories.rss', source: { name: 'প্রথম আলো', url: 'https://www.prothomalo.com' } },
    { url: 'https://feeds.bbci.co.uk/bengali/rss.xml', source: { name: 'BBC বাংলা', url: 'https://www.bbc.com/bengali' } },
    { url: 'https://www.banglatribune.com/feed/', source: { name: 'বাংলা ট্রিবিউন', url: 'https://www.banglatribune.com' } },
  ],
};

export function googleNewsRssUrl({ searchQuery, category, country, language }) {
  const lang = language || 'en';
  const gl = ((country && country !== 'any') ? country : HOME_COUNTRY_BY_LANG[lang] || 'US').toUpperCase();
  const hl = lang === 'en' ? `en-${gl}` : lang;
  const qs = new URLSearchParams({ hl, gl, ceid: `${gl}:${lang}` });
  if (searchQuery) {
    qs.set('q', searchQuery);
    return `https://news.google.com/rss/search?${qs}`;
  }
  const topic = TOPIC_BY_CATEGORY[category];
  return topic
    ? `https://news.google.com/rss/headlines/section/topic/${topic}?${qs}`
    : `https://news.google.com/rss?${qs}`;
}


const fetchWithTimeout = (url, ms = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
};

const looksLikeFeed = (text) => /^\s*(<\?xml|<rss|<feed)/i.test(String(text).slice(0, 300));

/* The Vite relay (vite.config.js) fetches the feed server-side — no CORS,
   and Google's topic redirect is followed where it happens. Absent from a
   static deployment, this simply fails fast and the next route is tried. */
async function viaViteRelay(feedUrl) {
  try {
    const res = await fetchWithTimeout(`/rss-fetch?url=${encodeURIComponent(feedUrl)}`);
    if (!res.ok) return null;
    const text = await res.text();
    return looksLikeFeed(text) ? text : null;
  } catch {
    return null;
  }
}

/* corsproxy.io was retired from this list: it now demands a paid API key
   and answers 401, so it only ever logged errors in the console. */
const PUBLIC_RELAYS = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
];

/* Public relays wax and wane — each gets one chance, in order. */
async function viaPublicRelay(feedUrl) {
  for (const relay of PUBLIC_RELAYS) {
    try {
      const res = await fetchWithTimeout(relay(feedUrl));
      if (!res.ok) continue;
      const text = await res.text();
      if (looksLikeFeed(text)) return text;
    } catch {
      /* this relay is asleep or throttling — the next may not be */
    }
  }
  return null;
}

const RSS2JSON = 'https://api.rss2json.com/v1/api.json';
const R2J_MIN_GAP = 15000;              /* observed: a burst of ~5 trips it */
const R2J_COOLDOWN = 3 * 60 * 1000;     /* and it is back within ~2.5 minutes */
let r2jLastAt = 0;
let r2jRestUntil = 0;

async function viaRss2Json(feedUrl) {
  if (Date.now() < r2jRestUntil) return null;
  const wait = Math.max(0, r2jLastAt + R2J_MIN_GAP - Date.now());
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  r2jLastAt = Date.now();
  try {
    const res = await fetchWithTimeout(`${RSS2JSON}?rss_url=${encodeURIComponent(feedUrl)}`, 20000);
    const data = await res.json().catch(() => null);
    if (data && data.status === 'ok' && Array.isArray(data.items)) return data.items;
    if (res.status === 429) r2jRestUntil = Date.now() + R2J_COOLDOWN;
  } catch {
    /* network or shape — the last route to the wire ends here */
  }
  return null;
}


function xmlText(el, tag) {
  const node = el.getElementsByTagName(tag)[0];
  return node ? node.textContent : '';
}

const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function normalizeXmlItem(el, fixedSource) {
  const rawTitle = xmlText(el, 'title').trim();
  const sourceEl = el.getElementsByTagName('source')[0];
  const sourceName = (sourceEl?.textContent || '').trim();
  let title = rawTitle;
  if (sourceName && rawTitle.endsWith(` - ${sourceName}`)) {
    title = rawTitle.slice(0, rawTitle.length - sourceName.length - 3).trim();
  }
  const pub = xmlText(el, 'pubDate').trim();
  const date = pub ? new Date(pub) : null;
  /* The papers' own feeds carry media:content / media:thumbnail / enclosure
     photography; Google News items come bare — the og:image relay and the
     card monogram cover those. */
  const media =
    el.getElementsByTagName('media:content')[0] ||
    el.getElementsByTagName('media:thumbnail')[0] ||
    el.getElementsByTagName('enclosure')[0];
  const link = xmlText(el, 'link').trim();
  const snippet = stripHtml(xmlText(el, 'description'));
  return {
    title: title || rawTitle,
    description: snippet ? snippet.slice(0, 220) : '',
    url: link,
    image: media?.getAttribute?.('url') || null,
    publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
    source: fixedSource
      ? { ...fixedSource }
      : { name: sourceName || 'Google News', url: sourceEl?.getAttribute('url') || '' },
  };
}

/* rss2json has no <source> tag — the title's " - Publisher" suffix carries it. */
function r2jToArticle(item) {
  const rawTitle = String(item.title || '').trim();
  const link = String(item.link || '');
  let title = rawTitle;
  let sourceName = '';
  const dash = rawTitle.lastIndexOf(' - ');
  if (dash > 20) {
    title = rawTitle.slice(0, dash).trim();
    sourceName = rawTitle.slice(dash + 3).trim();
  }
  const pub = String(item.pubDate || '');
  const date = pub ? new Date(pub.includes('T') ? pub : `${pub.replace(' ', 'T')}Z`) : null;
  return {
    title: title || rawTitle,
    description: stripHtml(item.description).slice(0, 220),
    url: link,
    image: item.thumbnail || item.enclosure?.link || null,
    publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
    source: { name: sourceName || 'Google News', url: '' },
  };
}

function parseItems(text, fixedSource) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) return null;
  const items = [...doc.querySelectorAll('item')];
  if (!items.length) return null;
  return items.map((el) => normalizeXmlItem(el, fixedSource)).filter((a) => a.title && a.url);
}


/* The papers' own photography first, Google's cross-source take on the day
   second — one wire, no repeats. */
function mergeInto(base, extra, cap = 90) {
  const seen = new Set();
  const out = [];
  for (const article of [...extra, ...base]) {
    const key = (article.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(article);
    if (out.length >= cap) break;
  }
  return out;
}

function readMap(key) {
  try {
    const map = JSON.parse(localStorage.getItem(key));
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}

function pruneMap(map, limit) {
  const keys = Object.keys(map).sort((a, b) => (map[a].ts || 0) - (map[b].ts || 0));
  keys.slice(0, Math.max(0, keys.length - limit)).forEach((k) => delete map[k]);
}

function readRssCache(storeKey, entryKey, ttl) {
  const entry = readMap(storeKey)[entryKey];
  if (entry && Array.isArray(entry.articles) && Date.now() - (entry.ts || 0) < ttl) {
    return entry.articles;
  }
  return null;
}

function writeRssCache(storeKey, entryKey, articles) {
  if (!Array.isArray(articles) || !articles.length) return;
  try {
    const map = readMap(storeKey);
    map[entryKey] = { articles: articles.slice(0, 90), ts: Date.now() };
    pruneMap(map, FEED_CACHE_CONTEXTS);
    localStorage.setItem(storeKey, JSON.stringify(map));
  } catch {
    /* storage full or blocked — the wire simply will not persist */
  }
}

/* Same windows the paper's date filter offers, applied client-side because
   RSS search has no server-side `from`. */
function applyDateFilter(articles, dateFilter) {
  if (!dateFilter || dateFilter === 'all') return articles;
  const ranges = { today: 86400000, week: 7 * 86400000, month: 30 * 86400000 };
  const cutoff = Date.now() - (ranges[dateFilter] || 0);
  return articles.filter((a) => a.publishedAt && new Date(a.publishedAt).getTime() >= cutoff);
}


const OG_CACHE_KEY = 'og_img_cache';
const OG_TTL = 3 * 24 * 60 * 60 * 1000;    /* a resolved photo is stable */
const OG_NEG_TTL = 12 * 60 * 60 * 1000;    /* a refusal is not re-asked all day */
const OG_CACHE_LIMIT = 240;

/**
 * The publisher's lead photo for an article whose feed arrived bare.
 * Served by the same-origin /og-image relay (dev and preview servers);
 * a static deployment without the relay negative-caches quietly, so the
 * card keeps its monogram without hammering anything.
 */
export async function lookupOgImage(articleUrl) {
  if (!articleUrl) return null;
  const entry = readMap(OG_CACHE_KEY)[articleUrl];
  if (entry && Date.now() - (entry.ts || 0) < (entry.img ? OG_TTL : OG_NEG_TTL)) {
    return entry.img || null;
  }
  let img = null;
  try {
    const res = await fetchWithTimeout(`/og-image?url=${encodeURIComponent(articleUrl)}`, 25000);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data.image === 'string' && /^https?:\/\//i.test(data.image)) img = data.image;
    }
  } catch {
    /* relay absent or publisher slow — the negative cache will hold the fort */
  }
  try {
    const map = readMap(OG_CACHE_KEY);
    map[articleUrl] = { img, ts: Date.now() };
    pruneMap(map, OG_CACHE_LIMIT);
    localStorage.setItem(OG_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* best-effort, as ever */
  }
  return img;
}

async function fetchFeedArticles(feedUrl, fixedSource) {
  const text = (await viaViteRelay(feedUrl)) || (await viaPublicRelay(feedUrl));
  if (text) {
    const parsed = parseItems(text, fixedSource);
    if (parsed) return parsed;
  }
  const items = await viaRss2Json(feedUrl);
  if (items) {
    const mapped = items.map(r2jToArticle).filter((a) => a.title && a.url);
    if (fixedSource) mapped.forEach((a) => { a.source = { ...fixedSource }; });
    return mapped;
  }
  return null;
}

/* The photography layer of an edition — fetched in parallel, and a
   missing paper never fails the feed. */
async function editionFeedArticles(language) {
  const feeds = EDITION_FEEDS[language] || [];
  if (!feeds.length) return [];
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const articles = await fetchFeedArticles(feed.url, feed.source);
      return articles ? articles.slice(0, 40) : [];
    }),
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

/**
 * One page of the keyless wire for the current edition — the primary news
 * source of the paper. Returns null only when every route to every feed is
 * out, which is the caller's cue to fall back to the metered GNews key.
 */
export async function fetchRssFeed({
  searchQuery, category, dateFilter = 'all', country = 'any', language = 'en', page = 1,
}) {
  const entryKey = [searchQuery || '', category || 'general', country || 'any', language || 'en'].join('|');
  let full = readRssCache(FEED_CACHE_KEY, entryKey, FEED_TTL);
  if (!full) {
    const wantsPapers = !searchQuery && category === 'general' && EDITION_FEEDS[language];
    const [google, papers] = await Promise.all([
      fetchFeedArticles(googleNewsRssUrl({ searchQuery, category, country, language })),
      wantsPapers ? editionFeedArticles(language) : Promise.resolve([]),
    ]);
    if (!google && !papers.length) return null;
    full = mergeInto(google || [], papers);
    writeRssCache(FEED_CACHE_KEY, entryKey, full);
  }
  const filtered = applyDateFilter(full, dateFilter);
  const start = (Math.max(1, page) - 1) * PAGE_SIZE;
  return filtered.slice(start, start + PAGE_SIZE);
}

/**
 * Headlines for the "Latest" ticker strip, from the same keyless wire —
 * the papers' feeds reinforce it in every language that has them.
 * Returns null when every route is out; the caller falls back to GNews
 * and its own last-wire cache.
 */
export async function fetchRssTicker({ country = 'any', language = 'en' }) {
  const entryKey = `${country || 'any'}|${language || 'en'}`;
  let full = readRssCache(TICKER_CACHE_KEY, entryKey, TICKER_TTL);
  if (!full) {
    const [google, papers] = await Promise.all([
      fetchFeedArticles(googleNewsRssUrl({ category: 'general', country, language })),
      editionFeedArticles(language),
    ]);
    if (!google && !papers.length) return null;
    full = mergeInto(google || [], papers);
    writeRssCache(TICKER_CACHE_KEY, entryKey, full);
  }
  return full.slice(0, 12);
}
