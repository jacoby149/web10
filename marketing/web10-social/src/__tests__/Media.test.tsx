import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Media from '../components/Feed/Media';
import type { AppInterface, PostState } from '../types';

vi.mock('rectangles-npm', () => ({
  R: ({ children }: Record<string, unknown>) => <div>{children}</div>,
  C: ({ children }: Record<string, unknown>) => <div>{children}</div>,
  pass: (props: Record<string, unknown>) => props,
}));

const createMockPostI = (overrides?: Partial<PostState>): PostState => ({
  post: { html: '', media: [], time: '', web10: '' },
  draftPost: { html: '', media: [], time: '', web10: '' },
  mode: 'view',
  setDraftPost: vi.fn(),
  setMode: vi.fn(),
  toggleEditMode: vi.fn(),
  deleteMedia: vi.fn(),
  clearChanges: vi.fn(),
  saveChanges: vi.fn(),
  createPost: vi.fn(),
  deletePost: vi.fn(),
  ...overrides,
});

describe('Media', () => {
  it('renders image content in view mode', () => {
    const postI = createMockPostI({ mode: 'view' });
    render(<Media type="image" src="/test.png" I={null!} postI={postI} />);
    const img = screen.getByAltText('Post media');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/test.png');
  });

  it('renders video content in view mode', () => {
    const postI = createMockPostI({ mode: 'view' });
    render(<Media type="video" src="/test.mp4" I={null!} postI={postI} />);
    const video = document.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', '/test.mp4');
    expect(video).toHaveAttribute('controls');
  });

  it('shows delete button in edit mode', () => {
    const deleteMedia = vi.fn();
    const postI = createMockPostI({ mode: 'edit', deleteMedia });
    render(<Media type="image" src="/test.png" I={null!} postI={postI} idx={0} />);
    const deleteBtn = document.querySelector('.fa-rectangle-xmark');
    expect(deleteBtn).toBeInTheDocument();
  });

  it('shows delete button in create mode', () => {
    const deleteMedia = vi.fn();
    const postI = createMockPostI({ mode: 'create', deleteMedia });
    render(<Media type="image" src="/test.png" I={null!} postI={postI} idx={1} />);
    const deleteBtn = document.querySelector('.fa-rectangle-xmark');
    expect(deleteBtn).toBeInTheDocument();
  });

  it('does not show delete button in view mode', () => {
    const postI = createMockPostI({ mode: 'view' });
    render(<Media type="image" src="/test.png" I={null!} postI={postI} idx={0} />);
    const deleteBtn = document.querySelector('.fa-rectangle-xmark');
    expect(deleteBtn).not.toBeInTheDocument();
  });

  it('renders inline-block container', () => {
    const postI = createMockPostI({ mode: 'view' });
    const { container } = render(<Media type="image" src="/test.png" I={null!} postI={postI} />);
    const div = container.querySelector('div');
    expect(div).toHaveStyle({ display: 'inline-block' });
  });
});
