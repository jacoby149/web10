// ── ImportSection — "port your YouTube" (Settings) ───────────────────────────
// The import pipeline's UI (KB: social/import.md). Pick the Google Takeout
// export files (tar/zip, split exports are fine), choose WHERE it lands — your
// profile, or a group you own (the "page" — the channel becomes that group's
// face, the group-as-profile model) — then watch the import run with a real
// percentage. Everything stages owner-only (D30); nothing publishes until you
// say so. The node deletes the raw export when the job finishes.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  Layers,
  Loader2,
  UploadCloud,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  importStatus,
  startImport,
  type ImportJob,
} from '@/data/imports';
import {
  getGroupsManages,
  readGroupIdentity,
  groupDisplayName,
  isFollowersGroup,
  type GroupIdentity,
} from '@/data/groups';
import type { V3Group } from '@/data/v3';

type Phase = 'idle' | 'ready' | 'uploading' | 'processing' | 'complete' | 'error';

interface TargetOption {
  group_id: string;
  name: string;
}

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

export function ImportSection() {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The target picker — your profile (default) or a group you own.
  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetGroupId, setTargetGroupId] = useState<string>(''); // '' = your profile
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Load the groups the user manages (the importable targets) once. The face
  // name is fetched per group (the group-as-profile face, D60) with the slug as
  // fallback — the list is small (groups you own), so the N reads are fine.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const groups = await getGroupsManages();
        const opts: TargetOption[] = await Promise.all(
          groups.map(async (g: V3Group) => {
            // Skip the followers group (that's "your profile" — the default) and
            // infrastructure groups; the import target is a real page/community.
            if (isFollowersGroup(g.group_id)) return null;
            const face: GroupIdentity = await readGroupIdentity(g.group_id).catch(() => ({}));
            return { group_id: g.group_id, name: face.name || groupDisplayName(g.group_id) };
          }),
        );
        if (!cancelled) setTargets(opts.filter((o): o is TargetOption => o !== null));
      } catch (e) {
        console.error('[imports] failed to load target groups:', e);
      } finally {
        if (!cancelled) setTargetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reset = () => {
    stopPolling();
    setPhase('idle');
    setFiles([]);
    setJob(null);
    setError(null);
  };

  const startPolling = (jobId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await importStatus(jobId);
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
        }
      } catch (e) {
        stopPolling();
        setPhase('error');
        setError(e instanceof Error ? e.message : 'Failed to check import status');
      }
    }, 2000);
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    setFiles(list);
    if (list.length) setPhase('ready');
    e.target.value = ''; // allow re-selecting the same file
  };

  const start = async () => {
    if (!files.length) return;
    setError(null);
    setPhase('uploading');
    try {
      const jobId = await startImport('youtube', files, targetGroupId || undefined);
      setPhase('processing');
      setJob(null);
      startPolling(jobId);
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : 'Import failed to start');
    }
  };

  const busy = phase === 'uploading' || phase === 'processing';
  const pct = job?.progress ?? 0;
  const targetLabel = targetGroupId
    ? targets.find((t) => t.group_id === targetGroupId)?.name || 'A group'
    : 'Your profile';

  return (
    <div className="px-4 py-4 space-y-4" data-testid="import-section">
      <div>
        <p className="text-sm text-foreground">Import from YouTube</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Port your channel — your videos, the comments on them, and your profile — to this node.
          Export your data from Google Takeout first, then upload the files here.
        </p>
      </div>

      {(phase === 'idle' || phase === 'ready') && (
        <>
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-elevated/50 px-4 py-6 text-center transition-colors hover:border-brand/50 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="import-file-drop"
          >
            <UploadCloud className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-sm font-medium text-foreground">Choose your Takeout files</span>
            <span className="text-xs text-muted-foreground">.tar or .zip — split exports (multiple files) work too</span>
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
                  <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* The target picker — where the catalog lands. */}
          <div className="space-y-2" data-testid="import-target">
            <p className="text-xs font-medium text-muted-foreground">Import into</p>
            {targetsLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated/50 px-3 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                Loading your groups…
              </div>
            ) : (
              <div className="space-y-1.5">
                <TargetRow
                  icon={User}
                  label="Your profile"
                  hint="The channel becomes your profile"
                  selected={targetGroupId === ''}
                  onSelect={() => setTargetGroupId('')}
                />
                {targets.map((t) => (
                  <TargetRow
                    key={t.group_id}
                    icon={Layers}
                    label={t.name}
                    hint="The channel becomes this group's page"
                    selected={targetGroupId === t.group_id}
                    onSelect={() => setTargetGroupId(t.group_id)}
                  />
                ))}
              </div>
            )}
          </div>

          <Button
            variant="brand"
            onClick={start}
            disabled={!files.length || targetsLoading}
            data-testid="import-start"
            className="w-full"
          >
            Start Import
          </Button>
        </>
      )}

      {busy && (
        <div className="space-y-3" data-testid="import-progress">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-brand" strokeWidth={1.5} />
            <span className="min-w-0 truncate">
              {phase === 'uploading' ? 'Uploading your export…' : job?.message || 'Importing…'}
            </span>
            {phase === 'processing' && job && (
              <span className="ml-auto shrink-0 font-mono text-xs text-brand-300">{pct}%</span>
            )}
          </div>
          {phase === 'processing' && job && (
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-elevated"
              data-testid="import-progress-bar"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          )}
          {phase === 'processing' && job && job.total_records > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="import-record-count">
              {job.written_records} of {job.total_records} records written → {targetLabel}
            </p>
          )}
        </div>
      )}

      {phase === 'complete' && job && (
        <div
          className="flex items-start gap-2 rounded-lg border border-transparent bg-success/15 px-3 py-3 text-sm text-success"
          data-testid="import-complete"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
          <div className="min-w-0">
            <p className="font-medium">{job.message || 'Import complete'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Staged into {targetLabel} — nothing publishes until you do.
              {(job.errors?.length > 0 || job.skipped_records > 0) &&
                ` ${job.skipped_records} skipped${job.errors?.length ? ` · ${job.errors.length} issue(s) logged` : ''}.`}
            </p>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div
          className="flex items-start gap-2 rounded-lg border border-transparent bg-danger-muted px-3 py-3 text-sm text-danger"
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
  );
}

function TargetRow({
  icon: Icon,
  label,
  hint,
  selected,
  onSelect,
}: {
  icon: typeof User;
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={selected ? 'import-target-selected' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150',
        selected
          ? 'border-brand/40 bg-brand-muted/40'
          : 'border-border bg-elevated/50 hover:border-brand/30 hover:bg-elevated',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', selected ? 'text-brand-300' : 'text-muted-foreground')} strokeWidth={1.5} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', selected ? 'text-foreground' : 'text-foreground/90')}>{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-300" strokeWidth={1.5} />}
    </button>
  );
}
