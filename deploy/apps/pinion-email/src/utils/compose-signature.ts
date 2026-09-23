export type SignatureBranding = {
  logoUrl?: string | null;
  logoLinkUrl?: string | null;
  logoWidthPx?: number | null;
  footerHtml?: string | null;
  /**
   * Herald's self-serve unsubscribe link, with {{email}} where the recipient
   * goes. Herald mints a per-recipient JWT when IT sends; a tool sending
   * outside Herald cannot, so it publishes this static per-tenant form
   * instead (UnsubscribeTokenService.tenantKey). Shape:
   *
   *   {API_URL}/public/unsubscribe/self?e={{email}}&t=<tenantId>&k=<tenantKey>
   *
   * Stored with the placeholder, never with an address: the signature is
   * written once and mailed to thousands of different people.
   */
  unsubscribeUrlTemplate?: string | null;
};

export const RECIPIENT_PLACEHOLDER = '{{email}}';

/**
 * Assemble the HTML appended to an outgoing message.
 *
 * ONE definition, used by the settings preview and by the send path. If the
 * preview built its own version, the thing people approve would not be the
 * thing that goes out — and a signature is exactly the kind of detail nobody
 * re-checks after the first time.
 *
 * Layout is deliberately dated: a table, inline styles, a width attribute on
 * the image. Mail clients are not browsers. Outlook ignores most CSS, Gmail
 * strips <style> blocks, and several honour only the HTML width attribute, so
 * flexbox and classes would render as a pile of left-aligned text.
 */
const escapeAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Only http(s). A signature is authored by one person and mailed to everyone
 * they write to, so a `javascript:` logo link would be stored once and
 * delivered thousands of times.
 */
export const safeUrl = (raw: string | null | undefined): string | null => {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  try {
    const parsed = new URL(raw.trim());

    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

/**
 * Put the recipient into Herald's unsubscribe template.
 *
 * Returns null when there is no template or no recipient, so a signature
 * assembled without one simply carries no unsubscribe link rather than a
 * broken one advertising `{{email}}` to the reader.
 */
export const resolveUnsubscribeUrl = (
  template: string | null | undefined,
  recipientEmail: string | null | undefined,
): string | null => {
  if (typeof template !== 'string' || template.trim().length === 0) {
    return null;
  }
  if (typeof recipientEmail !== 'string' || recipientEmail.trim().length === 0) {
    return null;
  }

  const filled = template
    .trim()
    .split(RECIPIENT_PLACEHOLDER)
    .join(encodeURIComponent(recipientEmail.trim().toLowerCase()));

  return safeUrl(filled);
};

/**
 * Newlines become <br>.
 *
 * The field accepts HTML, but people type signatures the way they type
 * signatures -- one line per line. HTML collapses those, so a four-line block
 * arrived as one run-on sentence. Converting unconditionally keeps the box
 * WYSIWYG: what is typed is what is sent, and the preview shows it either way.
 * Someone hand-writing multi-line markup gets breaks where their source had
 * them, which the preview makes obvious immediately.
 */
export const newlinesToBreaks = (html: string): string =>
  html.replace(/\r\n?|\n/g, '<br>');

export const composeSignature = (
  body: string | null | undefined,
  branding: SignatureBranding | null | undefined,
  recipientEmail?: string | null,
): string => {
  const parts: string[] = [];

  const logoUrl = safeUrl(branding?.logoUrl);
  if (logoUrl !== null) {
    const width = branding?.logoWidthPx;
    const widthAttribute =
      typeof width === 'number' && width > 0 && width <= 1000
        ? ` width="${Math.round(width)}"`
        : '';

    const image =
      `<img src="${escapeAttribute(logoUrl)}" alt=""${widthAttribute} ` +
      `style="border:0;display:block;max-width:100%;height:auto">`;

    const linkUrl = safeUrl(branding?.logoLinkUrl);
    parts.push(
      linkUrl === null
        ? image
        : `<a href="${escapeAttribute(linkUrl)}">${image}</a>`,
    );
  }

  const trimmedBody = (body ?? '').trim();
  if (trimmedBody.length > 0) {
    parts.push(newlinesToBreaks(trimmedBody));
  }

  const footer = (branding?.footerHtml ?? '').trim();
  if (footer.length > 0) {
    parts.push(newlinesToBreaks(footer));
  }

  const unsubscribeUrl = resolveUnsubscribeUrl(
    branding?.unsubscribeUrlTemplate,
    recipientEmail,
  );
  if (unsubscribeUrl !== null) {
    parts.push(
      `<a href="${escapeAttribute(unsubscribeUrl)}" ` +
        `style="color:#9ca3af;text-decoration:underline">Unsubscribe</a>`,
    );
  }

  if (parts.length === 0) {
    return '';
  }

  const rows = parts
    .map(
      (part) =>
        `<tr><td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;` +
        `font-size:13px;line-height:1.4;color:#333333">${part}</td></tr>`,
    )
    .join('');

  return `<table cellpadding="0" cellspacing="0" border="0"><tbody>${rows}</tbody></table>`;
};
