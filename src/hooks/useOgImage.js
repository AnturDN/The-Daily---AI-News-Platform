import { useState, useEffect } from 'react';
import { lookupOgImage } from '../api/rssApi';

/**
 * The image a card shows: the feed's own photography when it has one,
 * else the publisher's lead photo, resolved through the /og-image relay
 * and cached in localStorage — so reopening an article never re-asks.
 * The resolved image is keyed by article URL, so switching articles can
 * never leak the previous one's photo.
 */
export default function useOgImage(article) {
  const url = article?.url || null;
  const feedImage = article?.image || null;
  const [resolved, setResolved] = useState(null); // { url, img }

  useEffect(() => {
    let dead = false;
    if (!url || feedImage) return undefined;
    lookupOgImage(url)
      .then((img) => { if (!dead) setResolved({ url, img }); })
      .catch(() => { /* the monogram holds the card */ });
    return () => { dead = true; };
  }, [url, feedImage]);

  
  const ogImage = resolved && resolved.url === url ? resolved.img : null;
  return feedImage || ogImage;
}
