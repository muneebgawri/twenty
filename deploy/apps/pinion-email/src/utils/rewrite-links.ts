/**
 * Wrap the links in a message body so clicks can be attributed.
 *
 * Applied to the BODY ONLY, never to the signature, and that is a correctness
 * rule rather than a tidiness one: the signature carries the unsubscribe link,
 * and an unsubscribe that routes through a tracker is both worse practice and
 * one more thing that can break between a recipient wanting out and getting
 * out. The logo link is left alone for the same reason -- there is nothing to
 * learn from it.
 *
 * Only http(s) is touched. A mailto: or tel: link is how someone replies or
 * calls; rewriting either would break it for no signal.
 */
const HREF = /(<a\b[^>]*?\bhref\s*=\s*)("([^"]*)"|'([^']*)')/gi;

const isTrackable = (url: string): boolean => {
  try {
    const parsed = new URL(url.trim());

    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/** Every distinct http(s) destination in the html, in document order. */
export const extractLinks = (html: string): string[] => {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(HREF)) {
    const raw = (match[3] ?? match[4] ?? '').trim();
    // Entity-decoded before matching: an href written &amp; is the same URL
    // as one written &, and the mint keys its map on the real destination.
    const url = raw.replace(/&amp;/g, '&');

    if (isTrackable(url) && !seen.has(url)) {
      seen.add(url);
      found.push(url);
    }
  }

  return found;
};

/**
 * Swap each href for its tracked equivalent.
 *
 * A destination with no entry in the map is LEFT AS IT WAS. Minting can fail
 * per link, and a link that silently became unclickable would be a far worse
 * outcome than one that simply is not measured.
 */
export const rewriteLinks = (
  html: string,
  trackedByDestination: Record<string, string>,
): string =>
  html.replace(HREF, (whole, prefix: string, _quoted: string, dq?: string, sq?: string) => {
    const raw = (dq ?? sq ?? '').trim();
    const url = raw.replace(/&amp;/g, '&');
    const tracked = trackedByDestination[url];

    if (!tracked) {
      return whole;
    }

    // Re-escape: the tracked URL is a query string full of ampersands, and an
    // unescaped & in an attribute is invalid HTML that some clients mangle.
    return `${prefix}"${tracked.replace(/&/g, '&amp;')}"`;
  });
