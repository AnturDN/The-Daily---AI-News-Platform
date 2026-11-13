# The Daily - AI News Platform

A modern, browser-based AI news platform built with **React 19, Vite 8, and Tailwind CSS 4**. It brings together live news from Google News RSS and trusted Bangla news publishers, AI-powered article summaries, multilingual editions, and an offline-ready Progressive Web App (PWA).

The platform uses a multi-source news fetching system, a Groq-to-Gemini AI provider fallback, and local caching to provide a smooth news-reading experience.

## Features

### News Discovery

- **Live News Feed** - Fetches news from Google News RSS and supported publisher feeds.
- **Multiple Editions** - Browse news across 30 country editions and 17 languages.
- **News Categories** - Explore General, World, Technology, Business, Science, and Sports.
- **Breaking News Ticker** - Displays recent headlines in a scrolling ticker.
- **Trending Topics** - Automatically identifies popular topics from available headlines.
- **Smart Search** - Search articles with debouncing and recent search history.
- **Date Filters** - Filter articles by Today, This Week, This Month, or All Time.
- **Sorting** - Sort articles by newest, oldest, or source.
- **Infinite Scrolling** - Load additional articles as you browse.
- **Manual Refresh** - Refresh the current news feed whenever needed.

### AI-Powered Reading

- **AI Article Summaries** - Generate short summaries with three key points.
- **Multiple AI Providers** - Uses Groq as the primary provider and Google Gemini as the fallback.
- **Model Fallback** - Automatically tries alternative configured models when a model is unavailable or its quota is exhausted.
- **Offline Digest** - Provides a locally generated article digest when AI services are unavailable.
- **Summary Caching** - Stores generated summaries to avoid unnecessary repeated API requests.
- **Reading Progress** - Displays reading progress inside the article viewer.
- **Adjustable Text Size** - Increase or decrease article text size.
- **Reading Time** - Estimates how long an article takes to read.

### Article Management

- **Bookmarks** - Save articles for later with timestamps.
- **Reading History** - Track previously read articles.
- **Hide Read Articles** - Remove already-read articles from the main feed.
- **Article Navigation** - Move between previous and next articles.
- **Social Sharing** - Share articles using the Web Share API with clipboard fallback.
- **Keyboard Shortcuts** - Navigate and control the application using keyboard commands.

### News Photography

- Uses images provided by publisher RSS feeds whenever available.
- Retrieves publisher article images through an Open Graph image lookup.
- Supports image caching to reduce repeated requests.
- Displays source monograms when article images are unavailable.

### User Experience

- **Dark and Light Themes** - Switch between reading themes.
- **Responsive Layout** - Designed for desktop, tablet, and mobile screens.
- **Progressive Web App** - Install the application on supported devices.
- **Offline Support** - Caches the application shell and previously available content.
- **Loading Skeletons** - Provides visual feedback while news is loading.
- **Toast Notifications** - Displays application status and feedback.
- **Back to Top** - Quickly return to the beginning of the news feed.
- **Reading Statistics** - Track reading activity, saved articles, searches, and estimated reading time.

## News Data Architecture

The application uses a multi-source news fetching strategy to reduce dependence on a single news API.

The sources are tried in the following order:

1. **Google News RSS** - Primary news source. No API key is required.
2. **Publisher RSS Feeds** - Integrates supported feeds from প্রথম আলো, BBC বাংলা, and বাংলা ট্রিবিউন.
3. **Public RSS Relays** - Provides alternative feed access when the primary relay is unavailable.
4. **rss2json** - Additional RSS conversion fallback.
5. **GNews API** - Last-resort news provider when the RSS fetching routes are unavailable.

News data is normalized into a common article structure and cached locally to reduce unnecessary requests.

## AI Summary Architecture

The AI summary system uses a provider and model fallback strategy, executed entirely inside the `/api/ai-summary` serverless function so the API keys stay server-side.

**Provider priority:**

1. Groq (ladder: `openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `qwen/qwen3.8-27b`, ~1,000 free requests/day each)
2. Google Gemini (ladder: `gemini-3.8-flash` → `gemini-3.6-flash` → `gemma-4-31b-it` → `gemma-4-26b-a4b-it` → flash-lites)
3. Local offline digest in the browser

When a configured model becomes unavailable or reaches its usage limit, the application attempts another available model.

Generated summaries are cached per article to reduce repeated API calls.

The offline digest provides a basic locally generated summary from available article text when external AI services cannot be used.

> AI summary availability depends on valid API credentials, provider availability, model access, and applicable usage limits. Model names and free-tier quotas may change over time.

## Tech Stack

| Category | Technology |
|---|---|
| Frontend | React 19 |
| Build Tool | Vite 8 |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |
| HTTP Client | Axios |
| Data Fetching | Fetch API |
| News Sources | Google News RSS, Publisher RSS, GNews |
| AI Integration | Groq API, Google Gemini API |
| Offline Support | Service Workers, Workbox |
| PWA | vite-plugin-pwa |
| Local Storage | Browser localStorage |

## Getting Started

Follow these steps to run the project locally.

### Prerequisites

Make sure you have installed:

- Node.js (compatible with the installed Vite version)
- npm
- Git

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/AnturDN/The-Daily---AI-News-Platform.git
```

**2. Navigate to the project directory**

```bash
cd The-Daily---AI-News-Platform
```

**3. Install dependencies**

```bash
npm install
```

**4. Configure environment variables**

Create a `.env` file from the provided example:

```bash
cp .env.example .env
```

Open `.env` and configure the API credentials you want to use.

**5. Start the development server**

```bash
npm run dev
```

Open the local URL displayed in your terminal to access the application.

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Vite development server |
| `npm run build` | Creates the production build |
| `npm run preview` | Previews the production build locally |
| `npm run lint` | Runs ESLint to check code quality |

## Environment Variables

The application supports the following environment variables.

| Variable | Description | Where it is read | Required |
|---|---|---|---|
| `VITE_GNEWS_API_KEY` | GNews API key for the news fallback | Browser | Optional |
| `GROQ_API_KEY` | Groq API key — primary AI summarizer | Serverless only (`api/ai-summary.js`) | Optional* |
| `GROQ_MODEL` | Preferred Groq model (tried first) | Serverless only | Optional |
| `GEMINI_API_KEY` | Google Gemini API key — fallback summarizer | Serverless only (`api/ai-summary.js`) | Optional* |
| `GEMINI_MODEL` | Preferred Gemini model (tried first) | Serverless only | Optional |

\* At least one of `GROQ_API_KEY` / `GEMINI_API_KEY` is needed for AI summaries. Without them the app still works — every article shows the quota-free offline digest instead.

> The Groq and Gemini keys are **never shipped to the browser** — the browser calls the same-origin `/api/ai-summary` route and the serverless function carries the keys. Only the optional GNews key uses the `VITE_` prefix (it is only a fallback news wire, and free tier keys are low-risk; rotate it if it is ever abused).

API credentials can be obtained from:

- [Groq Console](https://console.groq.com/keys)
- [Google AI Studio](https://aistudio.google.com)
- [GNews](https://gnews.io)

The RSS-based news system does not require a GNews API key when its primary RSS sources are accessible.

## Security Considerations

**Important: Vite environment variables are not automatically private.**

Any environment variable prefixed with `VITE_` is exposed to the client-side application during the build process. This means API credentials using these variable names can be inspected by visitors through browser developer tools or the generated JavaScript bundle.

Follow these security practices:

- Never commit `.env`, `.env.local`, or other files containing real API credentials.
- Keep `.env.example` limited to placeholder values.
- Do not assume that putting an API key in an environment variable makes it secret.
- Use restricted API keys and configure provider-side usage limits wherever supported.
- Monitor API usage to identify unexpected requests.

**This release already follows the backend recommendation for AI keys:** the Groq and Gemini credentials live only inside the `api/ai-summary.js` serverless function (Vercel Environment Variables), and the browser talks to it through the same-origin `/api/ai-summary` route — so the AI keys never appear in the client bundle.

## Deployment

The application includes three same-origin API routes that the site depends on:

- `/rss-fetch` — fetches allowlisted RSS feeds server-side (no CORS, follows publisher redirects safely).
- `/og-image` — resolves a publisher's lead photo from article metadata.
- `/api/ai-summary` — the Groq → Gemini summary ladder, keys server-side.

In development and preview these are served by Vite middleware registered in `vite.config.js`; the exact same handlers run as Vercel serverless functions from the `api/` directory in production (`vercel.json` rewrites `/rss-fetch` and `/og-image` to their functions).

### Deploying to Vercel (production)

1. Push the project to GitHub, or run `vercel` from the project folder.
2. Import the repo at vercel.com (framework preset: **Vite** — detected automatically).
3. **Project → Settings → Environment Variables** — add:
   - `GROQ_API_KEY` — a fresh free key from [console.groq.com/keys](https://console.groq.com/keys) (an old rejected key answers 403 on every request)
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com)
   - `VITE_GNEWS_API_KEY` — optional GNews fallback key
4. Deploy. Verify the three routes:
   - `https://<your-app>.vercel.app/rss-fetch?url=https%3A%2F%2Fwww.prothomalo.com%2Fstories.rss` → RSS XML
   - `https://<your-app>.vercel.app/api/ai-summary` (POST with `{"title":"...","description":"..."}`) → JSON summary
   - the site loads live Bangla headlines with photos

> **If you redeploy after changing only `.env`:** Vercel does not read `.env` files — serverless keys must be set in the dashboard's Environment Variables, then trigger **Redeploy**.

### বাংলায় সংক্ষেপে (deploy এর জন্য)

1. এই প্রজেক্ট ফোল্ডার থেকে `vercel --prod` চালান (আগে `npm install` দিন)।
2. Vercel ড্যাশবোর্ড → Settings → Environment Variables এ **GROQ_API_KEY** (নতুন ফ্রি key — console.groq.com/keys) এবং **GEMINI_API_KEY** (aistudio.google.com) বসান।
3. তারপর **Redeploy** দিন — AI সারসংক্ষেপ চালু হয়ে যাবে।

### Local Production Preview

For the complete application functionality, build and preview the project using:

```bash
npm run build
npm run preview
```

The Vite preview server provides the same RSS, image and AI summary relay middleware, reading keys from your `.env`.

### Static Hosting (without the relays)

The frontend can be deployed as a static application after `npm run build` (files land in `dist/`). Static hosting has no serverless functions, so:

- The same-origin RSS relay is absent — the app falls back to public relays (allorigins, codetabs) and rss2json, then the metered GNews key.
- The OG image relay is absent — cards keep feed photos and monograms.
- There is no `/api/ai-summary` — articles show the offline digest (no AI keys are ever exposed).

For full functionality, deploy to Vercel (or any host with Node serverless functions) as described above.

## Project Structure

```text
The-Daily---AI-News-Platform/
│
├── api/                     # Vercel serverless functions (also reused by
│   ├── ai-summary.js        #   the dev/preview middleware in vite.config.js)
│   ├── og-image.js
│   └── rss-fetch.js
│
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   ├── pwa-192.png
│   └── pwa-512.png
│
├── src/
│   ├── api/
│   │   ├── aiSummary.js
│   │   ├── newsApi.jsx
│   │   └── rssApi.js
│   │
│   ├── components/
│   │   ├── ArticleModal.jsx
│   │   ├── BackToTop.jsx
│   │   ├── BreakingTicker.jsx
│   │   ├── Footer.jsx
│   │   ├── Header.jsx
│   │   ├── NewsCard.jsx
│   │   ├── NewsSection.jsx
│   │   ├── SkeletonCard.jsx
│   │   ├── StatsModal.jsx
│   │   └── Toasts.jsx
│   │
│   ├── hooks/
│   │   └── useOgImage.js
│   │
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
│
├── .env.example
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── vercel.json
├── vite.config.js
├── test-ai-summary.mjs      # unit tests — node test-ai-summary.mjs
├── test-rss-relay.mjs        # unit tests — node test-rss-relay.mjs
├── FEATURES.md
├── FIXES_REPORT.md
├── UNSLOP_REPORT.md
└── README.md
```

## Browser Storage

The application uses browser localStorage to maintain selected user preferences and reading activity.

Stored information includes:

- Theme preferences
- Selected country and language
- Bookmarks
- Reading history
- Search history
- Reading statistics
- Article and RSS cache data
- AI summary cache and provider usage information

This information is stored locally in the user's browser and is not synchronized between devices.

Clearing browser storage may remove locally saved application data.

## Contributing

Contributions, suggestions, and bug reports are welcome.

To contribute:

1. Fork the repository.
2. Create a new feature branch.
3. Make your changes.
4. Run the lint and production build checks.
5. Submit a pull request.

## License

No license has currently been specified for this repository. Please contact the repository owner before redistributing or reusing the project.

## Credits

**News Sources:** Google News RSS, প্রথম আলো, BBC বাংলা, বাংলা ট্রিবিউন, and GNews.

**AI Providers:** [Groq](https://groq.com) and [Google Gemini](https://aistudio.google.com).

**Design Inspiration:** The interface follows the newsroom-inspired visual direction documented in `UNSLOP_REPORT.md`.

---

**Designed & Developed by Antur Deb Nath**

[GitHub Repository](https://github.com/AnturDN/The-Daily---AI-News-Platform)