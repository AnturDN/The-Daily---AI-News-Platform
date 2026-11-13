
const CACHE_KEY = 'ai_summary_cache';
const CACHE_LIMIT = 200;

export const AI_STATUS_MESSAGES = {
  quota: 'Daily AI summary limits are reached — please try again later. Your offline digest is still available.',
  rate: 'The AI service is busy right now — try again in a few seconds.',
  auth: 'The AI provider rejected its server API key. Please check the API key in Vercel Environment Variables.',
  geo: 'The AI summary provider is not available in your current region.',
  network: 'Could not reach the AI service — check your connection and try again.',
  other: 'AI summary is unavailable for this article.',
  missingKey: 'AI summary is not configured. Please add GROQ_API_KEY or GEMINI_API_KEY in Vercel Environment Variables.',
};

export const AI_RETRYABLE = new Set(['rate', 'network', 'other']);

export function classifyAiError(raw, status) {
  const msg = String(raw || '');

  if (/location is not supported|unsupported (country|region|location)|not available in your (country|region)/i.test(msg)) {
    return 'geo';
  }

  if (
    /exceeded your current quota|quota exceeded|per day limit|daily limit|requests per day|\(RPD\)|tokens per day|\(TPD\)/i.test(msg)
  ) {
    return 'quota';
  }

  if (status === 429 || /rate limit|too many requests|RESOURCE_EXHAUSTED/i.test(msg)) {
    return 'rate';
  }

  if (status === 401 || status === 403 || /api key|permission|unauthorized|forbidden|invalid/i.test(msg)) {
    return 'auth';
  }

  if (/network|failed to fetch|ERR_|load failed|timeout|net::/i.test(msg)) {
    return 'network';
  }

  return 'other';
}

function readCacheMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function readSummaryCache(url) {
  if (!url) return null;
  const entry = readCacheMap()[url];
  return entry?.data || null;
}

export function writeSummaryCache(url, data) {
  if (!url || !data) return;

  try {
    const map = readCacheMap();
    delete map[url];
    map[url] = { data, ts: Date.now() };

    const keys = Object.keys(map);

    if (keys.length > CACHE_LIMIT) {
      keys.slice(0, keys.length - CACHE_LIMIT).forEach((key) => {
        delete map[key];
      });
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // Cache is optional.
  }
}

export function offlineDigest(article) {
  const text = String(article?.description || '').trim();

  if (text.length < 80) return null;

  const sentences = text
    .split(/(?<=[।.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25);

  if (!sentences.length) return null;

  const summary = sentences.slice(0, 2).join(' ');
  const rest = sentences.slice(2);

  const points = rest
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .sort((a, b) => text.indexOf(a) - text.indexOf(b));

  if (!summary) return null;

  return {
    summary,
    points,
    provider: 'offline',
  };
}

export async function summarizeArticle(article, signal) {
  let response;

  try {
    response = await fetch('/api/ai-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: article.title,
        description: article.description || '',
      }),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;

    const networkError = new Error(AI_STATUS_MESSAGES.network);
    networkError.kind = 'network';
    throw networkError;
  }

  let data;

  try {
    data = await response.json();
  } catch {
    const error = new Error(AI_STATUS_MESSAGES.other);
    error.kind = 'other';
    throw error;
  }

  if (!response.ok) {
    const kind = data?.error?.kind
      || classifyAiError(data?.error?.message, response.status);

    const error = new Error(data?.error?.message || AI_STATUS_MESSAGES[kind] || AI_STATUS_MESSAGES.other);
    error.kind = kind;
    error.friendly = AI_STATUS_MESSAGES[kind] || AI_STATUS_MESSAGES.other;

    throw error;
  }

  if (!data || typeof data.summary !== 'string' || !data.summary.trim()) {
    const error = new Error(AI_STATUS_MESSAGES.other);
    error.kind = 'other';
    throw error;
  }

  return {
    summary: data.summary,
    points: Array.isArray(data.points) ? data.points : [],
    provider: data.provider || 'AI',
  };
}
