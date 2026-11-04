import { describe, it, expect } from 'vitest';
import {
  validateMedia,
  validateVideoDuration,
} from '@/lib/mediaProcessing';

describe('validateMedia', () => {
  it('accepts valid image types', () => {
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].forEach((type) => {
      const file = new File(['x'], 'test.jpg', { type });
      expect(validateMedia(file)).toBeNull();
    });
  });

  it('accepts valid video types', () => {
    ['video/mp4', 'video/webm'].forEach((type) => {
      const file = new File(['x'], 'test.mp4', { type });
      expect(validateMedia(file)).toBeNull();
    });
  });

  it('rejects unsupported video types with mp4 message', () => {
    const file = new File(['x'], 'test.avi', { type: 'video/avi' });
    const err = validateMedia(file);
    expect(err).not.toBeNull();
    expect(err?.field).toBe('type');
    expect(err?.message).toContain('MP4');
  });

  it('rejects unsupported non-video types', () => {
    const file = new File(['x'], 'test.pdf', { type: 'application/pdf' });
    const err = validateMedia(file);
    expect(err).not.toBeNull();
    expect(err?.field).toBe('type');
  });

  it('rejects oversized images', () => {
    const file = new File(['x'.repeat(21 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
    const err = validateMedia(file);
    expect(err).not.toBeNull();
    expect(err?.field).toBe('size');
    expect(err?.message).toContain('MB');
  });

  it('rejects oversized videos', () => {
    const file = new File(['x'.repeat(501 * 1024 * 1024)], 'huge.mp4', { type: 'video/mp4' });
    const err = validateMedia(file);
    expect(err).not.toBeNull();
    expect(err?.field).toBe('size');
    expect(err?.message).toContain('500 MB');
  });

  it('accepts videos up to 500 MB', () => {
    const file = new File(['x'.repeat(500 * 1024 * 1024)], 'large.mp4', { type: 'video/mp4' });
    expect(validateMedia(file)).toBeNull();
  });
});

describe('validateVideoDuration', () => {
  it('accepts duration within limit', () => {
    expect(validateVideoDuration(60)).toBeNull();
    expect(validateVideoDuration(180)).toBeNull();
    expect(validateVideoDuration(3600)).toBeNull();
    expect(validateVideoDuration(3601)).toBeNull();
    expect(validateVideoDuration(10800)).toBeNull();
  });

  it('accepts Nosferatu (91:54) without increasing the size limit', () => {
    const file = new File(['x'], 'nosferatu.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 514619769 });
    expect(validateMedia(file)).toBeNull();
    expect(validateVideoDuration(91 * 60 + 54)).toBeNull();
  });

  it('rejects duration over limit', () => {
    const err = validateVideoDuration(10801);
    expect(err).not.toBeNull();
    expect(err?.field).toBe('duration');
    expect(err?.message).toBe('Video is too long (180m 1s). Max is 3 hours.');
  });

  it('rejects fractional durations just beyond three hours', () => {
    expect(validateVideoDuration(10800.01)?.field).toBe('duration');
  });

  it('accepts short video', () => {
    expect(validateVideoDuration(10)).toBeNull();
    expect(validateVideoDuration(7 * 60 + 40)).toBeNull();
  });
});
