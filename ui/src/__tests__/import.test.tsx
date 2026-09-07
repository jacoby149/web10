import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import Import from '../components/Settings/Import'

function makeI(overrides: Record<string, any> = {}) {
  return {
    isMock: true,
    importCreate: vi.fn().mockResolvedValue({
      job_id: 'job-1',
      platform: 'youtube',
      job: { phase: 'pending' },
      uploads: [
        { part_index: 0, object_key: 'k0', upload_url: 'https://minio/u0', fields: { key: 'k0' } },
      ],
    }),
    importStart: vi.fn().mockResolvedValue({ job_id: 'job-1', status: 'queued' }),
    importStatus: vi.fn().mockResolvedValue({
      job_id: 'job-1',
      job: { phase: 'complete', written_records: 2, total_records: 2, skipped_records: 0, errors: [], message: 'Import complete: 2 written, 0 skipped.' },
    }),
    ...overrides,
  }
}

const tarFile = () => new File(['x'], 'takeout-001.tar', { type: 'application/x-tar' })

beforeEach(() => {
  // The presigned upload is a raw POST to MinIO — mock it.
  vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Import card', () => {
  it('renders collapsed with the title', () => {
    render(<Import I={makeI()} />)
    expect(screen.getByText('Import from YouTube')).toBeTruthy()
    // collapsed by default — the drop zone is hidden
    expect(screen.queryByTestId('import-file-drop')).toBeNull()
  })

  it('expands to show the drop zone + disabled start', () => {
    render(<Import I={makeI()} />)
    fireEvent.click(screen.getByTestId('import-toggle'))
    expect(screen.getByTestId('import-file-drop')).toBeTruthy()
    expect(screen.getByTestId('import-start')).toBeDisabled()
  })

  it('lists selected files and enables start', () => {
    render(<Import I={makeI()} />)
    fireEvent.click(screen.getByTestId('import-toggle'))
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [tarFile(), tarFile()] } })
    expect(screen.getAllByTestId('import-file-item')).toHaveLength(2)
    expect(screen.getByTestId('import-start')).toBeEnabled()
  })

  it('runs create -> upload -> start on click', async () => {
    const I = makeI()
    render(<Import I={I} />)
    fireEvent.click(screen.getByTestId('import-toggle'))
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [tarFile()] } })
    fireEvent.click(screen.getByTestId('import-start'))

    await waitFor(() => {
      expect(I.importCreate).toHaveBeenCalledWith('youtube', expect.arrayContaining([
        expect.objectContaining({ filename: 'takeout-001.tar' }),
      ]))
      expect(global.fetch).toHaveBeenCalled()
      expect(I.importStart).toHaveBeenCalledWith('job-1')
    })
  })

  it('shows the complete state after polling', async () => {
    vi.useFakeTimers()
    const statuses = [
      { job_id: 'job-1', job: { phase: 'processing', written_records: 1, total_records: 2, message: 'Writing...' } },
      { job_id: 'job-1', job: { phase: 'complete', written_records: 2, total_records: 2, skipped_records: 0, errors: [], message: 'Import complete: 2 written, 0 skipped.' } },
    ]
    const I = makeI({ importStatus: vi.fn(() => Promise.resolve(statuses.shift() ?? statuses[statuses.length - 1])) })
    render(<Import I={I} />)
    fireEvent.click(screen.getByTestId('import-toggle'))
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [tarFile()] } })
    fireEvent.click(screen.getByTestId('import-start'))

    // Flush the async start (create + upload + start) so the poll interval is set.
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(I.importStart).toHaveBeenCalled()

    // First poll -> processing
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByTestId('import-progress')).toBeTruthy()

    // Second poll -> complete
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByTestId('import-complete')).toBeTruthy()
    expect(screen.getByText('Import complete: 2 written, 0 skipped.')).toBeTruthy()
    vi.useRealTimers()
  })

  it('shows the error state when the job fails', async () => {
    vi.useFakeTimers()
    const I = makeI({
      importStatus: vi.fn(() => Promise.resolve({
        job_id: 'job-1', job: { phase: 'error', message: 'No importable records found in the export.' },
      })),
    })
    render(<Import I={I} />)
    fireEvent.click(screen.getByTestId('import-toggle'))
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [tarFile()] } })
    fireEvent.click(screen.getByTestId('import-start'))

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByTestId('import-error')).toBeTruthy()
    expect(screen.getByText('No importable records found in the export.')).toBeTruthy()
    vi.useRealTimers()
  })

  it('resets to idle after completion', async () => {
    vi.useFakeTimers()
    render(<Import I={makeI()} />)
    fireEvent.click(screen.getByTestId('import-toggle'))
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [tarFile()] } })
    fireEvent.click(screen.getByTestId('import-start'))

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    // The default mock status is 'complete' — the first poll lands it.
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByTestId('import-complete')).toBeTruthy()

    fireEvent.click(screen.getByTestId('import-reset'))
    expect(screen.getByTestId('import-start')).toBeDisabled()
    expect(screen.queryByTestId('import-complete')).toBeNull()
    vi.useRealTimers()
  })
})
