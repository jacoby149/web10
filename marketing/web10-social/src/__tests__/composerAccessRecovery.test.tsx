import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Web10Error } from '@/data/v3';
import { lucideMock } from './helpers/lucideMock';

vi.mock('lucide-react', () => lucideMock);
const login = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/interfaces/auth', () => ({ getSocialAuth: () => ({ login }) }));
const mocks = vi.hoisted(() => ({ upload: vi.fn(), create: vi.fn(), update: vi.fn(), repost: vi.fn(),
  identity: { username: 'alice', provider: 'test.localhost' } }));
vi.mock('@/data', async (original) => ({
  ...await original<Record<string, unknown>>(),
  uploadMedia: mocks.upload, createPost: mocks.create, updatePost: mocks.update, createRepost: mocks.repost,
  readProfile: vi.fn().mockResolvedValue(null), readMyAds: vi.fn().mockResolvedValue({ ads: [], albums: [] }),
  resolveMediaRefs: vi.fn().mockResolvedValue([]), fanOutToFollowers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/data/wapi', () => ({
  getWapi: () => ({ readToken: () => mocks.identity }),
}));
vi.mock('@/data/settings', () => ({ readSettings: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/mediaProcessing', async (original) => ({
  ...await original<Record<string, unknown>>(),
  getVideoInfo: vi.fn().mockResolvedValue({ width: 720, height: 1280, duration: 10 }),
  captureVideoPoster: vi.fn().mockResolvedValue({ blob: new Blob(['poster']), mimeType: 'image/webp' }),
}));
vi.mock('@/lib/ffmpegEngine', () => ({ loadFFmpeg: vi.fn(), transcodeWithFFmpeg: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  login.mockReturnValue(true);
  mocks.identity = { username: 'alice', provider: 'test.localhost' };
  mocks.upload.mockReset().mockResolvedValue({ _id: 'media-1' });
  mocks.create.mockReset().mockResolvedValue({ _id: 'post-1' });
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.repost.mockReset().mockResolvedValue({ _id: 'repost-1' });
  URL.createObjectURL = vi.fn(() => 'blob:original-video');
  URL.revokeObjectURL = vi.fn();
});

async function draft() {
  const { default: PostComposer } = await import('@/components/Feed/PostComposer');
  const onPostCreated = vi.fn();
  render(<PostComposer onPostCreated={onPostCreated} />);
  fireEvent.change(screen.getByTestId('composer-title'), { target: { value: 'My song' } });
  const file = new File(['video'], 'song.mp4', { type: 'video/mp4' });
  fireEvent.change(document.querySelector('input[type="file"][multiple]')!, { target: { files: [file] } });
  await screen.findByTestId('media-tray');
  await waitFor(() => expect(screen.getByTestId('post-submit')).toBeEnabled());
  return { file, onPostCreated };
}

describe('composer access recovery at the actual upload/post failure', () => {
  it.each([401, 403])('keeps the video/title and offers approval + explicit retry after an upload %s', async status => {
    mocks.upload.mockRejectedValueOnce(new Web10Error('No app contract', status));
    const { file, onPostCreated } = await draft();
    fireEvent.click(screen.getByTestId('post-submit'));
    expect(await screen.findByTestId('composer-access-recovery')).toHaveTextContent('This app needs your approval');
    expect(screen.getByTestId('composer-title')).toHaveValue('My song');
    expect(screen.getByTestId('media-tray')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled(); // never opens a gesture-less popup
    expect(onPostCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Allow access' }));
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Approve the request');
    expect(mocks.upload).toHaveBeenCalledTimes(1); // opening != approval or publishing
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onPostCreated).toHaveBeenCalledTimes(1));
    expect(mocks.upload.mock.calls[1][0].file).toBe(file);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ title: 'My song', media_refs: ['media-1'] });
  });

  it('recovers the reported posts-create denial after a completed media upload', async () => {
    mocks.create.mockRejectedValueOnce(new Web10Error('No app contract to create on posts', 403));
    const { onPostCreated } = await draft();
    fireEvent.click(screen.getByTestId('post-submit'));
    await screen.findByRole('button', { name: 'Allow access' });
    expect(screen.getByTestId('composer-title')).toHaveValue('My song');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onPostCreated).toHaveBeenCalledTimes(1));
    expect(mocks.upload).toHaveBeenCalledTimes(1); // completed video is not sent twice
  });

  it.each(['account', 'visibility'])('does not reuse a completed upload after changing %s', async change => {
    mocks.create.mockRejectedValue(new Web10Error('No app contract to create on posts', 403));
    await draft();
    fireEvent.click(screen.getByTestId('post-submit'));
    await screen.findByRole('button', { name: 'Allow access' });
    if (change === 'account') mocks.identity = { username: 'bob', provider: 'test.localhost' };
    else fireEvent.change(screen.getByTestId('visibility-selector'), { target: { value: 'private' } });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Allow access' })).toBeEnabled();
  });

  it('keeps approval actionable when the popup is blocked or throws', async () => {
    mocks.upload.mockRejectedValueOnce(new Web10Error('Sign in', 401));
    await draft();
    fireEvent.click(screen.getByTestId('post-submit'));
    const approve = await screen.findByRole('button', { name: 'Allow access' });
    login.mockReturnValueOnce(false);
    fireEvent.click(approve);
    expect(screen.getByRole('status')).toHaveTextContent('Allow pop-ups');
    login.mockImplementationOnce(() => { throw new Error('unavailable'); });
    fireEvent.click(approve);
    expect(screen.getByRole('status')).toHaveTextContent('try again');
    expect(screen.getByTestId('media-tray')).toBeInTheDocument();
    expect(screen.getByTestId('composer-title')).toHaveValue('My song');
  });

  it('denial or closing consent never clears the draft or pretends the retry succeeded', async () => {
    mocks.upload.mockRejectedValue(new Web10Error('No app contract', 403));
    const { onPostCreated } = await draft();
    fireEvent.click(screen.getByTestId('post-submit'));
    fireEvent.click(await screen.findByRole('button', { name: 'Allow access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Allow access' })).toBeEnabled();
    expect(onPostCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId('composer-title')).toHaveValue('My song');
  });

  it.each([new Error('Connection lost'), new Web10Error('Try later', 500)])('does not mislabel non-access failures: %s', async error => {
    mocks.upload.mockRejectedValueOnce(error);
    await draft();
    fireEvent.click(screen.getByTestId('post-submit'));
    expect(await screen.findByTestId('composer-error')).toHaveTextContent(error.message);
    expect(screen.queryByRole('button', { name: 'Allow access' })).not.toBeInTheDocument();
    expect(screen.getByTestId('media-tray')).toBeInTheDocument();
  });
});
