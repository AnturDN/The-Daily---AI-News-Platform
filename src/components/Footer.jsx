export default function Footer({ handleSelectCategory }) {
  return (
    <footer className="border-t border-hairline mt-16 bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
          <div>
            <h3 className="font-serif text-xl font-medium mb-2">
              The Daily<span className="text-accent-strong">.</span>
            </h3>
            <p className="text-sm text-ink-2 leading-relaxed">
              Live headlines from Google News RSS with the photography of Prothom Alo, BBC Bangla and Bangla Tribune in 30 editions and 17 languages, each summarized by Groq or Gemini AI.
            </p>
          </div>
          <div>
            <h4 className="text-[13px] font-medium text-ink-2 mb-4">Categories</h4>
            <ul className="space-y-2 text-sm">
              {['technology', 'business', 'science'].map((cat) => (
                <li key={cat}>
                  <button
                    onClick={() => handleSelectCategory(cat)}
                    className="capitalize text-ink-2 hover:text-accent transition-colors"
                  >
                    {cat}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-medium text-ink-2 mb-4">Shortcuts</h4>
            <ul className="space-y-2 text-sm text-ink-2">
              <li className="flex gap-2"><span className="font-mono text-xs text-ink-3 w-16 shrink-0">/</span> search</li>
              <li className="flex gap-2"><span className="font-mono text-xs text-ink-3 w-16 shrink-0">t</span> light or dark</li>
              <li className="flex gap-2"><span className="font-mono text-xs text-ink-3 w-16 shrink-0">?</span> your stats</li>
              <li className="flex gap-2"><span className="font-mono text-xs text-ink-3 w-16 shrink-0">← → b s</span> read, save, share</li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-hairline flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-ink-3">
            &copy; {new Date().getFullYear()} Antur Deb Nath. All rights reserved
          </p>
          <p className="font-mono text-xs text-ink-3">
            Designed and developed by Antur Deb Nath
          </p>
        </div>
      </div>
    </footer>
  );
}
