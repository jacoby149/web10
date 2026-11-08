import { describe, expect, it, vi } from 'vitest';
import { withSourceBudget } from '../../../../shared/discover/src/sourceBudget';

describe('cross-generation source budget', () => {
  it('retains four live slots after abort until non-cooperative reads settle', async () => {
    const releases: (() => void)[] = [];
    const owners = Array.from({ length: 5 }, () => new AbortController());
    const read = vi.fn(() => new Promise<void>(resolve => releases.push(resolve)));
    const running = owners.slice(0, 4).map(owner => withSourceBudget(read, () => true, owner.signal));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(4));
    owners.slice(0, 4).forEach(owner => owner.abort());
    const next = withSourceBudget(read, () => true, owners[4].signal);
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(4);
    releases[0]();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(5));
    releases.forEach(release => release());
    await Promise.all([...running, next]);
  });

  it('bounds the queue and removes cancelled waiting generations without dispatch', async () => {
    const releases: (() => void)[] = [];
    const read = vi.fn(() => new Promise<void>(resolve => releases.push(resolve)));
    const running = Array.from({ length: 4 }, () => withSourceBudget(read, () => true, new AbortController().signal));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(4));
    const owners = Array.from({ length: 64 }, () => new AbortController());
    const waiting = owners.map(owner => withSourceBudget(read, () => true, owner.signal).catch(error => error.message));
    await expect(withSourceBudget(read, () => true, new AbortController().signal)).rejects.toThrow('queue full');
    owners.forEach(owner => owner.abort());
    expect(await Promise.all(waiting)).toEqual(Array(64).fill('Source request scope ended'));
    releases.forEach(release => release());
    await Promise.all(running);
    expect(read).toHaveBeenCalledTimes(4);
  });
});
