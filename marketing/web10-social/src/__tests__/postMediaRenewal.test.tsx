import { useContext, type ContextType } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { HlsRenewalContext } from '@web10/discover';
import { PostMediaRenewal } from '@/components/Feed/PostMediaRenewal';
import { readPostById } from '@/data';

vi.mock('@/data', () => ({ readPostById: vi.fn() }));
vi.mock('@/data/v3', () => ({ readTokenCookie: () => 'synthetic-session' }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

let renew: NonNullable<ContextType<typeof HlsRenewalContext>>;
function Probe() {
  renew = useContext(HlsRenewalContext)!;
  return null;
}

describe('post-scoped renewal shared by feed, groups, lightbox and watch', () => {
  it('re-reads the exact carrier and media without an impression label', async () => {
    vi.mocked(readPostById).mockResolvedValue({ media_refs: [{ doc_id: 'm1', transcoding_settings: { manifest_url: '/fresh' } }] } as never);
    render(<PostMediaRenewal postId="original"><Probe /></PostMediaRenewal>);
    const result = await renew('/manifest?doc_id=m1&sig=old');
    expect(readPostById).toHaveBeenCalledExactlyOnceWith('original');
    expect(result).toMatchObject({ url: '/fresh' });
    if (typeof result !== 'string') expect(result.isCurrent()).toBe(true);
  });

  it.each(['session', 'carrier', 'unmount'])('invalidates delayed restoration on %s change', async (change) => {
    vi.mocked(readPostById).mockResolvedValue({ media_refs: [{ doc_id: 'm1', transcoding_settings: { manifest_url: '/fresh' } }] } as never);
    const view = render(<PostMediaRenewal postId="original"><Probe /></PostMediaRenewal>);
    const result = await renew('/manifest?doc_id=m1&sig=old');
    if (change === 'session') act(() => window.dispatchEvent(new Event('upload-session-changed')));
    if (change === 'carrier') view.rerender(<PostMediaRenewal postId="other"><Probe /></PostMediaRenewal>);
    if (change === 'unmount') view.unmount();
    if (typeof result !== 'string') expect(result.isCurrent()).toBe(false);
  });

  it('rejects an absent media identity before reading', async () => {
    render(<PostMediaRenewal postId="original"><Probe /></PostMediaRenewal>);
    await expect(renew('/manifest?sig=old')).rejects.toThrow('Missing original');
    expect(readPostById).not.toHaveBeenCalled();
  });
});
