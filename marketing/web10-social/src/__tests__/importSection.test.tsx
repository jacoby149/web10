import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the data layer the section reads.
vi.mock('@/data/imports', () => ({
  startImport: vi.fn(),
  importStatus: vi.fn(),
}));
vi.mock('@/data/groups', () => ({
  getGroupsManages: vi.fn(),
  readGroupIdentity: vi.fn(),
  groupDisplayName: vi.fn((id: string) => id.split('/').pop()),
  isFollowersGroup: vi.fn((id: string) => id.endsWith('/followers')),
}));

import { ImportSection } from '@/components/Settings/ImportSection';
import * as imports from '@/data/imports';
import * as groups from '@/data/groups';

const JOB = (over: Partial<import('@/data/imports').ImportJob> = {}): import('@/data/imports').ImportJob => ({
  job_id: 'j1',
  user_key: 'alice',
  platform: 'youtube',
  phase: 'processing',
  object_keys: [],
  target_group_id: '',
  total_records: 100,
  written_records: 42,
  skipped_records: 0,
  progress: 42,
  errors: [],
  message: 'Posts: 42/100...',
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:01',
  ...over,
});

describe('ImportSection (Settings → Import from YouTube)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(groups.getGroupsManages).mockResolvedValue([
      { group_id: 'web10.app/groups/alice/my-page', join_policy: 'open', my_role: 'owner', member_count: 1 },
      { group_id: 'web10.app/groups/users/alice/followers', join_policy: 'open', my_role: 'owner', member_count: 5 },
    ]);
    vi.mocked(groups.readGroupIdentity).mockResolvedValue({ name: 'My Page' });
  });

  it('renders the dropzone + the target picker (your profile default)', async () => {
    render(<ImportSection />);
    expect(screen.getByTestId('import-file-drop')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('import-target')).toBeInTheDocument());
    // The followers group is filtered out; only the real page is a target row.
    expect(screen.getByText('Your profile')).toBeInTheDocument();
    expect(screen.getByText('My Page')).toBeInTheDocument();
    // Your profile is selected by default.
    expect(screen.getByTestId('import-start')).toBeInTheDocument();
  });

  it('selecting a group target marks it selected', async () => {
    render(<ImportSection />);
    await waitFor(() => expect(screen.getByText('My Page')).toBeInTheDocument());
    fireEvent.click(screen.getByText('My Page'));
    await waitFor(() => expect(screen.getByTestId('import-target-selected')).toBeInTheDocument());
  });

  it('shows the progress percentage + bar while processing', async () => {
    vi.mocked(imports.startImport).mockResolvedValue('j1');
    vi.mocked(imports.importStatus).mockResolvedValue({ job_id: 'j1', job: JOB() });
    const { container } = render(<ImportSection />);
    await screen.findByText('Choose your Takeout files');
    const input = screen.getByTestId('import-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], 'a.tar')] } });
    fireEvent.click(screen.getByTestId('import-start'));
    // The first 2s poll lands the processing job → the bar + % render.
    const bar = await waitFor(() => {
      const el = container.querySelector('[data-testid="import-progress-bar"]');
      if (!el) throw new Error('not yet');
      return el as Element;
    }, { timeout: 4000 });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByTestId('import-record-count')).toHaveTextContent('42 of 100 records written');
  }, 8000);

  it('renders the complete state with the staged-into message', async () => {
    vi.mocked(imports.startImport).mockResolvedValue('j1');
    vi.mocked(imports.importStatus).mockResolvedValue({ job_id: 'j1', job: JOB({ phase: 'complete', progress: 100, message: 'Import complete: 90 written, 10 skipped.' }) });
    render(<ImportSection />);
    await screen.findByText('Choose your Takeout files');
    const input = screen.getByTestId('import-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], 'a.tar')] } });
    fireEvent.click(screen.getByTestId('import-start'));
    // The first 2s poll lands the complete job → the success state renders.
    expect(await screen.findByTestId('import-complete', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/Staged into Your profile/)).toBeInTheDocument();
  }, 8000);
});
