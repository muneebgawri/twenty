import { describe, expect, it } from 'vitest';
import { extractLinks, rewriteLinks } from '../rewrite-links';

describe('extractLinks', () => {
  it('finds http(s) links once each, in order', () => {
    const html =
      '<a href="https://a.test">a</a> <a href="http://b.test">b</a> <a href="https://a.test">again</a>';
    expect(extractLinks(html)).toEqual(['https://a.test', 'http://b.test']);
  });

  it('ignores the links that are how someone replies', () => {
    // Rewriting these breaks them and measures nothing.
    const html =
      '<a href="mailto:pr@pinionnewswire.com">mail</a><a href="tel:+442012345678">call</a>';
    expect(extractLinks(html)).toEqual([]);
  });

  it('ignores anything that could execute', () => {
    expect(extractLinks('<a href="javascript:alert(1)">x</a>')).toEqual([]);
  });

  it('treats an entity-escaped href as the same URL', () => {
    // The mint keys its map on the real destination, so &amp; has to be
    // decoded before matching or the link silently goes unwrapped.
    expect(extractLinks('<a href="https://a.test/?x=1&amp;y=2">x</a>')).toEqual([
      'https://a.test/?x=1&y=2',
    ]);
  });

  it('handles single quotes', () => {
    expect(extractLinks("<a href='https://a.test'>x</a>")).toEqual(['https://a.test']);
  });
});

describe('rewriteLinks', () => {
  const map = { 'https://a.test': 'https://track.pinionnewswire.com/c?t=jwt' };

  it('swaps a known destination and keeps the link text', () => {
    const out = rewriteLinks('<a href="https://a.test">the story</a>', map);
    expect(out).toContain('track.pinionnewswire.com/c?t=jwt');
    expect(out).toContain('>the story</a>');
    expect(out).not.toContain('href="https://a.test"');
  });

  it('LEAVES an unmapped link exactly as it was', () => {
    // Minting can fail per link. A link that silently became unclickable is a
    // far worse outcome than one that is simply not measured.
    const html = '<a href="https://unmapped.test">x</a>';
    expect(rewriteLinks(html, map)).toBe(html);
  });

  it('does not touch mailto or tel', () => {
    const html = '<a href="mailto:a@b.com">m</a><a href="tel:+44">t</a>';
    expect(rewriteLinks(html, map)).toBe(html);
  });

  it('escapes ampersands in the tracked URL', () => {
    const out = rewriteLinks('<a href="https://a.test">x</a>', {
      'https://a.test': 'https://track.test/c?t=jwt&v=2',
    });
    expect(out).toContain('t=jwt&amp;v=2');
  });

  it('preserves other attributes on the anchor', () => {
    const out = rewriteLinks(
      '<a class="cta" href="https://a.test" target="_blank">x</a>',
      map,
    );
    expect(out).toContain('class="cta"');
    expect(out).toContain('target="_blank"');
  });

  it('rewrites every occurrence of the same destination', () => {
    const out = rewriteLinks(
      '<a href="https://a.test">1</a><a href="https://a.test">2</a>',
      map,
    );
    expect(out.match(/track\.pinionnewswire\.com/g)).toHaveLength(2);
  });
});
