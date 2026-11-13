/* Unit tests for the /api/rss-fetch relay (api/rss-fetch.js).
   Run: node test-rss-relay.mjs
   Proves the Prothom Alo crash fix: their feed answers with the malformed
   Content-Type "text/xml; application/rss+xml; charset=utf-8" (two media
   types joined), which the first deployed revision passed through verbatim
   and the Vercel edge answered with 500 FUNCTION_INVOCATION_FAILED. */

import assert from 'node:assert/strict';
import handler from './api/rss-fetch.js';

/* A Vercel-shaped (req, res) pair. */
function invoke(url, method = 'GET') {
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    hasHeader(k) { return k.toLowerCase() in headers; },
    status(code) { this.statusCode = code; return this; },
    send(text) { this.payload = text; return this; },
    headers,
  };
  return { req: { method, url }, res, out: () => ({ status: res.statusCode, headers, payload: res.payload }) };
}

let passed = 0;
function ok(label) { passed += 1; console.log('  PASS —', label); }

const XML_HEAD = '<?xml version="1.0"?><rss version="2.0"><channel>';

/* Mocked upstream fetch responses. */
const realFetch = globalThis.fetch;
function mockUpstream(responder) {
  globalThis.fetch = async (url, opts) => responder(String(url), opts || {});
}
function feedResponse({ status = 200, type = 'text/xml; charset=utf-8', body = XML_HEAD, location = null }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (k === 'content-type' ? type : k === 'location' ? location : null) },
    text: async () => body,
    body: { cancel: async () => {} },
  };
}

/* ---------- 1. the Prothom Alo crash fix ---------- */

{
  console.log('\n[1] Prothom Alo malformed Content-Type is normalized');
  mockUpstream((url) => feedResponse({ type: 'text/xml; application/rss+xml; charset=utf-8' }));
  const { req, res, out } = invoke('/api/rss-fetch?url=' + encodeURIComponent('https://www.prothomalo.com/stories.rss'));
  await handler(req, res);
  assert.equal(out().status, 200); ok('HTTP 200 — no crash');
  assert.equal(out().headers['content-type'], 'text/xml; charset=utf-8'); ok('double media type collapsed to one clean value');
  assert.ok(out().payload.startsWith('<?xml')); ok('the RSS body passed through');
}

/* ---------- 2. clean content types survive ---------- */

{
  console.log('\n[2] Clean upstream content types are preserved');
  for (const [raw, expected] of [
    ['application/rss+xml', 'application/rss+xml; charset=utf-8'],
    ['application/rss+xml; charset=UTF-8', 'application/rss+xml; charset=UTF-8'],
    ['text/xml; charset=ISO-8859-1', 'text/xml; charset=ISO-8859-1'],
    ['application/atom+xml; charset=utf-8', 'application/atom+xml; charset=utf-8'],
    ['', 'text/xml; charset=utf-8'],
  ]) {
    mockUpstream(() => feedResponse({ type: raw, body: XML_HEAD }));
    const { req, res, out } = invoke('/api/rss-fetch?url=' + encodeURIComponent('https://feeds.bbci.co.uk/bengali/rss.xml'));
    await handler(req, res);
    const ct = out().headers['content-type'];
    assert.equal(ct, expected); ok(`"${raw}" -> "${ct}"`);
  }

  /* text/html is rejected before any header is set — covered again in [5]. */
  mockUpstream(() => feedResponse({ type: 'text/html; charset=utf-8', body: '<html></html>' }));
  const htmlcase = invoke('/api/rss-fetch?url=' + encodeURIComponent('https://feeds.bbci.co.uk/bengali/rss.xml'));
  await handler(htmlcase.req, htmlcase.res);
  assert.equal(htmlcase.out().status, 502); ok('text/html upstream -> 502');
}

/* ---------- 3. gatekeeping ---------- */

{
  console.log('\n[3] Only allowlisted feed URLs may enter');
  mockUpstream(() => feedResponse({}));
  for (const bad of [
    'https://example.com/feed.rss',
    'http://news.google.com/rss',
    'https://news.google.com/extra/path',
    'https://www.prothomalo.com/other.rss',
  ]) {
    const { req, res, out } = invoke('/api/rss-fetch?url=' + encodeURIComponent(bad));
    await handler(req, res);
    assert.equal(out().status, 403); ok(`rejected: ${bad}`);
  }
  const { req, res, out } = invoke('/api/rss-fetch');
  await handler(req, res);
  assert.equal(out().status, 403); ok('missing url param -> 403');
}

/* ---------- 4. redirect policing ---------- */

{
  console.log('\n[4] Redirects must stay on allowlisted hosts');
  mockUpstream((url) => {
    if (url.startsWith('https://www.banglatribune.com/feed')) {
      return feedResponse({ status: 301, location: 'https://attacker.example/feed' });
    }
    return feedResponse({});
  });
  const { req, res, out } = invoke('/api/rss-fetch?url=' + encodeURIComponent('https://www.banglatribune.com/feed/'));
  await handler(req, res);
  assert.equal(out().status, 502); ok('redirect to a foreign host -> 502, not followed');

  let redirected = false;
  mockUpstream((url) => {
    if (!redirected && url === 'https://news.google.com/rss') {
      redirected = true;
      return feedResponse({ status: 302, location: 'https://news.google.com/rss?hl=bn&gl=BD&ceid=BD:bn' });
    }
    return feedResponse({});
  });
  const second = invoke('/api/rss-fetch?url=' + encodeURIComponent('https://news.google.com/rss'));
  await handler(second.req, second.res);
  assert.equal(second.out().status, 200); ok('redirect back onto an allowlisted feed -> followed and served');
}

/* ---------- 5. bad upstream bodies ---------- */

{
  console.log('\n[5] HTML / oversized / broken upstream bodies');
  mockUpstream(() => feedResponse({ type: 'text/html', body: '<html>login page</html>' }));
  const html = invoke('/api/rss-fetch?url=' + encodeURIComponent('https://feeds.bbci.co.uk/bengali/rss.xml'));
  await handler(html.req, html.res);
  assert.equal(html.out().status, 502); ok('HTML instead of RSS -> 502');

  mockUpstream(() => feedResponse({ body: 'x'.repeat(5 * 1024 * 1024) }));
  const big = invoke('/api/rss-fetch?url=' + encodeURIComponent('https://feeds.bbci.co.uk/bengali/rss.xml'));
  await handler(big.req, big.res);
  assert.equal(big.out().status, 502); ok('oversized feed -> 502');

  mockUpstream(() => feedResponse({ status: 404, body: '' }));
  const gone = invoke('/api/rss-fetch?url=' + encodeURIComponent('https://feeds.bbci.co.uk/bengali/rss.xml'));
  await handler(gone.req, gone.res);
  assert.equal(gone.out().status, 502); ok('feed 404 -> 502');
}

/* ---------- 6. method + HEAD behaviour ---------- */

{
  console.log('\n[6] Non-GET methods');
  mockUpstream(() => feedResponse({}));
  const post = invoke('/api/rss-fetch?url=' + encodeURIComponent('https://news.google.com/rss'), 'POST');
  await handler(post.req, post.res);
  assert.equal(post.out().status, 405); ok('POST -> 405 with Allow: GET');
  assert.equal(post.out().headers.allow, 'GET'); ok('Allow header present');
}

globalThis.fetch = realFetch;
console.log(`\nALL ${passed} ASSERTION GROUPS PASSED`);
