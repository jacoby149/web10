import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HlsVideoPlayer, ImmersiveHls } from '@web10/discover';
import { ReliableVideo } from '@web10/discover/video';
import { bindMediaRead, hasMediaRecovery, invalidateMediaRecovery, mediaReadFetch } from '@web10/discover/media-recovery';

const old = 'https://media.example/media/movie?cap=old';
const fresh = 'https://media.example/media/movie?cap=fresh';
class Hls {
  static instances: Hls[] = [];
  static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifestParsed', LEVEL_SWITCHED: 'levelSwitched' };
  static isSupported = () => true;
  handlers = new Map<string, (name: string, data: unknown) => void>();
  loadSource = vi.fn(); attachMedia = vi.fn(); destroy = vi.fn(); startLoad = vi.fn(); stopLoad = vi.fn(); levels = []; currentLevel = -1;
  on = (name: string, handler: (name: string, data: unknown) => void) => { this.handlers.set(name, handler); };
  constructor() { Hls.instances.push(this); }
}
beforeEach(() => { invalidateMediaRecovery(); Hls.instances = []; window.Hls = Hls as unknown as typeof window.Hls; });
afterEach(() => vi.unstubAllGlobals());

it('denies delayed native metadata/autoplay after an identity generation change', async () => {
  bindMediaRead({ url: old }, async () => ({ url: fresh }), () => true);
  render(<ReliableVideo src={old} aria-label="movie" />);
  fireEvent.play(screen.getByLabelText('movie'));
  fireEvent.error(screen.getByLabelText('movie'));
  await waitFor(() => expect(screen.getByLabelText('movie')).toHaveAttribute('src', fresh));
  const video = screen.getByLabelText('movie') as HTMLVideoElement;
  const play = vi.spyOn(video, 'play').mockResolvedValue();
  invalidateMediaRecovery();
  fireEvent.loadedMetadata(video);
  expect(play).not.toHaveBeenCalled();
});

it('rebinds HLS progress, duration and pause controls after error Retry remounts the video', async () => {
  render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=movie&sig=old" />);
  act(() => Hls.instances[0].handlers.get('error')?.('error', { fatal: true }));
  await screen.findByRole('button', { name: 'Retry video' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
  const video = screen.getByTestId('hls-video') as HTMLVideoElement;
  Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
  fireEvent.loadedMetadata(video);
  video.currentTime = 42;
  fireEvent.timeUpdate(video);
  fireEvent.play(video);
  fireEvent.pause(video);
  expect(screen.getByTestId('time-display')).toHaveTextContent('0:42 / 1:40');
  expect(screen.getByTestId('play-pause-button')).toHaveAttribute('aria-label', 'Play');
});

it('does not override a deliberate native pause on viewport return', () => {
  render(<HlsVideoPlayer manifestUrl="/v3/media/hls/manifest?doc_id=movie&sig=old" />);
  const video = screen.getByTestId('hls-video') as HTMLVideoElement;
  fireEvent.play(video); fireEvent.pause(video);
  expect(video.autoplay).toBe(false);
  const IO = IntersectionObserver as unknown as { instances: { observed: Element; callback: IntersectionObserverCallback }[] };
  const observer = IO.instances.find(instance => instance.observed === video)!;
  for (const isIntersecting of [false, true]) act(() => observer.callback([{ target: video, isIntersecting } as unknown as IntersectionObserverEntry], observer as unknown as IntersectionObserver));
  expect(video.autoplay).toBe(false);
});

it('fences a marketing read at dispatch rather than its eventual response', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
  const pending = mediaReadFetch('https://api.example/v3/read', { method: 'POST', body: '{}' });
  invalidateMediaRecovery();
  finish(new Response(JSON.stringify({ url: old }), { status: 200 }));
  await (await pending).json();
  expect(hasMediaRecovery(old)).toBe(false);
});

it('rebinds immersive reveal and progress listeners after Retry', async () => {
  const onTimeUpdate = vi.fn();
  render(<ImmersiveHls manifestUrl="/v3/media/hls/manifest?doc_id=movie&sig=old" active onTimeUpdate={onTimeUpdate} />);
  act(() => Hls.instances[0].handlers.get('error')?.('error', { fatal: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry video' }));
  const video = screen.getByTestId('immersive-hls-video') as HTMLVideoElement;
  fireEvent.loadedMetadata(video); // browser metadata precedes playing/progress
  fireEvent.playing(video);
  video.currentTime = 42; fireEvent.timeUpdate(video);
  expect(video.className).toContain('opacity-100');
  expect(onTimeUpdate).toHaveBeenCalledWith(42);
});

it.each([false, true])('restores immersive position across reset without discarding a deliberate zero seek: %s', async explicitZero => {
  const manifest = '/v3/media/hls/manifest?doc_id=movie&sig=old';
  const renewed = '/v3/media/hls/manifest?doc_id=movie&sig=fresh';
  bindMediaRead({ manifest_url: manifest }, async () => ({ manifest_url: renewed }), () => true);
  render(<ImmersiveHls manifestUrl={manifest} active />);
  const video = screen.getByTestId('immersive-hls-video') as HTMLVideoElement;
  video.currentTime = 42; fireEvent.timeUpdate(video);
  act(() => Hls.instances[0].handlers.get('error')?.('error', { fatal: true }));
  await waitFor(() => expect(Hls.instances[0].loadSource).toHaveBeenCalledWith(expect.stringContaining('sig=fresh')));
  video.currentTime = 0;
  fireEvent.timeUpdate(video); // native load() can report reset before metadata
  if (explicitZero) { fireEvent.seeking(video); video.currentTime = 1; }
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(explicitZero ? 0 : 42);
});
