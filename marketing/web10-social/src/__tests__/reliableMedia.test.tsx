import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ReliableImage } from '@web10/discover/image';
import { ReliableVideo } from '@web10/discover/video';
import { bindMediaRead, invalidateMediaRecovery } from '@web10/discover/media-recovery';

const original = 'https://media.example/media/exact?cap=old';
const fresh = 'https://media.example/media/exact?cap=fresh';
beforeEach(() => invalidateMediaRecovery());
afterEach(() => { Reflect.deleteProperty(navigator, 'onLine'); vi.useRealTimers(); });

describe('shared image reliability on every consumer', () => {
  it('renders an honest missing-preview state without opening the raw recording', () => {
    const { container } = render(<ReliableImage className="h-full w-full" />);
    expect(screen.getByRole('img', { name: 'Preview unavailable' })).toBeInTheDocument();
    expect(container.querySelector('img,video')).toBeNull();
  });
  it('ignores duplicate errors from the expired URL while its authorized refresh is pending', async () => {
    let finish!: (value: unknown) => void;
    const onError = vi.fn();
    bindMediaRead({ url: original }, () => new Promise(resolve => { finish = resolve; }), () => true);
    render(<ReliableImage src={original} alt="cover" onError={onError} />);
    fireEvent.error(screen.getByAltText('cover'));
    fireEvent.error(screen.getByAltText('cover'));
    expect(onError).not.toHaveBeenCalled();
    await act(async () => finish({ url: fresh }));
    expect(screen.getByAltText('cover')).toHaveAttribute('src', fresh);
  });
  it.each(['Posts', 'People', 'Video', 'Music', 'Shorts', 'Saved', 'Groups', 'Search', 'Ads'])('%s shares bounded original-read recovery and settles to a designed fallback', async label => {
    const replay = vi.fn(async () => ({ thumbnail_url: fresh }));
    bindMediaRead({ thumbnail_url: original }, replay, () => true);
    render(<ReliableImage src={original} alt={label} />);
    fireEvent.error(screen.getByAltText(label));
    await waitFor(() => expect(screen.getByAltText(label)).toHaveAttribute('src', fresh));
    expect(replay).toHaveBeenCalledTimes(1);
    fireEvent.error(screen.getByAltText(label));
    expect(screen.getByRole('button', { name: `Retry image: ${label}` })).toBeInTheDocument();
    expect(replay).toHaveBeenCalledTimes(1);
  });
  it('coalesces a failed page of sibling thumbnails into one authorized read', async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://media.example/media/${i}?cap=old`);
    const replay = vi.fn(async () => urls.map(url => ({ url: url.replace('old', 'fresh') })));
    bindMediaRead(urls.map(url => ({ url })), replay, () => true);
    render(<>{urls.map((url, i) => <ReliableImage key={url} src={url} alt={`image ${i}`} />)}</>);
    screen.getAllByRole('img').forEach(image => fireEvent.error(image));
    await waitFor(() => expect(screen.getAllByRole('img').every(image => image.getAttribute('src')?.endsWith('fresh'))).toBe(true));
    expect(replay).toHaveBeenCalledTimes(1);
  });
  it('cannot install a late source after replacement or account invalidation', async () => {
    let finish!: (value: unknown) => void;
    bindMediaRead({ url: original }, () => new Promise(resolve => { finish = resolve; }), () => true);
    const view = render(<ReliableImage src={original} alt="cover" />);
    fireEvent.error(screen.getByAltText('cover'));
    view.rerender(<ReliableImage src="https://media.example/new-account.jpg" alt="cover" />);
    invalidateMediaRecovery();
    await act(async () => { finish({ url: fresh }); });
    expect(screen.getByAltText('cover')).toHaveAttribute('src', 'https://media.example/new-account.jpg');
  });
  it('waits offline without consuming its recovery budget, then recovers once online', async () => {
    const replay = vi.fn(async () => ({ url: fresh }));
    bindMediaRead({ url: original }, replay, () => true);
    render(<ReliableImage src={original} alt="cover" />);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    fireEvent.error(screen.getByAltText('cover'));
    expect(replay).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    fireEvent(window, new Event('online'));
    await waitFor(() => expect(screen.getByAltText('cover')).toHaveAttribute('src', fresh));
    expect(replay).toHaveBeenCalledTimes(1);
  });
  it('does not fetch an expired off-screen image or refresh it until visible', async () => {
    const expired = `https://media.example/media/exact?cap=x.${btoa(JSON.stringify({ exp: 1 }))}.x`;
    const replay = vi.fn(async () => ({ url: fresh }));
    bindMediaRead({ url: expired }, replay, () => true);
    render(<ReliableImage src={expired} alt="cover" />);
    expect(screen.getByAltText('cover')).not.toHaveAttribute('src');
    expect(replay).not.toHaveBeenCalled();
    const image = screen.getByAltText('cover');
    const IO = IntersectionObserver as unknown as { instances: { observed: Element; callback: IntersectionObserverCallback }[] };
    const observer = IO.instances.find(o => o.observed === image)!;
    act(() => observer.callback([{ target: image, isIntersecting: true } as unknown as IntersectionObserverEntry], observer as unknown as IntersectionObserver));
    await waitFor(() => expect(screen.getByAltText('cover')).toHaveAttribute('src', fresh));
  });
  it('never places capabilities or content in diagnostic logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const replay = vi.fn(async () => { throw new Error(`private-content ${original}`); });
    bindMediaRead({ url: original }, replay, () => true);
    render(<ReliableImage src={original} alt="private-content" />);
    fireEvent.error(screen.getByAltText('private-content'));
    await screen.findByRole('button', { name: 'Retry image: private-content' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('cap=');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-content');
    log.mockRestore();
  });
});

describe('native/file recovery', () => {
  it('defaults to no preload and restores position only after a fresh exact-media read', async () => {
    bindMediaRead({ read_url: original }, async () => ({ read_url: fresh }), () => true);
    render(<ReliableVideo src={original} aria-label="recording" />);
    const video = screen.getByLabelText('recording') as HTMLVideoElement;
    expect(video.preload).toBe('none');
    video.currentTime = 12;
    fireEvent.timeUpdate(video);
    fireEvent.error(video);
    await waitFor(() => expect(screen.getByLabelText('recording')).toHaveAttribute('src', fresh));
    const replacement = screen.getByLabelText('recording') as HTMLVideoElement;
    fireEvent.loadedMetadata(replacement);
    expect(replacement.currentTime).toBe(12);
  });
  it('keeps a deliberate pause while a renewal is pending', async () => {
    let finish!: (value: unknown) => void;
    bindMediaRead({ url: original }, () => new Promise(resolve => { finish = resolve; }), () => true);
    render(<ReliableVideo src={original} aria-label="recording" />);
    const video = screen.getByLabelText('recording');
    fireEvent.play(video);
    fireEvent.error(video);
    fireEvent.pause(video);
    await act(async () => finish({ url: fresh }));
    const replacement = screen.getByLabelText('recording') as HTMLVideoElement;
    const play = vi.spyOn(replacement, 'play');
    fireEvent.loadedMetadata(replacement);
    expect(play).not.toHaveBeenCalled();
  });
});
