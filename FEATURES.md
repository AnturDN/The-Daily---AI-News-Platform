# The Daily — what this version adds

The bug-fixed, unslop-styled app gained a reader's worth of new features.
Everything runs in the browser — no new API keys, no backend, no new dependencies.

## The wire

- **Latest strip** — breaking headlines run in a slow pass above the masthead
  (GNews `breaking-news` topic, fetched apart from the feed so it never blocks
  the paper). Hover to hold it, tap a line to open the story. Follows your
  edition.
- **Editions** — 30 country editions × 17 languages, including
  **Bangladesh + Bengali** (bdnews24.com, প্রথম আলো…). The edition drives the
  feed, the search, the ticker — and Gemini answers in the article's own
  language. Remembered between visits.
- **Trending, computed** — topic chips are mined from the titles on the page
  right now (capitalized neighbours become phrases: "James Bond" in, "Take"
  out). Tap one to search it.
- **Search history** — the last eight searches sit next to trending as quiet
  chips, Enter or a tap runs one again.

## Reading

- **Reading time** — every card's dateline ends in "· N min"; the sheet shows
  it too.
- **Mark as read** — opening a story marks it (a "· read" dateline, quieter
  title). "Hide read" clears the page of what you've already covered.
- **The sheet** — reading progress bar, A− / A+ text size (remembered),
  previous / next pager with "3 of 20" position, keyboard control
  (`←` `→` navigate, `b` save, `s` share, `Esc` close).
- **Share** — Web Share API with a clipboard fallback and a toast.

## AI summaries that mind the meter

- **A provider AND model ladder** — Groq first (`openai/gpt-oss-120b` →
  `openai/gpt-oss-20b` → `qwen/qwen3.8-27b`, ~1,000 free requests/day each;
  Groq retired the llama models in August 2026), then Gemini
  (`gemini-3.8-flash` → `gemini-3.6-flash` → `gemma-4-31b-it` →
  `gemma-4-26b-a4b-it` → the flash-lites). Each model has its own daily
  quota: one spent, retired or busy model is walked past silently — the
  next one keeps serving the summaries. A dead Groq key no longer stops
  anything: the Gemini flash models give ~20/day **each** and the Gemma
  models ~1,500/day on the very same key, so the ladder holds well over a
  thousand free summaries a day.
- **Cached forever** — a summary, once generated, never changes, so it is kept
  (FIFO, 200 entries) in localStorage. Reopening an article is instant and
  costs no quota; the sheet marks it "AI summary · cached" and names the
  engine that wrote it (Groq / Gemini).
- **Per-model quota rest** — when a model answers "please retry in 22h", the
  app believes it — for that model only — and later opens skip straight to
  the next live model with zero wasted requests. A rejected key parks its
  provider for ten minutes instead of burning doomed requests on every open.
  Only when the whole ladder rests does the sheet say so plainly
  ("Daily AI summary limits are all reached — … reset overnight").
- **Human error messages** — quota, rate-limit, key and network failures each
  get one calm sentence, never the raw provider dump. Transient failures get
  a "Try again" button; a spent daily quota does not.
- **Model of your choice** — `VITE_GROQ_MODEL` and `VITE_GEMINI_MODEL` in .env
  are optional pins: a pinned model is simply tried **first**, and the ladder
  follows whenever it is retired or its quota is spent.
- **GNews errors, same treatment** — 403 (daily quota, resets midnight UTC),
  401 (rejected key) and offline moments get a plain sentence instead of
  "Request failed with status code 403".

## When the quota rests

- **Parked until it actually resets** — the first 403 of the day parks every
  GNews call — feed, wire, pagination — until the next UTC midnight, the
  exact moment the free plan's counter resets. Reloads and tab switches stop
  asking an API that will only answer 403: no wasted requests, no console
  spam. The parking persists between visits and lifts itself at UTC midnight.
- **The offline edition** — the last front page you actually saw (per search,
  category, date and edition — the six most recent contexts) is kept in
  localStorage, and when the quota is spent or the network is gone the paper
  falls back to it with a dated banner instead of an empty grid. The wire
  runs its last cached lines the same way, so the strip never goes dark.
- **"Try again"** — parked, but the plan was upgraded or the key swapped? One
  click lifts the parking and re-asks for real; a still-spent quota simply
  parks itself again on the first 403.

## Keeping

- **Saved articles** — kept in localStorage with a saved-at timestamp,
  newest first, "Clear all" in one tap.
- **Your reading (the box score)** — articles read, saved, searches,
  estimated reading minutes, top category, most-read source — since the day
  you started. `?` or the activity button opens it; "Reset stats" starts a
  fresh score.

## The paper itself

- **Dark edition** — warm charcoal, one keypress (`t`).
- **Shortcuts** — `/` search, `t` light or dark, `?` your stats.
- **Infinite scroll** — the next page loads itself as you reach the end
  (rate-limit safe); "Load more" stays as the manual way.
- **Sort** — newest, oldest, or by source.
- **Refresh** — one click re-runs the wire.
- **Back to top** — appears once the page has scrolled away.
- **Offline** — a service worker keeps the shell, the last feed and its
  images on the device (NetworkFirst for GNews, StaleWhileRevalidate for
  photography). Reload with the network off and the paper still opens;
  offline/online moments are announced by a toast.
- **Mobile** — search stays on screen at 375px, nothing overflows.

## Robustness

- One gatekeeper spaces GNews calls ≥1.1s apart — the feed, the ticker and
  pagination never trip each other into a 429; the ticker retries once,
  quietly.
- Page results are deduped; a short page ends the feed politely
  ("End of feed") instead of showing an error.
- All preferences (edition, sort, hide-read, text size, theme) persist via
  one effect each; localStorage survives corruption (safe JSON reader).
- Rapid double-clicks on bookmarks are safe (functional state updates).

## Test log

Verified in a real browser (Chromium 157, Vite dev + production preview):

headlines, categories, ticker (pause/tap), editions (Worldwide↔Bangladesh,
English↔Bengali feed + ticker + Bengali search "ক্রিকেট"), trending chips,
search + Enter + history chips, live filtering, date filter, sort
(newest/oldest/source, persisted), hide read (10→7 cards with 3 read),
mark-as-read + stats increments (reads, minutes, top source), stats modal +
`?` + reset, bookmarks (save ×2 in one tick, saved view, clear all + toast),
modal (reading time, share → clipboard toast, save, next/prev navigation,
pager position, font scale persisted, progress bar, Escape), keyboard
(`/`, `t`, `?`, arrows), infinite scroll
(10→20), refresh (page reset), back-to-top (1579→0), offline reload
(app + cached feed render with network off), offline/online toasts, mobile
375px (no overflow, search visible), dark + light screenshots, lint clean,
production build + service worker + runtime caches (gnews-api,
article-images, precache).

Quota hardening (this release): classifier unit tests (12 cases, including
the real "limit: 20, gemini-3.6-flash … Please retry in 22h26m" reply →
quota; per-minute 429 → rate; bad key → auth; fetch failure → network);
summary cache round-trip (generate → reopen: summary instant, "· cached"
label, zero new Gemini calls); cooldown gate (seeded → quota note shown
instantly, zero new calls, no "Try again" for a daily quota); retry button
(empty-candidates reply → "unavailable" + Try again, click re-fetches
gracefully); GNews 403 → friendly daily-quota note, verified live against
the real API on the production build; lint clean; production build rebuilt.

Groq provider chain (this release): the classifier now speaks Groq too —
unit tests grew to 25 cases ("requests per day (RPD)" → quota, "(RPM)" →
rate, "(TPD)" → quota, "try again in 1d" → 24h, Gemini "retry in 22h" →
22h, 401/403 → auth, fetch failure → network); chain runner tests (Groq
serves first with the JSON-mode body and Bearer key; a Groq quota parks
Groq only while Gemini serves; both spent → the calm quota note with zero
fetches attempted; no keys → the missing-key note); browser runs on the
dev server and the production build ("· Groq" dateline on a live summary,
reopen → "· cached · Groq" with zero new requests, Groq garbage → Gemini
serves → "· Gemini", the saved view is no longer hidden by a feed 403 —
a bug found and fixed in this pass; GNews live 403 note re-verified);
lint clean; production build rebuilt.

Quota parking + offline edition (this release): a parked-quota reload fires
ZERO GNews requests — verified live in both directions (the real 403
arrives once, parks until UTC midnight, and no request leaves the browser
again; the discovery load costs one feed + one wire request); the offline
edition renders the cached headlines with the dated banner while parked
and when the network is aborted, with the wire running its cached lines;
"Try again" clears the parking, re-asks exactly once, and the still-spent
quota re-parks with the banner back — a bug found and fixed in this pass:
the banner was wiped and a spurious next-page fetch fired in the 500ms
debounce window (the skeleton now takes the grid at once via the
render-time filter reset, and only a front-page attempt resets the note);
bookmarks, stats, ticker and the article sheet all still work while
parked; lint clean; production build rebuilt.

Known limits (unchanged): GNews free plan returns articles with a 12-hour
delay and ~1 request/second (the gatekeeper respects it); the sandbox this
app is tested from is IP-blocked by both Groq and Gemini, so the summary
fetch path is verified with intercepted responses — from a normal
connection (your browser) the live keys work.

## The keyless wire (this pass)

GNews's 100 requests a day were the paper's ceiling, so the app now runs on a
wire that needs no key at all:

- **Google News RSS, every edition** — the same 30 countries × 17 languages
  the pickers already offer, mapped to Google News editions (`hl/gl/ceid`),
  including Bangladesh + Bengali. Search uses Google News' search feed (105
  results for a Bangla query, live); categories use topic feeds.
- **Prothom Alo's own feed** — Bangla front pages get প্রথম আলো's stories with
  their photography (media:content), merged ahead of Google's take and
  deduped by title. Google News items arrive bare, so cards fall back to a
  serif source monogram — no placeholder service, offline-safe.
- **Delivery chain** — `/rss-fetch` relay built into `vite.config.js`
  (dev + preview servers fetch the feed server-side: no CORS, and Google's
  topic-redirect is followed where it happens) → public relays (allorigins,
  codetabs) → rss2json (free, paced 15s, rests 3min after a 429) → the
  metered GNews key as the last resort → the offline edition cache. A
  host allowlist gates the relay; feed hosts outside Google News / Prothom
  Alo answer 403.
- **Per-context TTL caches** — every feed, ticker and edition is kept ten
  minutes in localStorage, so tab switches, reloads and "load more" pages
  2..n cost nothing; PWA runtime caching keeps the relay responses warm
  offline too. AI summaries stay cached as before (Groq → Gemini chain).
- **A geo-block kind** — both summarizers can answer "location is not
  supported"; the sheet now says so plainly instead of a generic failure,
  and no retry button is offered for it.
- **The reader is always told the truth** — the quota banners now speak of
  feeds and backup keys, not GNews alone, because the paper's news no longer
  depends on one metered source.

Also fixed in this pass: the infinite-scroll sentinel's IntersectionObserver
went quiet after a page of news landed (the observer kept watching but
Chromium stopped delivering its transitions) — it is now re-created after
every page, so the feed pages 1→n to "End of feed" on scroll alone, verified
end-to-end (36/36 cards, bn edition). Bangla stopwords joined the trending
miner. Lint clean; production build + preview relay verified live.

## Photography, race-safe editions, offline digest (this release)

The voice assistant is gone (removed by request), and the three long-standing
complaints — language/country flakiness, missing card images, AI summaries
dying fast — each got a root-cause fix:

- **Edition switching is race-safe** — the feed effect now owns a `cancelled`
  flag: a slow response from the edition you just left can never overwrite
  the grid of the edition you switched to (the silent cause of "sometimes the
  country/language filter works, sometimes not" — verified with rapid
  en→hi→bn switching ending on the correct Bangla grid).
- **Three paper feeds, not one** — the Bangla front page and wire now merge
  প্রথম আলো, **BBC বাংলা** and **বাংলা ট্রিবিউন** in parallel (fetched through
  the same relay, allowlisted in `vite.config.js`), so the photography layer
  is three feeds deep instead of one.
- **Card photography for bare items** — Google News RSS items carry no image,
  so the `/og-image` relay decodes the redirect link to the real publisher URL
  (the article page's per-article signature `data-n-a-sg`/`data-n-a-ts` traded
  via Google's batchexecute endpoint), then lifts the publisher's og:image /
  twitter:image from the page head. The Google-generic placeholder is
  rejected (every card would show one fake photo), results cache 3 days per
  article, failures rest 12 hours, and the monogram remains the honest
  fallback. Verified live: 10/10 images on the bn front page, unique real
  photography (ABC, BBC, Guardian, Daily Star) on the English edition.
- **Offline digest** — when every AI provider rests (quota spent, key
  rejected), the sheet shows a structured digest extracted locally from the
  article excerpt (Bangla থাকা sentence endings respected), labelled
  "Offline digest — extracted locally, no AI quota used", with the plain-word
  reason above it. AI failure no longer means an empty summary section.
- **A rejected key outranks a resting quota** — when Groq answers 403 and
  Gemini answers quota-spent, the reader sees the actionable message ("create
  a fresh key at console.groq.com") rather than the fatalistic one.
- **Groq model ladder** — a decommissioned model (404 / "does not exist")
  automatically retries on `llama-3.1-8b-instant` before the chain moves on.
- **The voice assistant is removed** — the Listen controls, speed cycling,
  the `l` shortcut and every `speechSynthesis` call are gone from the sheet,
  the App and the docs, per the reader's request.

Verified end-to-end on the dev server and the production preview: bn edition
(10 cards, 10 images, Bangla titles, 16 ticker lines), en/US edition (unique
publisher photography on the Google News items), category pages, Bangla
search "ক্রিকেট", bookmarks (save + saved view), modal (no Listen button,
offline digest present), rapid edition switching (race-safe), dark mode,
no page errors; lint clean; production build rebuilt and re-verified.
