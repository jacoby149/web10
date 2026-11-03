import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DiscoverAudience } from '@/components/Feed/DiscoverAudience';

const attachment = vi.hoisted(() => vi.fn());
vi.mock('@/data/v3', () => ({ getV3Client: () => ({ documentAttachment: attachment }) }));
vi.mock('@/data', () => ({ getDiscoverGroupId: () => 'discover' }));
beforeEach(() => { attachment.mockReset(); });

it('reads only Discover and adds it under the original author without replacement', async () => {
  attachment.mockResolvedValueOnce({ attached: false }).mockResolvedValueOnce({ attached: true });
  render(<DiscoverAudience docId="post" authorAs="original-group" disabled={false} onBusyChange={vi.fn()} />);
  fireEvent.click(await screen.findByText('Add to Discover'));
  await screen.findByText('Remove from Discover');
  expect(attachment.mock.calls).toEqual([
    ['post', 'discover', { author_as: 'original-group' }],
    ['post', 'discover', { author_as: 'original-group', attached: true }],
  ]);
  expect(screen.getByRole('status')).toHaveTextContent('Post content is saved separately');
});

it('keeps removal retryable on failure without reporting content save', async () => {
  attachment.mockResolvedValueOnce({ attached: true }).mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce({ attached: false });
  render(<DiscoverAudience docId="post" disabled={false} onBusyChange={vi.fn()} />);
  fireEvent.click(await screen.findByText('Remove from Discover'));
  await screen.findByRole('alert');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Remove from Discover'));
  await screen.findByText('Add to Discover');
  expect(attachment.mock.calls[1]).toEqual(attachment.mock.calls[2]);
});

it('does not guess membership on read failure and supports retry', async () => {
  attachment.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ attached: false });
  render(<DiscoverAudience docId="post" disabled={false} onBusyChange={vi.fn()} />);
  fireEvent.click(await screen.findByText('Retry audience'));
  await screen.findByText('Add to Discover');
  await waitFor(() => expect(attachment).toHaveBeenCalledTimes(2));
});
