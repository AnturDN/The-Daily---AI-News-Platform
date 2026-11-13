/* Unit tests for the AI summary chain in the Vercel architecture:
   - src/api/aiSummary.js — the browser side (calls /api/ai-summary)
   - api/ai-summary.js    — the serverless provider ladder (Groq -> Gemini)
   Run: node test-ai-summary.mjs
   Both modules are plain ESM with no import.meta.env usage, so Node can
   import them directly; localStorage and fetch are mocked per test. */

import assert from 'node:assert/strict';
import {
  AI_STATUS_MESSAGES,
  AI_RETRYABLE,
  classifyAiError,
  offlineDigest,
  readSummaryCache,
  summarizeArticle,
  writeSummaryCache,
} from './src/api/aiSummary.js';
import aiSummaryHandler from './api/ai-summary.js';

/* ---------- mocks ---------- */

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

/* A Vercel-shaped Response for mocked client fetches. */
function res(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ABORT = { name: 'AbortError', message: 'aborted' };

let calls = [];
let bodies = [];
function mockFetch(routes) {
  calls = [];
  bodies = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    bodies.push(String(opts?.body || ''));
    if (opts?.signal?.aborted) throw ABORT;
    const seen = `${url} ${opts?.body || ''}`; // the model name lives in the POST body
    for (const { match, status, body, text } of routes) {
      if (match.test(seen)) {
        if (text !== undefined) return text;
        return res(status, typeof body === 'function' ? body(String(url)) : body);
      }
    }
    throw new Error('unexpected url: ' + url);
  };
}

/* A Vercel-shaped (req, res) pair for invoking the serverless handler. */
function makeReqRes(url, { method = 'GET', body } = {}) {
  const headers = {};
  const req = { method, url, body };
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    hasHeader(k) { return k.toLowerCase() in headers; },
    status(code) { this.statusCode = code; return this; },
    json(payload) {
      this.headersSent = true;
      this.payload = payload;
      this.headers['content-type'] = 'application/json; charset=utf-8';
      return this;
    },
    send(text) {
      this.headersSent = true;
      this.payload = text;
      return this;
    },
    headers,
  };
  return { req, res, result: () => ({ status: res.statusCode, headers, payload: res.payload }) };
}

const storage = makeStorage();
globalThis.localStorage = storage;

const ARTICLE = {
  url: 'https://example.com/news/1',
  title: 'ঢাকায় নতুন মেট্রো রুট চালু',
  description: 'ঢাকা শহরে আজ একটি নতুন মেট্রো রুট চালু হয়েছে। কর্তৃপক্ষ জানিয়েছে এটি যাত্রীদের যাতায়াত সময় অনেক কমিয়ে দেবে। প্রথম দিনেই হাজারো মানুষ এই সেবা ব্যবহার করেছেন। ভাড়া নির্ধারণ করা হয়েছে মাত্র বিশ টাকা।',
};

const GEMINI_OK = {
  candidates: [{ content: { parts: [{ text: '{"summary":"নতুন মেট্রো রুট চালু হয়েছে ঢাকায়।","points":["হাজারো যাত্রী","ভাড়া ২০ টাকা","সময় কমবে"]}' }] } }],
};

const GEMINI_QUOTA_429 = {
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generate_content_free_tier_requests, limit: 20. Please retry in 13h23m6.399s.',
    status: 'RESOURCE_EXHAUSTED',
  },
};

let passed = 0;
function ok(label) { passed += 1; console.log('  PASS —', label); }

/* ========== PART A — the browser client (src/api/aiSummary.js) ========== */

/* ---------- 1. success path ---------- */

{
  console.log('\n[1] summarizeArticle -> POST /api/ai-summary, JSON parsed');
  mockFetch([
    {
      match: /api\/ai-summary/,
      status: 200,
      body: { summary: 'নতুন মেট্রো রুট চালু হয়েছে ঢাকায়।', points: ['ক', 'খ', 'গ'], provider: 'gemini' },
    },
  ]);
  const result = await summarizeArticle(ARTICLE);
  assert.equal(result.provider, 'gemini'); ok('provider carried through');
  assert.ok(result.summary.includes('মেট্রো রুট')); ok('summary parsed');
  assert.equal(result.points.length, 3); ok('key points parsed');
  assert.equal(calls.length, 1); ok('exactly one request');
  const sent = JSON.parse(bodies[0]);
  assert.equal(sent.title, ARTICLE.title); ok('title sent in the POST body');
  assert.equal(sent.description, ARTICLE.description); ok('description sent in the POST body');
}

/* ---------- 2. server error kinds map to friendly UI messages ---------- */

{
  console.log('\n[2] Server 503 missingKey -> the Vercel setup message');
  mockFetch([
    {
      match: /api\/ai-summary/,
      status: 503,
      body: { error: { kind: 'missingKey', message: 'AI summary is not configured on the server.' } },
    },
  ]);
  let caught;
  try { await summarizeArticle(ARTICLE); } catch (err) { caught = err; }
  assert.equal(caught?.kind, 'missingKey'); ok('kind carried from the server');
  assert.equal(caught?.friendly, AI_STATUS_MESSAGES.missingKey); ok('friendly UI message attached');
  assert.ok(caught.friendly.includes('GROQ_API_KEY')); ok('message names the env var to set');
}

{
  console.log('\n[3] Server 401 auth + 429 quota + 502 other kinds');
  mockFetch([{ match: /api\/ai-summary/, status: 401, body: { error: { kind: 'auth', message: 'The AI provider rejected its API key.' } } }]);
  let caught;
  try { await summarizeArticle(ARTICLE); } catch (err) { caught = err; }
  assert.equal(caught?.kind, 'auth'); ok('401 -> auth kind');
  assert.ok(AI_STATUS_MESSAGES.auth.includes('Vercel')); ok('auth message points at Vercel env vars');

  mockFetch([{ match: /api\/ai-summary/, status: 429, body: { error: { kind: 'quota', message: 'The available AI model quotas have been reached.' } } }]);
  try { await summarizeArticle(ARTICLE); } catch (err) { caught = err; }
  assert.equal(caught?.kind, 'quota'); ok('429 -> quota kind');

  mockFetch([{ match: /api\/ai-summary/, status: 502, body: { error: { kind: 'other', message: 'AI summary is unavailable for this article.' } } }]);
  try { await summarizeArticle(ARTICLE); } catch (err) { caught = err; }
  assert.equal(caught?.kind, 'other'); ok('502 -> other kind');
  assert.ok(AI_RETRYABLE.has('other')); ok('other is retryable in the UI');
}

/* ---------- 4. transport failures ---------- */

{
  console.log('\n[4] network failure / non-JSON body / abort');
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  let caught;
  try { await summarizeArticle(ARTICLE); } catch (err) { caught = err; }
  assert.equal(caught?.kind, 'network'); ok('fetch rejection -> network kind');

  mockFetch([{ match: /api\/ai-summary/, status: 200, text: '<html>not json</html>' }]);
  try { await summarizeArticle(ARTICLE); } catch (err) { caught = err; }
  assert.equal(caught?.kind, 'other'); ok('non-JSON 200 -> other kind');

  mockFetch([]);
  const controller = new AbortController();
  controller.abort();
  try { await summarizeArticle(ARTICLE, controller.signal); } catch (err) { caught = err; }
  assert.equal(caught?.name, 'AbortError'); ok('aborted signal surfaces untouched');
}

/* ---------- 5. classification of real provider messages ---------- */

{
  console.log('\n[5] classifyAiError against live API error text');
  assert.equal(classifyAiError(GEMINI_QUOTA_429.error.message, 429), 'quota'); ok('Gemini daily-exhaustion -> quota');
  assert.equal(classifyAiError('Rate limit reached for requests per day (RPD). Please try again in 21h12m', 429), 'quota'); ok('Groq RPD daily -> quota');
  assert.equal(classifyAiError('Rate limit reached for requests per minute (RPM). Please try again in 27s', 429), 'rate'); ok('Groq RPM burst -> rate');
  assert.equal(classifyAiError('Forbidden', 403), 'auth'); ok('bare Groq 403 -> auth');
  assert.equal(classifyAiError('User location is not supported for the API use.', 400), 'geo'); ok('Gemini region wall -> geo');
  assert.equal(classifyAiError('Failed to fetch', undefined), 'network'); ok('browser TypeError text -> network');
}

/* ---------- 6. the offline digest + the cache ---------- */

{
  console.log('\n[6] offlineDigest (Bangla)');
  const d = offlineDigest(ARTICLE);
  assert.ok(d); ok('digest produced from a Bangla description');
  assert.ok(d.summary.includes('মেট্রো রুট')); ok('first sentences became the summary');
  assert.ok(Array.isArray(d.points) && d.points.length >= 1); ok('remaining sentences became points');
  assert.equal(offlineDigest({ description: 'খুব ছোট' }), null); ok('too-short description -> no digest');
}

{
  console.log('\n[7] summary cache');
  const data = { summary: 'ক্যাশ করা সারাংশ', points: ['১'], provider: 'gemini' };
  writeSummaryCache('https://example.com/a', data);
  assert.deepEqual(readSummaryCache('https://example.com/a'), data); ok('round-trip works');
  assert.equal(readSummaryCache('https://example.com/missing'), null); ok('miss returns null');
  for (let i = 0; i < 250; i += 1) writeSummaryCache(`https://example.com/n/${i}`, data);
  assert.equal(readSummaryCache('https://example.com/a'), null); ok('FIFO cap evicts the oldest entry');
  assert.ok(readSummaryCache('https://example.com/n/249')); ok('newest entry survives the cap');
}

/* ========== PART B — the serverless provider ladder (api/ai-summary.js) ========== */

const REAL_ENV = { ...process.env };

function withEnv(vars, fn) {
  return async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_MODEL;
    delete process.env.GEMINI_MODEL;
    Object.assign(process.env, vars);
    try { await fn(); } finally {
      for (const k of Object.keys(vars)) delete process.env[k];
      Object.assign(process.env, REAL_ENV);
    }
  };
}

const GOOD_ARTICLE_BODY = { title: ARTICLE.title, description: ARTICLE.description };

await withEnv({ GROQ_API_KEY: 'gsk_live', GEMINI_API_KEY: 'gem_live' }, async () => {
  console.log('\n[8] Serverless: Groq 403 -> gemini-3.8/3.6 quota-spent -> gemma-4-31b serves');
  mockFetch([
    { match: /api\.groq\.com/, status: 403, body: { error: { message: 'Forbidden' } } },
    { match: /gemini-3\.8-flash/, status: 429, body: GEMINI_QUOTA_429 },
    { match: /gemini-3\.6-flash/, status: 429, body: GEMINI_QUOTA_429 },
    { match: /gemma-4-31b-it/, status: 200, body: GEMINI_OK },
  ]);
  const { req, res, result } = makeReqRes('/api/ai-summary', { method: 'POST', body: GOOD_ARTICLE_BODY });
  await aiSummaryHandler(req, res);
  assert.equal(result().status, 200); ok('HTTP 200 after walking the ladder');
  assert.equal(result().payload.provider, 'gemini'); ok('provider reported as gemini');
  assert.ok(result().payload.summary.includes('মেট্রো রুট')); ok('Bangla summary parsed');
  assert.ok(calls.some((c) => c.includes('api.groq.com'))); ok('Groq was tried first');
  assert.ok(calls.some((c) => c.includes('gemma-4-31b-it'))); ok('gemma-4-31b-it was reached');
  assert.ok(!calls.some((c) => c.includes('gemma-4-26b'))); ok('no request past the model that succeeded');
})();

await withEnv({ GROQ_API_KEY: 'gsk_live', GEMINI_API_KEY: 'gem_live' }, async () => {
  console.log('\n[9] Serverless: retired Groq model 404 -> gpt-oss-120b picks it up');
  mockFetch([
    { match: /llama-3\.3-70b-versatile/, status: 404, body: { error: { message: 'The model llama-3.3-70b-versatile does not exist or is decommissioned' } } },
    { match: /api\.groq\.com/, status: 200, body: { choices: [{ message: { content: '{"summary":"Groq সারাংশ","points":["ক","খ","গ"]}' } }] } },
  ]);
  process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
  const { req, res, result } = makeReqRes('/api/ai-summary', { method: 'POST', body: GOOD_ARTICLE_BODY });
  await aiSummaryHandler(req, res);
  delete process.env.GROQ_MODEL;
  assert.equal(result().status, 200); ok('HTTP 200 from Groq');
  assert.equal(result().payload.provider, 'groq'); ok('provider reported as groq');
  assert.ok(bodies[0].includes('llama-3.3-70b-versatile')); ok('pinned model tried first');
  assert.ok(bodies[1].includes('gpt-oss-120b')); ok('ladder fell to a current model');
})();

await withEnv({ GROQ_API_KEY: 'gsk_live', GEMINI_API_KEY: 'gem_live' }, async () => {
  console.log('\n[10] Serverless: dead Groq key + Gemini geo wall -> auth outranks geo');
  mockFetch([
    { match: /api\.groq\.com/, status: 403, body: { error: { message: 'Forbidden' } } },
    { match: /generativelanguage/, status: 400, body: { error: { message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' } } },
  ]);
  const { req, res, result } = makeReqRes('/api/ai-summary', { method: 'POST', body: GOOD_ARTICLE_BODY });
  await aiSummaryHandler(req, res);
  assert.equal(result().status, 401); ok('HTTP 401 — the actionable auth status');
  assert.equal(result().payload.error.kind, 'auth'); ok('auth wins over geo');
})();

await withEnv({ GROQ_API_KEY: 'gsk_live', GEMINI_API_KEY: 'gem_live' }, async () => {
  console.log('\n[11] Serverless: method + body validation');
  const get = makeReqRes('/api/ai-summary', { method: 'GET' });
  await aiSummaryHandler(get.req, get.res);
  assert.equal(get.result().status, 405); ok('GET -> 405');

  const empty = makeReqRes('/api/ai-summary', { method: 'POST', body: { title: '', description: '' } });
  await aiSummaryHandler(empty.req, empty.res);
  assert.equal(empty.result().status, 400); ok('empty title -> 400');

  const huge = makeReqRes('/api/ai-summary', { method: 'POST', body: { title: 'x'.repeat(501), description: '' } });
  await aiSummaryHandler(huge.req, huge.res);
  assert.equal(huge.result().status, 400); ok('over-long title -> 400');
})();

await withEnv({}, async () => {
  console.log('\n[12] Serverless: no keys at all -> 503 missingKey');
  const { req, res, result } = makeReqRes('/api/ai-summary', { method: 'POST', body: GOOD_ARTICLE_BODY });
  await aiSummaryHandler(req, res);
  assert.equal(result().status, 503); ok('HTTP 503');
  assert.equal(result().payload.error.kind, 'missingKey'); ok('missingKey kind');
  assert.ok(Object.keys(result().payload).join(',').includes('error')); ok('no summary leaked');
})();

console.log(`\nALL ${passed} ASSERTION GROUPS PASSED`);
