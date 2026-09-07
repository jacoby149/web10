import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/data/v3', () => ({
  getV3Client: () => ({ readToken: () => ({ provider: 'api.localhost', username: 'jacoby149' }) }),
}));

const mockCreate = vi.fn().mockResolvedValue('web10.app/groups/jacoby149/my-group');
vi.mock('@/data/groups', () => ({
  createCommunityGroup: (...args: unknown[]) => mockCreate(...args),
}));

const mockUpload = vi.fn().mockResolvedValue({ _id: 'media-doc-1', url: 'http://x/img.png' });
vi.mock('@/data/posts', () => ({
  uploadMedia: (...args: unknown[]) => mockUpload(...args),
}));

import { CreateGroupSheet } from '@/components/Groups/CreateGroupSheet';

function renderSheet(props: Partial<React.ComponentProps<typeof CreateGroupSheet>> = {}) {
  return render(
    <CreateGroupSheet open onClose={() => {}} onCreated={() => {}} {...props} />,
  );
}

describe('CreateGroupSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue('web10.app/groups/jacoby149/my-group');
    mockUpload.mockResolvedValue({ _id: 'media-doc-1', url: 'http://x/img.png' });
  });

  it('renders the face + form fields and shows the group-id preview as you type', () => {
    renderSheet();
    expect(screen.getByTestId('create-group-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('create-group-banner-button')).toBeInTheDocument();
    expect(screen.getByTestId('create-group-avatar-button')).toBeInTheDocument();
    expect(screen.getByTestId('create-group-name')).toBeInTheDocument();
    expect(screen.getByTestId('create-group-description')).toBeInTheDocument();
    expect(screen.getByTestId('create-group-visibility')).toBeInTheDocument();
    expect(screen.getByTestId('create-group-tags')).toBeInTheDocument();
    expect(screen.getByTestId('create-group-website')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('create-group-name'), { target: { value: 'My Group' } });
    expect(screen.getByTestId('create-group-id-preview')).toHaveTextContent(
      'web10.app/groups/jacoby149/my-group',
    );
  });

  it('defaults to private and is disabled until a name is present', () => {
    renderSheet();
    expect(screen.getByTestId('create-group-visibility-private')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('create-group-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('create-group-name'), { target: { value: 'My Group' } });
    expect(screen.getByTestId('create-group-submit')).toBeEnabled();
  });

  it('selecting a visibility option flips the pressed state', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('create-group-visibility-public'));
    expect(screen.getByTestId('create-group-visibility-public')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('create-group-visibility-private')).toHaveAttribute('aria-pressed', 'false');
  });

  it('creating a group calls createCommunityGroup with the face + visibility and hands back the id', async () => {
    const onCreated = vi.fn();
    renderSheet({ onCreated });
    fireEvent.change(screen.getByTestId('create-group-name'), { target: { value: 'My Group' } });
    fireEvent.change(screen.getByTestId('create-group-description'), { target: { value: 'About us' } });
    fireEvent.change(screen.getByTestId('create-group-tags'), { target: { value: 'gaming, retro' } });
    fireEvent.change(screen.getByTestId('create-group-website'), { target: { value: 'https://x.com' } });
    fireEvent.click(screen.getByTestId('create-group-visibility-public'));
    fireEvent.click(screen.getByTestId('create-group-submit'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
    const [input, owner] = mockCreate.mock.calls[0];
    expect(owner).toBe('jacoby149');
    expect(input).toEqual({
      name: 'My Group',
      description: 'About us',
      website: 'https://x.com',
      tags: ['gaming', 'retro'],
      visibility: 'public',
      banner_ref: undefined,
      avatar_ref: undefined,
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('web10.app/groups/jacoby149/my-group');
    });
  });

  it('uploads a banner + avatar and passes their refs into the create call', async () => {
    const onCreated = vi.fn();
    renderSheet({ onCreated });
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    // Drive the hidden file inputs (e2e pattern: setInputFiles)
    fireEvent.change(screen.getByTestId('create-group-banner-input'), { target: { files: [file] } });
    fireEvent.change(screen.getByTestId('create-group-avatar-input'), { target: { files: [file] } });
    fireEvent.change(screen.getByTestId('create-group-name'), { target: { value: 'My Group' } });
    fireEvent.click(screen.getByTestId('create-group-submit'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
    expect(mockUpload).toHaveBeenCalledTimes(2);
    const [input] = mockCreate.mock.calls[0];
    expect(input.banner_ref).toBe('media-doc-1');
    expect(input.avatar_ref).toBe('media-doc-1');
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
  });

  it('shows an error when the create call fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'));
    renderSheet();
    fireEvent.change(screen.getByTestId('create-group-name'), { target: { value: 'My Group' } });
    fireEvent.click(screen.getByTestId('create-group-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('create-group-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('create-group-error')).toHaveTextContent('boom');
  });
});
