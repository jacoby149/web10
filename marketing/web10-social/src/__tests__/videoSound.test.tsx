import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ImmersiveHls, InlineVideo, VideoPlayer } from '../../../shared/discover/src/VideoPlayer';
import { HlsVideoPlayer } from '../../../shared/discover/src/HlsVideoPlayer';
import { getVideoMuted, setVideoMuted } from '../../../shared/discover/src/videoSound';
import { mayStartPreview } from '../../../shared/discover/src/mediaRecovery';

class FakeHls {
  static isSupported = () => true;
  static Events = { MANIFEST_PARSED: 'manifestParsed', LEVEL_SWITCHED: 'levelSwitched', ERROR: 'error' };
  levels = [];
  loadSource() {} attachMedia() {} on() {} off() {} destroy() {}
}

beforeEach(() => {
  setVideoMuted(false);
  Object.defineProperty(window, 'Hls', { configurable: true, writable: true, value: FakeHls });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(window, 'Hls'); setVideoMuted(false); });

describe('one in-memory video sound choice', () => {
  it('releases an unmounted video owner so it cannot block the next preview', () => {
    const view = render(<InlineVideo url="https://media.test/retired.mp4" testId="retired" />);
    const video = screen.getByTestId('retired').querySelector('video')!;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    fireEvent.play(video);
    expect(mayStartPreview()).toBe(false);
    view.unmount();
    expect(mayStartPreview()).toBe(true);
  });

  it('never saves or reads the mute choice from browser storage', () => {
    const reads = vi.spyOn(Storage.prototype, 'getItem');
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    setVideoMuted(true);
    setVideoMuted(false);
    expect(reads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(['file', 'hls'])('offers play after rejected audible %s autoplay without silently muting', async kind => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'));
    render(kind === 'file' ? <InlineVideo url="https://media.test/clip.mp4" immersive active testId="clip" /> : <ImmersiveHls manifestUrl="https://media.test/master.m3u8" active testId="clip" />);
    const retry = await screen.findByRole('button', { name: 'Play video' });
    expect(screen.getByTestId('clip').querySelector('video')!.muted).toBe(false);
    fireEvent.click(retry);
    await screen.findByRole('button', { name: 'Pause video' });
    expect(getVideoMuted()).toBe(false);
  });

  it('starts sound-on and propagates a mute between inline, native and HLS video', async () => {
    render(<><InlineVideo url="https://media.test/file.mp4" testId="inline" /><VideoPlayer source={{ type: 'file', url: 'https://media.test/native.mp4' }} mode="full" testId="native" /><HlsVideoPlayer manifestUrl="https://media.test/master.m3u8" /></>);
    const inline = screen.getByTestId('inline').querySelector('video')!;
    const native = screen.getByTestId('native') as HTMLVideoElement;
    const hls = screen.getByTestId('hls-video') as HTMLVideoElement;
    expect(inline.muted).toBe(false);
    expect(native.muted).toBe(false);
    expect(hls.muted).toBe(false);
    act(() => setVideoMuted(true));
    expect(inline.muted).toBe(true);
    expect(native.muted).toBe(true);
    expect(hls.muted).toBe(true);
    await act(async () => { native.muted = false; fireEvent.volumeChange(native); });
    expect(getVideoMuted()).toBe(false);
    expect(inline.muted).toBe(false);
    expect(hls.muted).toBe(false);
  });

  it('carries the choice into newly mounted videos without resuming paused media or muting audio', () => {
    const view = render(<InlineVideo url="https://media.test/one.mp4" testId="one" />);
    const audio = document.createElement('audio');
    act(() => setVideoMuted(true));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(audio.muted).toBe(false);
    view.unmount();
    render(<InlineVideo url="https://media.test/two.mp4" testId="two" />);
    expect(screen.getByTestId('two').querySelector('video')!.muted).toBe(true);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
