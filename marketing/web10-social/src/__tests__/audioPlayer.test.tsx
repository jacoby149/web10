import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AudioPlayer } from '@web10/discover';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('shared inline audio transport', () => {
  it('does not autoplay or fetch metadata on mount', () => {
    render(<AudioPlayer src="https://cdn.example/song.mp3" durationSeconds={180} />);
    expect(document.querySelector('audio')).toHaveAttribute('preload', 'none');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.getByText('0:00 / 3:00')).toBeInTheDocument();
  });
  it('requests play, follows actual media events and seeks real time', async () => {
    render(<AudioPlayer src="https://cdn.example/song.mp3" />);
    const audio = document.querySelector('audio')!;
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce());
    Object.defineProperties(audio, { duration: { value: 120, configurable: true }, paused: { value: false, configurable: true } });
    fireEvent.loadedMetadata(audio);
    fireEvent.play(audio);
    fireEvent.change(screen.getByRole('slider', { name: 'Seek audio' }), { target: { value: 30 } });
    expect(audio.currentTime).toBe(30);
    expect(screen.getByRole('slider', { name: 'Seek audio' })).toHaveValue('30');
    fireEvent.timeUpdate(audio);
    expect(screen.getByText('0:30 / 2:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause audio' }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    fireEvent.pause(audio);
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeInTheDocument();
  });
  it('exposes load failure and retries only on explicit action', async () => {
    render(<AudioPlayer src="https://cdn.example/song.mp3" />);
    fireEvent.error(document.querySelector('audio')!);
    expect(screen.getByRole('alert')).toHaveTextContent('Audio could not be played');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry audio' }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce());
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledOnce();
  });
  it('surfaces rejected play promises instead of pretending to play', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('unsupported'));
    render(<AudioPlayer src="https://cdn.example/song.mp3" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Audio could not be played');
    expect(screen.getByRole('button', { name: 'Retry audio' })).toBeInTheDocument();
  });
  it('resets old progress/error on a replaced URL without autoplay', () => {
    const view = render(<AudioPlayer src="https://cdn.example/old.mp3" />);
    const old = document.querySelector('audio')!;
    old.currentTime = 45;
    fireEvent.timeUpdate(old);
    fireEvent.error(old);
    view.rerender(<AudioPlayer src="https://cdn.example/new.mp3" durationSeconds={60} />);
    expect(document.querySelector('audio')).not.toBe(old);
    expect(screen.getByText('0:00 / 1:00')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
  it('pauses for another audible player but not muted previews', () => {
    render(<AudioPlayer src="https://cdn.example/song.mp3" />);
    const other = document.createElement('video');
    document.body.append(other);
    other.muted = true;
    fireEvent.play(other);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    other.muted = false;
    fireEvent.play(other);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    other.remove();
  });
  it('cannot leave a late playback request running after unmount', async () => {
    let release!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const view = render(<AudioPlayer src="https://cdn.example/song.mp3" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    view.unmount();
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    release();
    await waitFor(() => expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce());
  });
  it('does not revive a pending request after another audible player starts', async () => {
    let release!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    render(<AudioPlayer src="https://cdn.example/song.mp3" />);
    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    const other = document.createElement('audio');
    document.body.append(other);
    fireEvent.play(other);
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    release();
    await waitFor(() => expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce());
    other.remove();
  });
});
