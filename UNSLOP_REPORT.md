# Unslop Report — The Daily

The UI was reworked with the **unslop** process (vibecoded → designed), keeping every feature, section and behavior intact. Only the craft changed.

*unslop is by [Damir Sokolovsky (@heydamir)](https://x.com/heydamir), CC BY 4.0 — keep this credit in copies and adaptations.*

## Audit (before)

Signs of slop found in the original screen, each with its location:

| Sign | Where it lived |
| --- | --- |
| Masthead set at weight 800 (`font-extrabold`) | `Header` — "The Daily." |
| Uppercase labels with wide tracking | "TOP STORIES", "AI SUMMARY", source names, footer columns |
| Italic used for emphasis | `ArticleModal` — AI summary paragraph |
| Sparkle icon for anything AI | `ArticleModal` — ✨ "AI Summary" heading |
| Blue links competing with the red brand | `NewsCard` + `ArticleModal` — "Read More" / "Read Full Article" |
| Glass effect in the chrome | `Header` — `backdrop-blur-md bg-opacity-90` |
| `hover:scale-105` zoom, 500ms | `NewsCard` — article images |
| Mixed grays from two ramps (gray-100…gray-800, #0a0a0a) | everywhere |
| Title-case buttons and labels | "Load More Articles", "Read More", "All Time", "This Week" |
| Wordy placeholder | "Search headlines..." |
| Trailing periods on labels/status lines | error messages, buttons |
| No focus ring for keyboard users | every interactive element |
| Mixed icon sizes and strokes (14/16/20/28, stroke 2) | all icons |
| Countdown-style meta as plain text, mixed formats | card timestamps |

## Direction (five lines)

- **Product.** The Daily is a news reader for people who follow AI and technology, with an AI summary of every story.
- **Character.** Editorial, precise, a little warm.
- **World.** The newsroom — paper, ink, the morning edition.
- **Moments.** The news photography carries the color; the AI summary block, set in serif behind a red rule, is the product's own moment.
- **Signature.** The red period in "The Daily." — repeated as the active tab underline, the bookmark fill and the summary rule.

## Passes (what changed)

1. **Spacing** — everything on the 4px grid: 64px header row, 36px nav tabs, one gap rhythm for the card grid (32/40), one padding for all cards, 48px between sections. The search field, select and icon buttons now share one 36px height line.
2. **Color** — one warm neutral ramp replaces the mixed grays: paper `#f7f4ee` / card `#fdfbf7` / raised `#efe9df` by day; charcoal `#161513` / `#1c1a18` / `#262421` by night. Three text roles (ink, secondary, muted). Hairline borders at 8–10%. The paper's red becomes the one accent; blue links removed. Depth comes from surface steps, never shadows or glass.
3. **Icons** — lucide at one size (16, modal close 18) and one stroke (1.5), colored by their text role. The sparkle-for-AI icon is gone; the redundant clock icon became part of the mono dateline.
4. **Copy** — "Search" instead of "Search headlines...", "Load more", "Read more", "All time / Today / This week / This month", sentence case everywhere, no trailing periods, no shouting. The footer says what the product uses: GNews and Gemini.
5. **Type** — hierarchy from size and color, not weight: the highest weight on screen is now 500. Newsreader for headlines, Space Grotesk for the interface, IBM Plex Mono for datelines, counts and meta. Card datelines read like a newspaper: "9to5Mac · 12h ago". Counts use tabular figures.
6. **Layout** — sections and order kept; the section header became a quiet kicker rule with a live dateline ("Tuesday, November 12, 2026") on the right — a front-page touch from the world.
7. **Details** — a visible keyboard focus ring (2px accent) on every interactive element; radius by size (chips 5px, fields 8px, buttons 8–10px); "Load more" is the one primary button — ink on paper by day, paper on ink by night; the bookmark button keeps a 32px touch target.
8. **Visuals** — no decorative filler was added; the photography already in the product is the moment that carries the color. Placeholders match the ramp.
9. **Motion** — the image zoom is gone (a 150ms opacity dip instead); one easing curve `cubic-bezier(0.22, 1, 0.36, 1)` and short durations; the sheet rises 16px over 320ms; only the skeleton keeps a pulse, because it marks live loading.

## Check (after)

- Code scan: zero matches for `font-bold|uppercase|tracking-widest|italic|scale-105|backdrop-blur|blue-|gray-|transition-all|Sparkles` in `src/`
- Verified live in a browser: masthead Newsreader 24px/500, tab height 36px, paper `#f7f4ee` bg with ink `#1f1b16` text in light; charcoal + warm text in dark; mono datelines; "Load more"; curly-quoted search heading
- Lint passes; production build passes; PWA assets regenerate with the new palette

## Files touched

`src/index.css` (tokens + utilities), `index.html` (fonts, theme-color), `src/App.jsx`, `src/api/newsApi.jsx` (shared `formatTime`), and all six components in `src/components/`. No behavior, endpoint or data logic changed.
