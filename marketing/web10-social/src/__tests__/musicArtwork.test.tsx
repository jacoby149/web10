import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MusicArtwork from '@/components/Music/MusicArtwork';

afterEach(cleanup);

describe('music artwork', () => {
  it('replaces failed artwork with a designed fallback and tries a changed URL', () => {
    const view = render(<MusicArtwork url="https://expired/cover" />);
    fireEvent.error(screen.getByAltText(''));
    expect(screen.queryByAltText('')).not.toBeInTheDocument();
    expect(screen.getByTestId('music-artwork-fallback')).toBeInTheDocument();
    view.rerender(<MusicArtwork url="https://fresh/cover" />);
    expect(screen.getByAltText('')).toHaveAttribute('src', 'https://fresh/cover');
  });

  it('shows the same fallback when artwork is absent', () => {
    render(<MusicArtwork />);
    expect(screen.getByTestId('music-artwork-fallback')).toBeInTheDocument();
    expect(screen.queryByAltText('')).not.toBeInTheDocument();
  });
});
