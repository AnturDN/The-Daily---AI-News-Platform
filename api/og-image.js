
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BATCHEXECUTE_URL =
  'https://news.google.com/_/DotsSplashUi/data/batchexecute';

const GN_ARTICLE_URL =
  /^https:\/\/news\.google\.com\/rss\/articles\/([A-Za-z0-9_-]+)/i;

const GENERIC_GN_IMAGE =
  /lh3\.googleusercontent\.com\/J6_coFbogxhRI9iM864NL_liGXvsQp2AupsKei7z0cNNfDvGUmWUy20nuUhkREQyrpY4bEeIBuc/i;

const TIMEOUT = 15000;
const GOOGLE_TIMEOUT = 12000;
const DNS_TIMEOUT = 5000;
const MAX_REDIRECTS = 5;

const GOOGLE_PAGE_LIMIT = 800000;
const PUBLISHER_PAGE_LIMIT = 700000;
const GOOGLE_RESPONSE_LIMIT = 1000000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'bn,en;q=0.9,en-US;q=0.8',
};

// Check private and reserved IPv4 addresses.
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (n) => !Number.isInteger(n) || n < 0 || n > 255,
    )
  ) {
    return true;
  }

  const [a, b, c] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a === 255
  );
}

// Expand IPv6 addresses into eight groups.
function expandIPv6(ip) {
  let value = ip.toLowerCase();

  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const ipv4 = value.slice(lastColon + 1);

    if (isIP(ipv4) !== 4) return null;

    const octets = ipv4.split('.').map(Number);

    const first = (
      (octets[0] << 8) |
      octets[1]
    ).toString(16);

    const second = (
      (octets[2] << 8) |
      octets[3]
    ).toString(16);

    value = `${value.slice(0, lastColon)}:${first}:${second}`;
  }

  const halves = value.split('::');

  if (halves.length > 2) return null;

  const left = halves[0]
    ? halves[0].split(':')
    : [];

  const right =
    halves.length === 2 && halves[1]
      ? halves[1].split(':')
      : [];

  if (
    left.concat(right).some(
      (part) => !/^[0-9a-f]{1,4}$/.test(part),
    )
  ) {
    return null;
  }

  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }

  const missing = 8 - left.length - right.length;

  if (missing < 1) return null;

  return [
    ...left,
    ...Array(missing).fill('0'),
    ...right,
  ];
}

// Check private and reserved IPv6 addresses.
function isPrivateIPv6(ip) {
  const parts = expandIPv6(ip);

  if (!parts) return true;

  // Only globally routable unicast space (2000::/3).
  const first = parseInt(parts[0], 16);

  if (first < 0x2000 || first > 0x3fff) {
    return true;
  }

  const second = parseInt(parts[1], 16);
  const third = parseInt(parts[2], 16);

  // Documentation and special-purpose ranges.
  if (first === 0x2001 && second === 0x0db8) return true;
  if (first === 0x2001 && second === 0x0002) return true;
  if (first === 0x2001 && second === 0x0010) return true;
  if (first === 0x2001 && second === 0x0020) return true;
  if (first === 0x2001 && second === 0x0000) return true;

  // 6to4.
  if (first === 0x2002) return true;

  // Documentation range.
  if (
    first === 0x3fff &&
    second === 0x0000 &&
    third === 0x0000
  ) {
    return true;
  }

  return false;
}

// Check both IPv4 and IPv6 addresses.
function isPrivateIP(ip) {
  const version = isIP(ip);

  if (version === 4) {
    return isPrivateIPv4(ip);
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();

    // Handle IPv4-mapped IPv6 addresses.
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7);

      if (isIP(mapped) === 4) {
        return isPrivateIPv4(mapped);
      }

      const mappedParts = expandIPv6(normalized);

      if (!mappedParts) return true;

      const high = parseInt(mappedParts[6], 16);
      const low = parseInt(mappedParts[7], 16);

      const embeddedIPv4 = [
        high >> 8,
        high & 255,
        low >> 8,
        low & 255,
      ].join('.');

      return isPrivateIPv4(embeddedIPv4);
    }

    return isPrivateIPv6(normalized);
  }

  return true;
}

// DNS lookup with timeout.
async function lookupWithTimeout(hostname, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('DNS lookup timed out'));
    }, DNS_TIMEOUT);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Request timed out'));
    };

    signal?.addEventListener('abort', onAbort, {
      once: true,
    });

    lookup(hostname, {
      all: true,
      verbatim: true,
    })
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timer);

        signal?.removeEventListener(
          'abort',
          onAbort,
        );
      });
  });
}

// Validate URL before making a request.
async function isSafeUrl(value, signal) {
  try {
    const url = new URL(value);

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.localhost') ||
      url.hostname.endsWith('.local')
    ) {
      return false;
    }

    const hostname = url.hostname.replace(
      /^\[|\]$/g,
      '',
    );

    // Direct IP address.
    if (isIP(hostname)) {
      return !isPrivateIP(hostname);
    }

    // Resolve hostname and validate every returned IP.
    const addresses = await lookupWithTimeout(
      hostname,
      signal,
    );

    return (
      addresses.length > 0 &&
      addresses.every(
        ({ address }) => !isPrivateIP(address),
      )
    );
  } catch {
    return false;
  }
}

// Fetch with manual redirect validation.
async function safeFetch(value, options = {}) {
  let currentUrl = value;

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount++
  ) {
    if (options.signal?.aborted) {
      throw new Error('Request timed out');
    }

    if (
      !(await isSafeUrl(
        currentUrl,
        options.signal,
      ))
    ) {
      throw new Error('Unsafe URL');
    }

    const response = await fetch(currentUrl, {
      ...options,
      redirect: 'manual',
    });

    if (
      ![301, 302, 303, 307, 308].includes(
        response.status,
      )
    ) {
      return {
        response,
        finalUrl: currentUrl,
      };
    }

    const location = response.headers.get('location');

    await response.body?.cancel().catch(() => {});

    if (!location) {
      throw new Error('Missing redirect location');
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new Error('Too many redirects');
    }

    currentUrl = new URL(location, currentUrl).href;
  }

  throw new Error('Too many redirects');
}

// Read response body with a strict byte limit.
async function readLimitedBody(
  response,
  limit,
  signal,
  stopAtHeadClose = false,
) {
  const reader = response.body?.getReader();

  if (!reader) return '';

  const decoder = new TextDecoder('utf-8');

  let text = '';
  let received = 0;

  try {
    while (received < limit) {
      if (signal?.aborted) {
        throw new Error('Request timed out');
      }

      const { done, value } = await reader.read();

      if (done) break;

      const remaining = limit - received;

      const chunk = value.subarray(
        0,
        remaining,
      );

      received += chunk.byteLength;

      text += decoder.decode(chunk, {
        stream: true,
      });

      if (
        stopAtHeadClose &&
        /<\/head\s*>/i.test(text)
      ) {
        break;
      }

      if (chunk.byteLength < value.byteLength) {
        break;
      }
    }

    text += decoder.decode();

    return text;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// Fetch and read an HTML page.
async function readPage(
  url,
  {
    stopAtHeadClose = false,
    budget,
  },
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT,
  );

  try {
    const { response, finalUrl } = await safeFetch(
      url,
      {
        signal: controller.signal,
        headers: BROWSER_HEADERS,
      },
    );

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});

      throw new Error(
        `Publisher returned ${response.status}`,
      );
    }

    const contentType =
      response.headers.get('content-type') || '';

    if (
      contentType &&
      !/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(
        contentType,
      )
    ) {
      await response.body?.cancel().catch(() => {});

      throw new Error(
        'Publisher response is not HTML',
      );
    }

    const html = await readLimitedBody(
      response,
      budget,
      controller.signal,
      stopAtHeadClose,
    );

    return {
      html,
      finalUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Extract image URL from publisher metadata.
function extractImage(html, baseUrl) {
  if (!html) return null;

  const attr = (regex) => {
    const match = regex.exec(html);

    return match
      ? match[1].trim()
      : null;
  };

  const candidate =
    attr(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    ) ||
    attr(
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    ) ||
    attr(
      /<meta[^>]*property=["']og:image:(?:url|secure_url)["'][^>]*content=["']([^"']+)["']/i,
    ) ||
    attr(
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image:(?:url|secure_url)["']/i,
    ) ||
    attr(
      /<meta[^>]*name=["']twitter:(?:image|image:src)["'][^>]*content=["']([^"']+)["']/i,
    ) ||
    attr(
      /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:(?:image|image:src)["']/i,
    ) ||
    attr(
      /<meta[^>]*itemprop=["']image["'][^>]*content=["']([^"']+)["']/i,
    ) ||
    attr(
      /<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
    ) ||
    attr(
      /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']image_src["']/i,
    ) ||
    attr(
      /<img[^>]*\ssrc=["']([^"']+)["']/i,
    );

  if (!candidate) return null;

  try {
    const imageUrl = new URL(candidate, baseUrl);

    // Only allow HTTPS images.
    if (imageUrl.protocol !== 'https:') {
      return null;
    }

    if (
      imageUrl.username ||
      imageUrl.password
    ) {
      return null;
    }

    if (GENERIC_GN_IMAGE.test(imageUrl.href)) {
      return null;
    }

    return imageUrl.href;
  } catch {
    return null;
  }
}

// Decode Google News article URL.
async function decodeGoogleNewsArticle(
  gnUrl,
  articleId,
) {
  const { html } = await readPage(gnUrl, {
    stopAtHeadClose: false,
    budget: GOOGLE_PAGE_LIMIT,
  });

  const sg = /data-n-a-sg="([^"]+)"/.exec(html);
  const ts = /data-n-a-ts="([^"]+)"/.exec(html);

  if (!sg || !ts) return null;

  const ctx = [
    [
      'X',
      'X',
      ['X', 'X'],
      null,
      null,
      1,
      1,
      'US:en',
      null,
      1,
      null,
      null,
      null,
      null,
      null,
      0,
      1,
    ],
    'X',
    'X',
    1,
    [1, 1, 1],
    1,
    1,
    null,
    0,
    0,
    null,
    0,
  ];

  const inner = JSON.stringify([
    'garturlreq',
    ctx,
    articleId,
    Number(ts[1]) || ts[1],
    sg[1],
  ]);

  const body =
    'f.req=' +
    encodeURIComponent(
      JSON.stringify([
        [
          [
            'Fbv4je',
            inner,
            null,
            '0',
          ],
        ],
      ]),
    );

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    GOOGLE_TIMEOUT,
  );

  try {
    const response = await fetch(
      BATCHEXECUTE_URL,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded;charset=UTF-8',
          ...BROWSER_HEADERS,
        },
        body,
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});

      return null;
    }

    const raw = await readLimitedBody(
      response,
      GOOGLE_RESPONSE_LIMIT,
      controller.signal,
    );

    const start = raw.indexOf('[');

    if (start < 0) return null;

    const rows = JSON.parse(
      raw.slice(start),
    );

    for (const row of rows) {
      if (
        Array.isArray(row) &&
        row[0] === 'wrb.fr' &&
        typeof row[2] === 'string'
      ) {
        try {
          const payload = JSON.parse(row[2]);

          if (
            Array.isArray(payload) &&
            payload[0] === 'garturlres' &&
            typeof payload[1] === 'string' &&
            /^https:\/\//i.test(payload[1])
          ) {
            return payload[1];
          }
        } catch {
          // Ignore unrelated response rows.
        }
      }
    }
  } catch (error) {
    console.error(
      'Google News decoding failed:',
      error.message,
    );
  } finally {
    clearTimeout(timer);
  }

  return null;
}

// Main API handler.
export default async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=21600, stale-while-revalidate=86400',
  );

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');

    return res.status(405).json({
      image: null,
    });
  }

  try {
    const requestUrl = new URL(
      req.url,
      'https://example.com',
    );

    const target = requestUrl.searchParams.get('url');

    if (
      !target ||
      !(await isSafeUrl(target))
    ) {
      return res.status(403).json({
        image: null,
      });
    }

    const parsed = new URL(target);

    let pageUrl = parsed.href;

    const googleMatch = GN_ARTICLE_URL.exec(
      parsed.href,
    );

    // Decode Google News article URL.
    if (googleMatch) {
      const publisherUrl = await decodeGoogleNewsArticle(
        parsed.href,
        googleMatch[1],
      );

      if (
        !publisherUrl ||
        !(await isSafeUrl(publisherUrl))
      ) {
        return res.status(200).json({
          image: null,
        });
      }

      pageUrl = publisherUrl;
    }

    // Read publisher page.
    const { html, finalUrl } = await readPage(
      pageUrl,
      {
        stopAtHeadClose: true,
        budget: PUBLISHER_PAGE_LIMIT,
      },
    );

    const image = extractImage(
      html,
      finalUrl,
    );

    return res.status(200).json({
      image,
    });
  } catch (error) {
    console.error(
      'OG image relay error:',
      error.message,
    );

    return res.status(502).json({
      image: null,
    });
  }
}
