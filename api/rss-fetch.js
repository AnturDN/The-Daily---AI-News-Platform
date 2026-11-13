/* Same-origin RSS relay — a Vercel serverless function (and, via
   vite.config.js, the dev/preview server middleware) that fetches an
   allowlisted feed server-side so the browser never fights CORS.

   Fixes over the first deployed revision:
   - The origin's Content-Type is NEVER passed through verbatim. Prothom Alo
     sends "text/xml; application/rss+xml; charset=utf-8" — two media types
     joined together, which the Vercel edge cannot process and answered with
     FUNCTION_INVOCATION_FAILED (500). It is now normalized to a single
     "type/subtype; charset=..." value.
   - The body is read with response.text() (undici handles gzip/deflate and
     stream decoding) with an explicit size cap afterwards.
   - Redirects are followed manually and every hop must stay on an
     allowlisted host, so the relay remains a closed door to SSRF. */

const ALLOWED_HOSTS = new Set([
  'news.google.com',
  'www.prothomalo.com',
  'feeds.bbci.co.uk',
  'www.banglatribune.com',
]);

/* Only these exact feed shapes may enter the relay on the first request. */
const ALLOWED_FEEDS = [
  /^https:\/\/news\.google\.com\/rss(?:\/|\?|$)/i,
  /^https:\/\/www\.prothomalo\.com\/stories\.rss\/?$/i,
  /^https:\/\/feeds\.bbci\.co\.uk\/[^/?]+(?:\/[^/?]+)?\/rss\.xml\/?$/i,
  /^https:\/\/www\.banglatribune\.com\/feed\/?$/i,
];

const MAX_SIZE = 4 * 1024 * 1024;
const TIMEOUT = 20000;
const MAX_REDIRECTS = 5;

function validFeed(url, initial = false) {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:') return false;
    if (!ALLOWED_HOSTS.has(parsed.hostname)) return false;

    if (initial) {
      return ALLOWED_FEEDS.some((pattern) => pattern.test(parsed.href));
    }

    return true;
  } catch {
    return false;
  }
}

/* One clean media type + optional charset — never a passthrough. */
function cleanContentType(raw) {
  const type = /^([a-z]+\/[a-z0-9.+-]+)/i.exec(String(raw || '').trim());

  if (!type) return 'text/xml; charset=utf-8';

  const base = type[1].toLowerCase();

  if (
    !['text/xml', 'application/xml', 'application/rss+xml', 'application/atom+xml'].includes(base)
  ) {
    return 'text/xml; charset=utf-8';
  }

  const charset = /charset=([\w-]+)/i.exec(String(raw));

  return `${base}; charset=${charset ? charset[1] : 'utf-8'}`;
}

async function fetchFeed(url) {
  let currentUrl = url;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!validFeed(currentUrl, i === 0)) {
      throw new Error('Invalid feed URL or redirect');
    }

    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: {
        'User-Agent': 'Mozilla/5.0 TheDailyRSS/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');

      await response.body?.cancel().catch(() => {});

      if (!location) {
        throw new Error('Missing redirect location');
      }

      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Feed returned ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (/text\/html/i.test(contentType)) {
      await response.body?.cancel().catch(() => {});
      throw new Error('Expected RSS but received HTML');
    }

    const text = await response.text();

    if (text.length > MAX_SIZE) {
      throw new Error('Feed is too large');
    }

    if (!/^\s*(<\?xml|<rss|<feed)/i.test(text.slice(0, 300))) {
      throw new Error('Invalid RSS response');
    }

    return {
      text,
      contentType: cleanContentType(contentType),
    };
  }

  throw new Error('Too many redirects');
}

export default async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=600',
  );

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  try {
    const requestUrl = new URL(req.url, 'https://example.com');
    const target = requestUrl.searchParams.get('url');

    if (!target || !validFeed(target, true)) {
      return res.status(403).send('Forbidden feed URL');
    }

    const result = await fetchFeed(target);

    res.setHeader('Content-Type', result.contentType);

    return res.status(200).send(result.text);
  } catch (error) {
    console.error('RSS relay error:', error?.message || error);

    return res.status(502).send('Feed relay failed');
  }
}
