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
    const file = new File(['x'.repeat(101 * 1024 * 1024)], 'huge.mp4', { type: 'video/mp4' });
    const err = validateMedia(file);
    expect(err).not.toBeNull();
    expect(err?.field).toBe('size');
    expect(err?.message).toContain('MB');
  });
});

describe('validateVideoDuration', () => {
  it('accepts duration within limit', () => {
    expect(validateVideoDuration(60)).toBeNull();
    expect(validateVideoDuration(180)).toBeNull();
  });

  it('rejects duration over limit', () => {
    const err = validateVideoDuration(181);
    expect(err).not.toBeNull();
    expect(err?.field).toBe('duration');
    expect(err?.message).toContain('3 minutes');
  });

  it('accepts short video', () => {
    expect(validateVideoDuration(10)).toBeNull();
  });
});
