import { describe, it, expect } from 'vitest';
import { onlySettled, sortSettled } from '../interfaces/settledHelpers';

describe('onlySettled', () => {
  it('returns fulfilled values and discards rejections', async () => {
    const promises = [
      Promise.resolve(1),
      Promise.reject(new Error('fail')),
      Promise.resolve(2),
      Promise.reject(new Error('fail2')),
      Promise.resolve(3),
    ];
    const result = await onlySettled(promises);
    expect(result).toEqual([1, 2, 3]);
  });

  it('returns empty array when all reject', async () => {
    const promises = [
      Promise.reject(new Error('a')),
      Promise.reject(new Error('b')),
    ];
    const result = await onlySettled(promises);
    expect(result).toEqual([]);
  });

  it('returns all values when all fulfill', async () => {
    const promises = [
      Promise.resolve('a'),
      Promise.resolve('b'),
      Promise.resolve('c'),
    ];
    const result = await onlySettled(promises);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('handles empty input', async () => {
    const result = await onlySettled([]);
    expect(result).toEqual([]);
  });

  it('preserves order of fulfilled results', async () => {
    const promises = [
      Promise.resolve('first'),
      Promise.reject(null),
      Promise.resolve('second'),
    ];
    const result = await onlySettled(promises);
    expect(result).toEqual(['first', 'second']);
  });
});

describe('sortSettled', () => {
  it('sorts flat array newest-first by default (direction=1)', () => {
    const data = [
      { time: '2024-01-03T10:00:00Z', name: 'c' },
      { time: '2024-01-01T10:00:00Z', name: 'a' },
      { time: '2024-01-02T10:00:00Z', name: 'b' },
    ];
    const result = sortSettled(data);
    expect(result.map((d) => d.name)).toEqual(['c', 'b', 'a']);
  });

  it('sorts oldest-first with direction=-1', () => {
    const data = [
      { time: '2024-01-03T10:00:00Z', name: 'c' },
      { time: '2024-01-01T10:00:00Z', name: 'a' },
      { time: '2024-01-02T10:00:00Z', name: 'b' },
    ];
    const result = sortSettled(data, 'time', -1);
    expect(result.map((d) => d.name)).toEqual(['a', 'b', 'c']);
  });

  it('flattens nested arrays before sorting', () => {
    const data = [
      [{ time: '2024-01-03T10:00:00Z', name: 'c' }],
      [{ time: '2024-01-01T10:00:00Z', name: 'a' }],
      [{ time: '2024-01-02T10:00:00Z', name: 'b' }],
    ];
    const result = sortSettled<{ time: string; name: string }>(data);
    expect(result.map((d) => d.name)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by custom key', () => {
    const data = [
      { sentTime: '2024-01-03T10:00:00Z', msg: 'c' },
      { sentTime: '2024-01-01T10:00:00Z', msg: 'a' },
      { sentTime: '2024-01-02T10:00:00Z', msg: 'b' },
    ];
    const result = sortSettled(data, 'sentTime');
    expect(result.map((d) => d.msg)).toEqual(['c', 'b', 'a']);
  });

  it('handles empty input', () => {
    const result = sortSettled([]);
    expect(result).toEqual([]);
  });

  it('does not mutate original array', () => {
    const data = [
      { time: '2024-01-03T10:00:00Z', name: 'c' },
      { time: '2024-01-01T10:00:00Z', name: 'a' },
    ];
    const original = [...data];
    sortSettled(data);
    expect(data).toEqual(original);
  });
});
