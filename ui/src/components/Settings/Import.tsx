import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileArchive,
  Loader2,
  UploadCloud,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Phase = 'idle' | 'ready' | 'uploading' | 'processing' | 'complete' | 'error';

function formatBytes(n?: number): string {
  if (n === undefined || n === null) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Import from YouTube — the "port your YouTube" pipeline (plan: YouTube
 * Importer). Pick the Google Takeout export files (tar or zip, split exports
 * are fine), upload them to the node, and watch the import run. The node
 * stages everything owner-only (D30) — nothing auto-publishes.
 */
function Import({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(true);
  const [files, setFiles] = React.useState<File[]>([]);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [progress, setProgress] = React.useState({ current: 0, total: 0, label: '' });
  const [job, setJob] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  React.useEffect(() => () => stopPolling(), [stopPolling]);

  const reset = () => {
    stopPolling();
    setPhase('idle');
    setFiles([]);
    setJob(null);
    setError(null);
    setProgress({ current: 0, total: 0, label: '' });
  };

  const startPolling = (jobId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await I.importStatus(jobId);
        const j = res.job;
        setJob(j);
        if (j.phase === 'complete') {
          stopPolling();
          setPhase('complete');
        } else if (j.phase === 'error') {
          stopPolling();
          setPhase('error');
          setError(j.message || 'Import failed');
        } else {
          setPhase('processing');
          setProgress({
            current: j.written_records || 0,
            total: j.total_records || 0,
            label: j.message || 'Importing...',
          });
        }
      } catch (e: any) {
        stopPolling();
        setPhase('error');
        setError(e?.message || 'Failed to check import status');
      }
    }, 2000);
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    setFiles(list);
    if (list.length) setPhase('ready');
    e.target.value = ''; // allow re-selecting the same file
  };

  const startImport = async () => {
    if (!files.length) return;
    setError(null);
    setPhase('uploading');
    setProgress({ current: 0, total: files.length, label: 'Preparing upload...' });
    try {
      const parts = files.map((f) => ({ filename: f.name, size_bytes: f.size }));
      const created = await I.importCreate('youtube', parts);
      // Upload each part straight to MinIO via its presigned POST.
      for (let i = 0; i < created.uploads.length; i++) {
        const up = created.uploads[i];
        const form = new FormData();
        Object.entries(up.fields || {}).forEach(([k, v]) => form.append(k, String(v)));
        form.append('file', files[i]);
        setProgress({ current: i, total: files.length, label: `Uploading ${files[i].name}...` });
        const res = await fetch(up.upload_url, { method: 'POST', body: form });
        if (!res.ok) throw new Error(`Upload failed for ${files[i].name} (${res.status})`);
        setProgress({ current: i + 1, total: files.length, label: `Uploaded ${i + 1} of ${files.length}` });
      }
      setPhase('processing');
      setProgress({ current: 0, total: 0, label: 'Queued — starting import...' });
      await I.importStart(created.job_id);
      startPolling(created.job_id);
    } catch (e: any) {
      setPhase('error');
      setError(e?.message || 'Import failed to start');
    }
  };

  const busy = phase === 'uploading' || phase === 'processing';
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Card className="overflow-hidden" data-testid="import-section">
      <button
        type="button"
        onClick={() => setHide(!hide)}
        aria-expanded={!hide}
        data-testid="import-toggle"
        className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium text-foreground">Import from YouTube</span>
        {hide ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        )}
      </button>
      {!hide && (
        <div className="space-y-4 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Port your YouTube channel — your videos, the comments on them, and your
            profile — to this node. Export your data from Google Takeout first, then
            upload the export files here. Everything lands in your staging area;
            nothing publishes until you say so.
          </p>

          {(phase === 'idle' || phase === 'ready') && (
            <>
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-border bg-elevated/50 px-4 py-6 text-center transition-colors hover:border-brand/50 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="import-file-drop"
              >
                <UploadCloud className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                <span className="text-sm font-medium text-foreground">Choose your Takeout files</span>
                <span className="text-xs text-muted-foreground">
                  .tar or .zip — split exports (multiple files) work too
                </span>
                <input
                  type="file"
                  multiple
                  accept=".tar,.zip,.gz,.tgz"
                  className="sr-only"
                  onChange={onFiles}
                  data-testid="import-file-input"
                />
              </label>
              {files.length > 0 && (
                <ul className="space-y-1.5" data-testid="import-file-list">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between rounded bg-elevated px-3 py-2 text-sm"
                      data-testid="import-file-item"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-foreground">
                        <FileArchive className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                        <span className="truncate">{f.name}</span>
                      </span>
                      <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">
                        {formatBytes(f.size)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="brand"
                onClick={startImport}
                disabled={!files.length}
                data-testid="import-start"
              >
                Start Import
              </Button>
            </>
          )}

          {busy && (
            <div className="space-y-3" data-testid="import-progress">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-brand" strokeWidth={1.5} />
                <span className="min-w-0 truncate">{progress.label}</span>
              </div>
              {progress.total > 0 && (
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-elevated"
                  data-testid="import-progress-bar"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
              )}
              {job && job.total_records > 0 && (
                <p className="text-xs text-muted-foreground" data-testid="import-record-count">
                  {job.written_records} of {job.total_records} records written
                </p>
              )}
            </div>
          )}

          {phase === 'complete' && job && (
            <div
              className="flex items-start gap-2 rounded border border-transparent bg-success/15 px-3 py-3 text-sm text-success"
              data-testid="import-complete"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
              <div className="min-w-0">
                <p className="font-medium">{job.message || 'Import complete'}</p>
                {(job.errors?.length > 0 || job.skipped_records > 0) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {job.skipped_records} skipped
                    {job.errors?.length > 0 ? ` · ${job.errors.length} issue(s) logged on the node` : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div
              className="flex items-start gap-2 rounded border border-transparent bg-danger-muted px-3 py-3 text-sm text-danger"
              data-testid="import-error"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
              <div className="min-w-0">
                <p className="font-medium">Import failed</p>
                <p className="mt-0.5 break-words text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {(phase === 'complete' || phase === 'error') && (
            <Button variant="outline" size="sm" onClick={reset} data-testid="import-reset">
              Import another
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export default Import;
