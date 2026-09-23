import { describe, expect, it } from 'vitest';
import {
  composeSignature,
  resolveUnsubscribeUrl,
  safeUrl,
  withTrackingPixel,
} from '../compose-signature';

describe('safeUrl', () => {
  it('accepts http and https', () => {
    expect(safeUrl('https://pinion.example/logo.png')).toBe(
      'https://pinion.example/logo.png',
    );
    expect(safeUrl('http://pinion.example/logo.png')).toBe(
      'http://pinion.example/logo.png',
    );
  });

  it('rejects anything that could execute', () => {
    // Authored once, delivered to every recipient the sender ever writes to.
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox',
      'not a url',
      '',
      null,
      undefined,
    ]) {
      expect(safeUrl(bad)).toBeNull();
    }
  });
});

describe('composeSignature', () => {
  it('renders the logo, the body and the footer in that order', () => {
    const html = composeSignature('Matt Marshall<br>Pinion', {
      logoUrl: 'https://pinion.example/logo.png',
      logoWidthPx: 160,
      footerHtml: '<small>Registered in England</small>',
    });

    expect(html.indexOf('logo.png')).toBeLessThan(html.indexOf('Matt Marshall'));
    expect(html.indexOf('Matt Marshall')).toBeLessThan(
      html.indexOf('Registered in England'),
    );
  });

  it('sets the width ATTRIBUTE, not just CSS', () => {
    // Several clients honour only the attribute; CSS-only sizing renders the
    // logo at full resolution.
    const html = composeSignature('x', {
      logoUrl: 'https://pinion.example/logo.png',
      logoWidthPx: 160,
    });
    expect(html).toContain('width="160"');
  });

  it('wraps the logo in a link only when one is given', () => {
    const withLink = composeSignature('x', {
      logoUrl: 'https://pinion.example/logo.png',
      logoLinkUrl: 'https://pinion.example',
    });
    expect(withLink).toContain('<a href="https://pinion.example/"');

    const withoutLink = composeSignature('x', {
      logoUrl: 'https://pinion.example/logo.png',
    });
    expect(withoutLink).not.toContain('<a href=');
  });

  it('drops a logo whose URL is not safe, keeping the rest', () => {
    const html = composeSignature('Matt Marshall', {
      logoUrl: 'javascript:alert(1)',
    });
    expect(html).not.toContain('javascript');
    expect(html).toContain('Matt Marshall');
  });

  it('escapes a quote in the URL rather than breaking out of the attribute', () => {
    const html = composeSignature('x', {
      logoUrl: 'https://pinion.example/a%22onerror%3Dalert(1).png',
    });
    expect(html).not.toMatch(/src="[^"]*"[^>]*onerror/);
  });

  it('returns nothing at all when there is nothing to say', () => {
    expect(composeSignature('', null)).toBe('');
    expect(composeSignature(null, { logoUrl: '' })).toBe('');
  });

  it('keeps the body when there is no branding yet', () => {
    const html = composeSignature('Matt Marshall', null);
    expect(html).toContain('Matt Marshall');
    expect(html).not.toContain('<img');
  });
});

describe('unsubscribe link', () => {
  const TEMPLATE =
    'https://heraldengine.com/api/public/unsubscribe/self?e={{email}}&t=tenant-1&k=abc123';

  it('substitutes the recipient and url-encodes them', () => {
    const url = resolveUnsubscribeUrl(TEMPLATE, 'Lead+tag@Example.com');
    expect(url).toContain('e=lead%2Btag%40example.com');
    // A raw '+' in a query string decodes as a space, so the address Herald
    // suppressed would not be the one that was mailed.
    expect(url).not.toContain('e=lead+tag@example.com');
  });

  it('carries no link rather than a broken one when the recipient is unknown', () => {
    // A stored signature is written once and mailed to thousands of different
    // people; the address cannot be baked in.
    expect(resolveUnsubscribeUrl(TEMPLATE, null)).toBeNull();
    expect(resolveUnsubscribeUrl(TEMPLATE, '')).toBeNull();
    expect(composeSignature('x', { unsubscribeUrlTemplate: TEMPLATE })).not.toContain(
      'Unsubscribe',
    );
    expect(
      composeSignature('x', { unsubscribeUrlTemplate: TEMPLATE }),
    ).not.toContain('{{email}}');
  });

  it('appends the link when a recipient is given', () => {
    const html = composeSignature(
      'Matt Marshall',
      { unsubscribeUrlTemplate: TEMPLATE },
      'lead@example.com',
    );
    expect(html).toContain('>Unsubscribe<');
    expect(html).toContain('e=lead%40example.com');
  });

  it('puts the unsubscribe last, after the footer', () => {
    const html = composeSignature(
      'Matt',
      { unsubscribeUrlTemplate: TEMPLATE, footerHtml: 'Pinion Partners Ltd' },
      'lead@example.com',
    );
    expect(html.indexOf('Pinion Partners Ltd')).toBeLessThan(
      html.indexOf('Unsubscribe'),
    );
  });

  it('refuses a template that is not http(s)', () => {
    expect(resolveUnsubscribeUrl('javascript:alert(1)', 'a@b.com')).toBeNull();
  });
});

describe('line breaks', () => {
  it('turns typed newlines into <br>, so a signature is not one run-on line', () => {
    // How this was found: the first real signature on staging rendered as
    // "Matt Marshall Pinion Newswire — pr@… UPDATED" on a single line.
    const html = composeSignature('Matt Marshall\nHead of PR\nPinion', null);
    expect(html).toContain('Matt Marshall<br>Head of PR<br>Pinion');
  });

  it('handles CRLF as one break, not two', () => {
    expect(composeSignature('a\r\nb', null)).toContain('a<br>b');
  });

  it('leaves author HTML intact alongside the breaks', () => {
    const html = composeSignature('Matt\n<a href="https://x.test">site</a>', null);
    expect(html).toContain('Matt<br><a href="https://x.test">site</a>');
  });
});

describe('withTrackingPixel', () => {
  const URL = 'https://heraldengine.com/api/public/track/ext/open?t=abc.def.ghi';

  it('appends a 1x1 image', () => {
    const html = withTrackingPixel('<p>hello</p>', URL);
    expect(html).toContain('<p>hello</p>');
    expect(html).toContain('width="1"');
    expect(html).toContain(URL.replace(/&/g, '&amp;'));
  });

  it('returns the body untouched when tracking is off', () => {
    // Off is the default, and a missing URL must send a normal email rather
    // than one with a broken image in it.
    for (const none of [null, undefined, '']) {
      expect(withTrackingPixel('<p>hello</p>', none)).toBe('<p>hello</p>');
    }
  });

  it('refuses a pixel URL that is not http(s)', () => {
    expect(withTrackingPixel('<p>hi</p>', 'javascript:alert(1)')).toBe('<p>hi</p>');
  });

  it('escapes the ampersands a query string is full of', () => {
    const html = withTrackingPixel('x', 'https://h.test/p?a=1&b=2');
    expect(html).toContain('a=1&amp;b=2');
  });
});

describe('what actually goes on the wire', () => {
  // Reproduces the composer's assembly exactly, because "the code looks right"
  // has already been wrong once here.
  const MINTED =
    'https://staging.heraldengine.com/api/public/track/ext/open?t=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraW5kIjoiZXh0In0.abc-_123';

  it('keeps the pixel in the body that sendEmail receives', () => {
    const signature = composeSignature(
      'Matt Marshall',
      { logoUrl: 'https://pinionnewswire.com/logo.svg', logoWidthPx: 160 },
      'lead@example.com',
    );
    const withSignature = `<p>hello</p><br><br>${signature}`;
    const sent = withTrackingPixel(withSignature, MINTED);

    expect(sent).toContain('<p>hello</p>');
    expect(sent).toContain('Matt Marshall');
    expect(sent).toContain('track/ext/open?t=');
    // The tail matters: a pixel appended before the signature would be inside
    // the table and could be dropped by a client that rewrites tables.
    expect(sent.trimEnd().endsWith('>')).toBe(true);
    expect(sent.lastIndexOf('<img') > sent.lastIndexOf('</table>')).toBe(true);
  });

  it('does not mangle a JWT in the query string', () => {
    // safeUrl() runs the URL through new URL().toString(); a JWT's dots,
    // hyphens and underscores must survive it untouched.
    const sent = withTrackingPixel('x', MINTED);
    expect(sent).toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(sent).toContain('abc-_123');
  });
});
