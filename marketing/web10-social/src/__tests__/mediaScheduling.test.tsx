import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HlsVideoPlayer, HoverVideo, ImmersiveHls } from '@web10/discover';
import { claimMediaPlayback } from '@web10/discover/media-recovery';

class IO {
  static instances: IO[] = [];
  element?: Element;
  constructor(public callback: IntersectionObserverCallback) { IO.instances.push(this); }
  observe(element: Element) { this.element = element; }
  disconnect() {}
  show(value: boolean) { act(() => this.callback([{ target: this.element, isIntersecting: value } as IntersectionObserverEntry], this as unknown as IntersectionObserver)); }
}
class Hls {
  static instances: Hls[] = [];
  static Events = { ERROR: 'error', MANIFEST_PARSED: 'manifestParsed', LEVEL_SWITCHED: 'levelSwitched' };
  static isSupported = () => true;
  loadSource = vi.fn(); attachMedia = vi.fn(); on = vi.fn(); destroy = vi.fn();
  startLoad = vi.fn(); stopLoad = vi.fn(); levels = []; currentLevel = -1;
  constructor() { Hls.instances.push(this); }
}
beforeEach(() => {
  IO.instances = []; Hls.instances = [];
  vi.stubGlobal('IntersectionObserver', IO);
  window.Hls = Hls as unknown as typeof window.Hls;
});
afterEach(() => { claimMediaPlayback(document.createElement('video')); vi.unstubAllGlobals(); });
const manifest = '/v3/media/hls/manifest?doc_id=one&sig=synthetic';

describe('cross-tab media transport budgets', () => {
  it.each([1, 10, 100])('%i full-player rows attach only for visible demand and release on viewport exit', count => {
    const view = render(<>{Array.from({ length: count }, (_, i) => <HlsVideoPlayer key={i} manifestUrl={manifest} />)}</>);
    expect(Hls.instances).toHaveLength(0);
    const video = screen.getAllByTestId('hls-video')[0];
    const observer = IO.instances.find(instance => instance.element === video)!;
    observer.show(true);
    expect(Hls.instances).toHaveLength(1);
    fireEvent.pause(video);
    expect(Hls.instances[0].stopLoad).toHaveBeenCalled();
    observer.show(false);
    expect(Hls.instances[0].destroy).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(Hls.instances[0].destroy).toHaveBeenCalledTimes(1);
  });
  it('does not start neighboring Shorts transports, and releases the previous active slide', () => {
    const view = render(<><ImmersiveHls manifestUrl={manifest} active={false} testId="first" /><ImmersiveHls manifestUrl={manifest} active={false} testId="second" /></>);
    IO.instances.forEach(observer => observer.show(true));
    expect(Hls.instances).toHaveLength(0);
    view.rerender(<><ImmersiveHls manifestUrl={manifest} active testId="first" /><ImmersiveHls manifestUrl={manifest} active={false} testId="second" /></>);
    expect(Hls.instances).toHaveLength(1);
    view.rerender(<><ImmersiveHls manifestUrl={manifest} active={false} testId="first" /><ImmersiveHls manifestUrl={manifest} active testId="second" /></>);
    expect(Hls.instances).toHaveLength(2);
    expect(Hls.instances[0].destroy).toHaveBeenCalledTimes(1);
  });
  it('does not steal playback or bandwidth from an explicitly playing Music element', () => {
    const music = document.createElement('audio');
    Object.defineProperty(music, 'paused', { configurable: true, value: false });
    music.muted = false;
    const pause = vi.spyOn(music, 'pause').mockImplementation(() => {});
    claimMediaPlayback(music);
    render(<HoverVideo media={{ url: 'https://media.example/file.mp4', mime_type: 'video/mp4', transcoding_settings: { status: 'done', manifest_url: manifest } }} testId="preview" />);
    fireEvent.mouseEnter(screen.getByTestId('preview'));
    expect(Hls.instances).toHaveLength(0);
    expect(pause).not.toHaveBeenCalled();
  });
});
