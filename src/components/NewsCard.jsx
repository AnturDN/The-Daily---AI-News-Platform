import { useState } from 'react';
import { ArrowUpRight, Bookmark } from 'lucide-react';
import { formatTime, readingTime } from '../api/newsApi';
import useOgImage from '../hooks/useOgImage';

export default function NewsCard({ article, isBookmarked, isRead, toggleBookmark, onArticleClick }) {
  const [imgBroken, setImgBroken] = useState(false);
  const image = useOgImage(article);
  const showImage = Boolean(image) && !imgBroken;
  const monogram = (article.source?.name || 'The Daily').trim().charAt(0) || 'N';

  return (
    <article className="flex flex-col group relative">
      <button
        onClick={(e) => { e.stopPropagation(); toggleBookmark(article); }}
        className="absolute top-2 right-2 z-10 p-2 bg-surface/90 rounded-md hover:bg-surface transition-colors"
        aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark article'}
      >
        <Bookmark
          size={16}
          strokeWidth={1.5}
          className={isBookmarked ? 'fill-accent text-accent' : 'text-ink-2'}
        />
      </button>

      <div onClick={() => onArticleClick(article)} className="cursor-pointer">
        <div className="block aspect-[16/9] bg-raised overflow-hidden mb-3">
          {showImage ? (
            <img
              src={image}
              alt={article.title || 'Article image'}
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-opacity duration-150 group-hover:opacity-90"
              onError={() => setImgBroken(true)}
            />
          ) : (
            <div className="w-full h-full grid place-items-center bg-raised">
              <span className="font-serif text-5xl text-ink-3/50 select-none">{monogram}</span>
            </div>
          )}
        </div>
        <p className="font-mono text-xs text-ink-3 mb-2">
          {article.source?.name || 'Unknown source'} · {formatTime(article.publishedAt)} · {readingTime(article)} min{isRead ? ' · read' : ''}
        </p>
        <h3 className={`font-serif text-lg font-medium leading-snug mb-2 transition-colors ${isRead ? 'text-ink-2' : 'group-hover:text-accent'}`}>
          {article.title}
        </h3>
        <p className="text-sm text-ink-2 mb-3 line-clamp-2">
          {article.description}
        </p>
      </div>

      <div className="mt-auto pt-2">
        <span
          onClick={() => onArticleClick(article)}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-accent cursor-pointer transition-colors"
        >
          Read more <ArrowUpRight size={16} strokeWidth={1.5} />
        </span>
      </div>
    </article>
  );
}
