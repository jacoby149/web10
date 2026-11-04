import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { UploadCenter, UploadIndicator } from '@/components/Uploads/UploadCenter';
import { uploadReducer, type UploadPhase, type UploadTask } from '@/components/Uploads/uploadState';
import { UploadCard } from '@/components/Uploads/UploadCard';

function film(phase: UploadPhase = 'uploading'): UploadTask {
  return {
    id: 'film', title: 'Nosferatu (1922)', description: 'The complete film.', authorLabel: 'Century Club Movies', audienceLabel: 'Public',
    file: { name: 'film.mp4', size: 1000, type: 'video/mp4', lastModified: 123 },
    phase, uploadedBytes: 420, remainingSeconds: phase === 'uploading' ? 240 : undefined,
  };
}

function Flow({ initial = film() }: { initial?: UploadTask }) {
  const [task, setTask] = useState(initial);
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <div data-testid="route">{location.pathname}{location.search}</div>
    <button onClick={() => navigate(-1)}>Back</button>
    <Link to="/browse">Browse</Link>
    <Routes>
      <Route path="/uploads" element={<UploadCenter tasks={[task]} composePath="/compose" onCommand={(_id, action) => setTask(current => uploadReducer(current, action))} />} />
      <Route path="/browse" element={<h1>Browse posts</h1>} />
      <Route path="/compose" element={<h1>New post</h1>} />
    </Routes>
    {location.pathname !== '/uploads' && <UploadIndicator tasks={[task]} />}
  </>;
}

describe('upload publishing UI (view model, no network)', () => {
  it('shows transferred bytes, percentage, estimate, fixed identity and audience', () => {
    render(<MemoryRouter><UploadCard task={film()} onCommand={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('About 4 minutes remaining')).toBeInTheDocument();
    expect(screen.getByText('Century Club Movies')).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Uploading');
    const card = within(screen.getByTestId('upload-card'));
    expect(card.getByText(/closing this tab or locking your phone/i)).toHaveTextContent(/your uploaded progress is saved/);
    expect(card.getByText(/Reselect the original file when you return/)).toHaveTextContent(/not start from zero/);
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  });

  it('pause/resume persists across navigation; indicator deep-links to the exact task and back works', () => {
    render(<MemoryRouter initialEntries={['/uploads']}><Flow /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('status')).toHaveTextContent('Upload paused');
    expect(screen.queryByText(/minutes remaining/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Browse', { selector: 'a' }));
    expect(screen.getByTestId('upload-indicator')).toHaveTextContent('Upload paused');
    fireEvent.click(screen.getByTestId('upload-indicator'));
    expect(screen.getByTestId('route')).toHaveTextContent('/uploads?upload=film');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    fireEvent.click(screen.getByRole('button', { name: 'Resume upload' }));
    expect(screen.getByRole('status')).toHaveTextContent('Uploading');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Browse posts' })).toBeInTheDocument();
    expect(screen.getByTestId('upload-indicator')).toHaveTextContent('Uploading · 42%');
  });

  it('connection loss keeps progress, drops the estimate, and offers retry', () => {
    render(<MemoryRouter initialEntries={['/uploads']}><Flow initial={film('offline')} /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for connection');
    expect(screen.getByText(/We’ll retry when you’re back online/)).toBeInTheDocument();
    expect(screen.queryByText(/minutes remaining/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(screen.getByRole('status')).toHaveTextContent('Uploading');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('reselection rejects a mismatch then accepts the original file without losing the draft', () => {
    const matching = new File(['x'.repeat(1000)], 'film.mp4', { type: 'video/mp4', lastModified: 123 });
    render(<MemoryRouter initialEntries={['/uploads']}><Flow initial={film('needs-file')} /></MemoryRouter>);
    const input = screen.getByLabelText('Select original video');
    fireEvent.change(input, { target: { files: [new File(['no'], 'wrong.mp4', { type: 'video/mp4' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/doesn’t match/);
    expect(screen.getByText('Nosferatu (1922)')).toBeInTheDocument();
    expect(screen.getByText('The complete film.')).toBeInTheDocument();
    expect(screen.getByText('Century Club Movies')).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [matching] } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Uploading');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('cancel requires confirmation; Keep and Escape preserve the task', () => {
    render(<MemoryRouter initialEntries={['/uploads']}><Flow /></MemoryRouter>);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancel);
    expect(screen.getByRole('group', { name: 'Confirm cancellation' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep post' }));
    expect(screen.queryByRole('group', { name: 'Confirm cancellation' })).not.toBeInTheDocument();
    fireEvent.click(cancel);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel post' }), { key: 'Escape' });
    expect(cancel).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Uploading');
    fireEvent.click(cancel);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel post' }));
    expect(screen.getByRole('status')).toHaveTextContent('Cancelled');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume upload' })).not.toBeInTheDocument();
  });

  it('processing retry never shows an upload progress bar or promises a processing percentage', () => {
    render(<MemoryRouter initialEntries={['/uploads']}><Flow initial={{ ...film('processing-failed'), error: 'Worker timeout' }} /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('Worker timeout');
    expect(screen.getByText(/no need to upload it twice/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry processing' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing video');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText(/You can close this page/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Publication progress' })).getByText('Prepare').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('publication failure has its own retry and never offers unsafe cancellation', () => {
    render(<MemoryRouter initialEntries={['/uploads']}><Flow initial={film('publish-failed')} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Retry processing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry publication' }));
    expect(screen.getByRole('status')).toHaveTextContent('Publishing');
    expect(screen.getByText('Your post is not in the feed yet.')).toBeInTheDocument();
  });

  it('only renders a post link supplied by the publication adapter', () => {
    const { rerender } = render(<MemoryRouter><UploadCard task={film('published')} onCommand={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'View post' })).not.toBeInTheDocument();
    rerender(<MemoryRouter><UploadCard task={{ ...film('published'), postPath: '/u/creator/p/123' }} onCommand={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'View post' })).toHaveAttribute('href', '/u/creator/p/123');
    expect(screen.queryByRole('button', { name: /Cancel|Discard/ })).not.toBeInTheDocument();
  });

  it('a missing task URL is honest, not silently replaced by another upload', () => {
    render(<MemoryRouter initialEntries={['/uploads?upload=missing']}><Flow /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Upload not found' })).toBeInTheDocument();
    expect(screen.queryByTestId('upload-card')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('upload-empty')).getByRole('link', { name: 'All uploads' }));
    expect(screen.getByTestId('upload-card')).toHaveTextContent('Nosferatu (1922)');
  });

  it('empty state leads to compose and an empty/cancelled queue has no indicator', () => {
    render(<MemoryRouter><UploadCenter tasks={[]} onCommand={vi.fn()} composePath="/compose" /><UploadIndicator tasks={[film('cancelled')]} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Create a post' })).toHaveAttribute('href', '/compose');
    expect(screen.getByText(/Uploading starts only when you press Post/)).toBeInTheDocument();
    expect(screen.queryByTestId('upload-indicator')).not.toBeInTheDocument();
  });
});
