# Fixes Report — AI News Platform

All issues found in the original upload, and how each one was fixed. The project builds, lints and runs cleanly after these changes.

## Critical fixes

| # | Issue | Fix |
| --- | --- | --- |
| 1 | **`npm run build` / `npm run dev` failed with `vite: Permission denied`** — the zip shipped a `node_modules` folder whose executables lost their permission bits (Windows zip round-trip), so `node_modules/.bin/vite` could not run on Linux/macOS. | Fresh `npm install` (regenerates executable bits) and `node_modules` is excluded from the final zip — never ship `node_modules`. |
| 2 | **Hard-coded API keys in source code** — the GNews key was pasted inside `App.jsx` and `src/api/newsApi.jsx`, and the Gemini key inside `ArticleModal.jsx`. | Moved both to `.env` (`VITE_GNEWS_API_KEY`, `VITE_GEMINI_API_KEY`), read via `import.meta.env`, added `.env` to `.gitignore`, added `.env.example`. Clear on-screen error messages when a key is missing. |
| 3 | **Category tabs called the wrong endpoint** — the app hit `/search?q=general`, `/search?q=world`, … which returns articles that merely *contain the word* "general"/"world" instead of actual category headlines. | Categories now use `/top-headlines?category=…` (all six app categories are valid GNews categories). Search still uses `/search?q=…`. |
| 4 | **Date filter silently broken for categories** — `top-headlines` (the correct endpoint) has no `from` parameter, so the old `&from=` append approach would stop working. | Date filter is applied client-side (`filterByDate`) for category browsing, and server-side (`&from=`) for search where GNews supports it. |
| 5 | **`max=12` in `newsApi.jsx`** — the GNews free plan rejects any `max` above 10 with a 400 error. | Reduced to `MAX_PER_PAGE = 10` everywhere. |
| 6 | **Crash when `article.source` is null** — `{article.source.name}` in `NewsCard` and `ArticleModal` throws a TypeError on articles without a source. | Optional chaining with fallback: `article.source?.name \|\| 'Unknown Source'`. |
| 7 | **Crash on corrupted `localStorage.bookmarks`** — `JSON.parse` of an invalid value throws during initial render and white-screens the app. | Safe reader helper with `try/catch` + array validation, falling back to `[]`. |
| 8 | **`postcss.config.js` was a 0-byte empty file** — leftover/broken PostCSS config in a project that uses the Tailwind v4 Vite plugin (which needs no PostCSS config at all). | Deleted, along with the now-unneeded `postcss` and `autoprefixer` dev dependencies. |

## Configuration / asset fixes

| # | Issue | Fix |
| --- | --- | --- |
| 9 | **`index.html` referenced `/vite.svg`** which does not exist → 404 favicon. | Replaced the default Vite bolt with a branded "D." favicon (`public/favicon.svg`). |
| 10 | **PWA manifest pointed at non-existent `icon.png`** (both sizes) and `includeAssets` listed a non-existent `favicon.ico` → the app was not installable as a PWA. | Generated real PNG icons (`public/pwa-192.png`, `public/pwa-512.png`) matching the brand, updated the manifest and `includeAssets`. |
| 11 | **Tailwind v3 leftovers** — `@tailwind utilities;` directive in `index.css` (invalid in Tailwind v4) and a v3-style `tailwind.config.js` that Tailwind v4 never loads (its `darkMode: "class"` and font theme silently did nothing — dark mode actually works via the `@custom-variant` in CSS). | Removed the v3 directive; deleted the v3 config; documented that the CSS `@custom-variant` is the real dark-mode switch. |
| 12 | **Fonts never applied** — `index.html` loads *Newsreader* and *Space Grotesk*, but CSS set `body` to *Inter* and `.font-serif` to *Fraunces* (neither loaded), so the UI silently fell back to system fonts. | CSS now uses the fonts that are actually loaded: `Space Grotesk` body, `Newsreader` serif headings. |
| 13 | **Duplicate API logic** — `newsApi.jsx` was dead code that disagreed with the inline copy in `App.jsx` (different endpoint, different `max`, different key). | Single source of truth: `App.jsx` now imports `fetchNews` from `src/api/newsApi.jsx`. |
| 14 | **Unused dependency `@google/generative-ai`** — the modal uses a raw `fetch`, never this SDK. | Removed from `package.json` (plus `postcss`/`autoprefixer` from #8). |
| 15 | **`.gitignore` did not ignore `.env`** — keys would be committed on the first `git add`. | `.env`, `.env.local`, `.env.*.local` added to `.gitignore`. |
| 16 | **Generic template README** — the file described the default Vite template, not this project. | Replaced with a real README: features, setup, env vars, API limits, deploy guide, structure. |

## UX / robustness improvements

| # | Issue | Fix |
| --- | --- | --- |
| 17 | **Modal could only be closed by the X button/backdrop click** — keyboard users were stuck. | Escape key closes the modal; `role="dialog"` + `aria-modal` + label added. |
| 18 | **Gemini request kept running after the modal closed** and React 19 StrictMode double-fired it in dev, burning quota. | `AbortController` per request, aborted on unmount / article change; aborted requests never touch state. |
| 19 | **Gemini response crash paths** — `data.candidates[0]…` assumes the API always returns candidates (it doesn't for blocked/empty responses). | Optional-chained extraction with a graceful error message. |
| 20 | **React list keys were array indexes** while pages append items — wrong card identity across "Load More" clicks. | Cards are keyed by `article.url`. |
| 21 | **429 rate-limit errors showed a misleading message** ("Unable to load news") — the GNews free plan allows ~1 request/second. | Dedicated message for 429, and clearer messages for other failures. |
| 22 | **Titles/brand mismatch** — tab said "AI News Terminal", manifest said "The Daily AI News", header said "The Daily." | Unified: "The Daily — AI News Platform" (+ meta description for SEO). |

## Verified after fixing

- `npm install` — clean install, lockfile regenerated for the trimmed dependency set
- `npm run lint` — passes
- `npm run build` — production build + PWA assets (service worker, manifest, icons) generated
- Dev-server browser test — headlines load, category switch works, dark mode toggles, search returns results, bookmarks persist, modal opens
- GNews API pagination (`page` param) verified live on both endpoints
- Gemini model name `gemini-3.6-flash` verified as a valid, stable model in the current Gemini API

> Note: the Gemini API blocks requests from datacenter/server regions ("User location is not supported"). That is an environment restriction, not a code issue — from a normal residential connection the AI summary works. GNews was fully tested live.

## Postscript — quota UX (this release)

Two more rough edges surfaced in real use, same family as #21:

| # | Issue | Fix |
| --- | --- | --- |
| 23 | **A spent Gemini daily quota dumped its raw provider error into the summary panel** ("You exceeded your current quota… Please retry in 22h26m…"), and every reopen of the same article burned another request. | Summaries are cached per article (FIFO, 80); quota/ rate/ key/ network failures are classified into one calm sentence each; after a daily-limit reply the app trusts the provider's own retry window and skips calls for that long; transient failures get a "Try again" button; model switchable via `VITE_GEMINI_MODEL`. Classifier covered by 12 unit tests, including the exact production error text. |
| 24 | **A spent GNews daily quota showed "Request failed with status code 403"** (and 401 showed a similar raw line). | Plain-worded messages: 403 → daily quota (resets midnight UTC), 401 → rejected key, offline → cached pages note. Verified live against the real 403 on the production build. |
