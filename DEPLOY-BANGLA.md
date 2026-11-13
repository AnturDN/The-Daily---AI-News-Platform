# Vercel Deployment — বাংলা নির্দেশনা

এই version-এ যে তিনটি সমস্যা ঠিক করা হয়েছে (আপনার Vercel site-এ যেগুলো দেখা যাচ্ছিল):

| সমস্যা | কারণ | সমাধান |
|---|---|---|
| `/rss-fetch` → **500 Internal Server Error** | প্রথম আলো একটা ভাঙা Content-Type পাঠায় (`text/xml; application/rss+xml; charset=utf-8` — দুইটা media type জোড়া), যা Vercel-এর edge প্রসেস করতে পারে না → `api/rss-fetch.js` crash | Content-Type এখন relay-এ পরিষ্কার করে নেওয়া হয়, crash হবে না |
| `corsproxy.io` → **401 Unauthorized** | corsproxy.io এখন পেইড API key চায় | corsproxy fallback থেকে সরিয়ে দেওয়া হয়েছে; relay কাজ করায় দরকারই পড়ে না |
| **"No AI summary API key"** | Vercel-এ AI key set করা হয়নি (আর browser-এ key দেওয়া নিরাপদও না) | AI এখন সম্পূর্ণ **server-side** — Vercel Environment Variables-এ key বসালেই চালু হবে |

## Deploy করার ধাপ (৫ মিনিট)

### ধাপ ১ — Project replace করুন
এই zip-এর ফাইলগুলো দিয়ে আপনার পুরনো project folder-এর ফাইল replace করুন (বা নতুন folder-এ extract করুন)। `.env` ফাইলটাও আছে — local চালানোর জন্য।

### ধাপ ২ — Deploy
```bash
cd "The Daily - AI News Platform"
npm install
vercel --prod
```
(`.vercel` লিংক ফাইল রাখা আছে, তাই একই `the-daily-ai-news-platform` project-এই deploy হবে।)

### ধাপ ৩ — Vercel-এ Environment Variables বসান (একবারই লাগবে)
Vercel Dashboard → আপনার project → **Settings → Environment Variables** → নিচের তিনটা add করুন:

1. **`GEMINI_API_KEY`** — আপনার কাছে যে Google AI Studio key আছে (`.env` ফাইলে `GEMINI_API_KEY=` এর পাশের মানটা) সেটাই বসান
2. **`GROQ_API_KEY`** — ⚠️ পুরনো Groq key-টা **বাতিল হয়ে গেছে** (প্রতিটা request-এ 403 দেয়)। [console.groq.com/keys](https://console.groq.com/keys) থেকে নতুন ফ্রি key নিয়ে বসান (দিনে ~১০০০ request ফ্রি, কার্ড লাগে না)
3. **`VITE_GNEWS_API_KEY`** — optional (fallback news wire)

### ধাপ ৪ — Redeploy
Environment variable দেওয়ার পর **Deployments → সবশেষ deployment → Redeploy** (বা আবার `vercel --prod`)।
> Vercel কখনোই `.env` ফাইল পড়ে না — key গুলো dashboard-এই দিতে হবে।

### ধাপ ৫ — যাচাই
- Site খুলে বাংলা খবর + ছবি আসছে কি না দেখুন
- যেকোনো খবরে ক্লিক করুন → "AI summary"-তে ২ লাইনের সারসংক্ষেপ + ৩টা পয়েন্ট আসবে (কোন provider দিয়েছে সেটাও লেখা থাকবে: · Groq / · Gemini)
- দ্বিতীয়বার একই খবর খুললে "· cached" দেখাবে — কোটা খরচ হবে না

## কোনো সমস্যা হলে

| লক্ষণ | অর্থ | করণীয় |
|---|---|---|
| AI summary: "rejected its server API key" | Groq key ভুল/মৃত | নতুন key নিয়ে Vercel env var আপডেট → Redeploy |
| AI summary: "not available in this region" | Gemini function region থেকে ব্লক (খুবই বিরল) | Groq key বসান; অথবা যেকোনো খবরে offline digest দেখাবেই |
| খবর আসছে না | relay down | কয়েক মিনিট পরে reload; fallback route গুলো নিজে থেকেই চেষ্টা করবে |
| Test চালাতে চাইলে | — | `node test-ai-summary.mjs` এবং `node test-rss-relay.mjs` (৭০টা assertion সব pass করা আছে) |

## পরীক্ষা সম্পন্ন (এই zip যাওয়ার আগে)
- ৬টা feed-ই relay দিয়ে 200 (প্রথম আলোসহ — যেটা আগে 500 করাত)
- corsproxy-এ শূন্য request
- Browser-এ: বাংলা সংস্করণ, ছবি, selector, search, dark mode, article modal, navigation — সব ঠিক
- Console-এ শূন্য runtime error
- AI summary chain: ৪৯টা unit test pass (Groq → Gemini → gemma ladder, সব error path)
- RSS relay: ২১টা unit test pass (crash fix, redirect policing, gatekeeping)
