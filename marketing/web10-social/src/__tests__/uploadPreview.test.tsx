import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { UploadPreviewCenter, UploadPreviewDock, UploadPreviewProvider } from '../../screenshots/harness/UploadPreview';

// The actual composer handoff is driven in videoEditor.test.tsx and the
// browser smoke. This test targets queue lifetime and connectivity listeners.
vi.mock('@/components/Feed/PostComposer', () => ({ default: () => null }));

function Preview({ phase = 'uploading' }: { phase?: 'uploading' | 'paused' }) {
  return <MemoryRouter initialEntries={['/uploads']}><UploadPreviewProvider scenario={phase}>
    <Routes>
      <Route path="/uploads" element={<UploadPreviewCenter />} />
      <Route path="/feed" element={<h1>Browse</h1>} />
    </Routes>
    <UploadPreviewDock />
  </UploadPreviewProvider></MemoryRouter>;
}

describe('isolated upload preview queue', () => {
  it('hides the previous owner’s queue on account change and restores only the matching partition', () => {
    const owner = { node: 'node-a', provider: 'issuer-a', username: 'alice' };
    const view = (account: typeof owner | null) => <MemoryRouter><UploadPreviewProvider scenario="uploading" owner={account}><UploadPreviewCenter /></UploadPreviewProvider></MemoryRouter>;
    const { rerender } = render(view(owner));
    expect(screen.getByTestId('upload-card')).toHaveTextContent('Nosferatu');
    rerender(view({ ...owner, username: 'bob' }));
    expect(screen.queryByTestId('upload-card')).not.toBeInTheDocument();
    rerender(view(null));
    expect(screen.queryByTestId('upload-card')).not.toBeInTheDocument();
    rerender(view(owner));
    expect(screen.getByTestId('upload-card')).toHaveTextContent('Nosferatu');
    expect(screen.getByRole('status')).toHaveTextContent('Select your file to continue');
  });

  it('clearly labels the simulation and offers no live publication link', () => {
    render(<Preview />);
    expect(screen.getByText('UI preview · No files uploaded. No posts published.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View post' })).not.toBeInTheDocument();
  });

  it('offline/online events reconnect interrupted transfers but do not unpause a user-paused transfer', () => {
    render(<Preview />);
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for connection');
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.getByRole('status')).toHaveTextContent('Uploading');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => window.dispatchEvent(new Event('offline')));
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.getByRole('status')).toHaveTextContent('Upload paused');
  });

  it('keeps queue state when the upload center unmounts and the compact indicator returns to it', () => {
    render(<Preview />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByText('Test a scenario'));
    fireEvent.click(screen.getByRole('link', { name: 'Browse while uploading' }));
    expect(screen.queryByTestId('upload-center')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-indicator')).toHaveTextContent('Upload paused');
    fireEvent.click(screen.getByTestId('upload-indicator'));
    expect(screen.getByRole('status')).toHaveTextContent('Upload paused');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '41');
  });

  it('handles connection loss and recovery while browsing away from the upload center', () => {
    render(<Preview />);
    fireEvent.click(screen.getByText('Test a scenario'));
    fireEvent.click(screen.getByRole('link', { name: 'Browse while uploading' }));
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByTestId('upload-indicator')).toHaveTextContent('Connection lost');
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.getByTestId('upload-indicator')).toHaveTextContent('Uploading · 41%');
  });

  it('simulates processing/publication failures independently and never links to an invented post', () => {
    render(<Preview />);
    fireEvent.click(screen.getByText('Test a scenario'));
    fireEvent.click(screen.getByRole('button', { name: 'Finish upload' }));
    expect(screen.getByRole('status')).toHaveTextContent('Preparing video');
    fireEvent.click(screen.getByRole('button', { name: 'Fail processing' }));
    expect(screen.getByRole('status')).toHaveTextContent('Video preparation failed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry processing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Video ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fail publication' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry publication' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm published' }));
    expect(screen.getByRole('status')).toHaveTextContent('Published');
    expect(screen.queryByRole('link', { name: 'View post' })).not.toBeInTheDocument();
  });
});
