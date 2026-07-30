import { describe, it, expect } from 'vitest';
import { parseEmbed, extractLinks, isEmbeddable } from '@/lib/linkEmbeds';

describe('parseEmbed — YouTube', () => {
  it('parses youtu.be short link', () => {
    const result = parseEmbed('https://youtu.be/dQw4w9WgXcQ');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('youtube');
    expect(result!.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(result!.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(result!.domain).toBe('youtube.com');
  });

  it('parses youtube.com/watch?v= link', () => {
    const result = parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('youtube');
    expect(result!.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('parses youtube.com/shorts/ link', () => {
    const result = parseEmbed('https://www.youtube.com/shorts/abc123xyz');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('youtube');
    expect(result!.embedUrl).toBe('https://www.youtube-nocookie.com/embed/abc123xyz');
  });

  it('parses youtube-nocookie.com embed URL', () => {
    const result = parseEmbed('https://www.youtube-nocookie.com/embed/abc123');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('youtube');
    expect(result!.embedUrl).toBe('https://www.youtube-nocookie.com/embed/abc123');
  });

  it('returns null for youtube.com without video id', () => {
    const result = parseEmbed('https://www.youtube.com/');
    expect(result).toBeNull();
  });
});

describe('parseEmbed — Vimeo', () => {
  it('parses vimeo.com/VIDEO_ID', () => {
    const result = parseEmbed('https://vimeo.com/347119365');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('vimeo');
    expect(result!.embedUrl).toBe('https://player.vimeo.com/video/347119365');
    expect(result!.domain).toBe('vimeo.com');
  });

  it('parses www.vimeo.com/VIDEO_ID', () => {
    const result = parseEmbed('https://www.vimeo.com/347119365');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('vimeo');
  });

  it('returns null for vimeo.com without video id', () => {
    const result = parseEmbed('https://vimeo.com/');
    expect(result).toBeNull();
  });
});

describe('parseEmbed — External', () => {
  it('parses a random URL as external', () => {
    const result = parseEmbed('https://example.com/some/path');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('external');
    expect(result!.domain).toBe('example.com');
  });

  it('parses a www. URL as external', () => {
    const result = parseEmbed('https://www.github.com/web10');
    expect(result).not.toBeNull();
    expect(result!.provider).toBe('external');
    expect(result!.domain).toBe('github.com');
  });

  it('isEmbeddable returns false for external', () => {
    const result = parseEmbed('https://example.com/');
    expect(isEmbeddable(result)).toBe(false);
  });
});

describe('parseEmbed — isEmbeddable', () => {
  it('returns true for youtube', () => {
    expect(isEmbeddable(parseEmbed('https://youtu.be/abc'))).toBe(true);
  });

  it('returns true for vimeo', () => {
    expect(isEmbeddable(parseEmbed('https://vimeo.com/123'))).toBe(true);
  });

  it('returns false for external', () => {
    expect(isEmbeddable(parseEmbed('https://example.com/'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isEmbeddable(null)).toBe(false);
  });
});

describe('extractLinks', () => {
  it('returns empty array for text with no URLs', () => {
    expect(extractLinks('Hello world, no links here!')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractLinks('')).toEqual([]);
  });

  it('extracts a single youtube URL from text', () => {
    const links = extractLinks('Check this out: https://youtu.be/dQw4w9WgXcQ');
    expect(links).toHaveLength(1);
    expect(links[0].embed?.provider).toBe('youtube');
  });

  it('extracts a single external URL from text', () => {
    const links = extractLinks('See https://example.com/article for more');
    expect(links).toHaveLength(1);
    expect(links[0].embed?.provider).toBe('external');
  });

  it('extracts multiple URLs from text', () => {
    const links = extractLinks('Video: https://youtu.be/abc123 and https://vimeo.com/999');
    expect(links).toHaveLength(2);
    expect(links[0].embed?.provider).toBe('youtube');
    expect(links[1].embed?.provider).toBe('vimeo');
  });

  it('does not match URLs inside words (no false positives)', () => {
    const links = extractLinks('myhttps://not-a-url and some text');
    expect(links).toHaveLength(0);
  });

  it('trailing punctuation is stripped from URL', () => {
    const links = extractLinks('Check https://youtu.be/abc123.');
    expect(links).toHaveLength(1);
    expect(links[0].embed?.provider).toBe('youtube');
    expect(links[0].embed?.embedUrl).toContain('abc123');
  });

  it('extracts www. prefixed URL', () => {
    const links = extractLinks('Go to www.example.com now');
    expect(links).toHaveLength(1);
    expect(links[0].embed?.provider).toBe('external');
  });

  it('extracts youtube shorts URL', () => {
    const links = extractLinks('https://www.youtube.com/shorts/xyz789');
    expect(links).toHaveLength(1);
    expect(links[0].embed?.provider).toBe('youtube');
    expect(links[0].embed?.embedUrl).toContain('xyz789');
  });
});