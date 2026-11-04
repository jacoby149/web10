// A deterministic UI preview, not an upload transport. Never imported by App.
import { createContext, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PostComposer from '@/components/Feed/PostComposer';
import { UploadCenter, UploadIndicator } from '@/components/Uploads/UploadCenter';
import { type MediaPostDraft, type UploadAction, type UploadPhase, type UploadTask } from '@/components/Uploads/uploadState';
import { Button } from '@/components/ui/button';
import { ownerKey, PreviewUploadQueue, previewOwner, type PreviewOwner } from './previewUploadQueue';

export const uploadScenarios = ['uploading', 'paused', 'offline', 'needs-file', 'processing', 'processing-failed', 'publishing', 'publish-failed', 'published', 'cancelled', 'empty'] as const;
export type UploadScenario = typeof uploadScenarios[number];
const scenarios = new Set<string>(uploadScenarios);
export function previewScenario(value: string | null): UploadScenario {
  return scenarios.has(value || '') ? value as UploadScenario : 'uploading';
}

export function seedUpload(phase: UploadPhase = 'uploading'): UploadTask {
  const uploaded = ['processing', 'processing-failed', 'publishing', 'publish-failed', 'published'].includes(phase);
  return {
    id: 'nosferatu', title: 'Nosferatu (1922)',
    description: 'A night at the movies. The complete 1922 silent film, in one post.',
    authorLabel: 'Century Club Movies', audienceLabel: 'Public',
    file: { name: 'Nosferatu-1922.mp4', size: 514619769, type: 'video/mp4', lastModified: 0 },
    durationSeconds: 5514, uploadedBytes: uploaded ? 514619769 : 216006656, phase,
    remainingSeconds: phase === 'uploading' ? 240 : undefined,
    error: phase === 'processing-failed' ? 'Video preparation didn’t finish. Your original file is still available.'
      : phase === 'publish-failed' ? 'Publication could not be confirmed. Check its status before retrying.' : undefined,
  };
}

interface PreviewQueue {
  owner: PreviewOwner | null;
  switchAccount(owner: PreviewOwner | null): void;
  tasks: UploadTask[];
  command(id: string, action: UploadAction): void;
  queue(draft: MediaPostDraft): void;
  reset(scenario: UploadScenario): void;
}
const PreviewContext = createContext<PreviewQueue | null>(null);
function usePreviewQueue() {
  const queue = useContext(PreviewContext);
  if (!queue) throw new Error('Upload preview provider is missing');
  return queue;
}

export function UploadPreviewProvider({ scenario, children, owner = previewOwner }: { scenario: UploadScenario; children: ReactNode; owner?: PreviewOwner | null }) {
  const [store] = useState(() => new PreviewUploadQueue(owner, scenario === 'empty' ? [] : [seedUpload(scenario)]));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const requestedKey = ownerKey(owner);
  useLayoutEffect(() => {
    if (ownerKey(store.getSnapshot().owner) !== requestedKey) store.activate(owner);
  }, [requestedKey]);
  useEffect(() => {
    // Queue lifecycle belongs above routes, including while the user browses.
    const online = () => {
      const sink = store.bind();
      store.getSnapshot().tasks.filter(task => task.phase === 'offline').forEach(task => sink.command(task.id, { type: 'resume' }));
    };
    const offline = () => {
      const sink = store.bind();
      store.getSnapshot().tasks.filter(task => task.phase === 'uploading').forEach(task => sink.command(task.id, { type: 'offline' }));
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [store]);
  const { command: boundCommand, queue, reset: boundReset } = store.bind();
  function command(id: string, action: UploadAction) {
    console.log('[upload-preview] command', { action: action.type });
    boundCommand(id, action);
  }
  function reset(next: UploadScenario) {
    boundReset(next === 'empty' ? [] : [seedUpload(next)]);
  }
  return <PreviewContext.Provider value={{ ...snapshot, command, queue, reset, switchAccount: next => store.activate(next) }}>{children}</PreviewContext.Provider>;
}

/** Always visible: these scenario controls cannot be mistaken for live status. */
export function UploadPreviewControls() {
  const queue = usePreviewQueue();
  const location = useLocation();
  const [params] = useSearchParams();
  const selected = queue.tasks.find(task => task.id === params.get('upload')) || queue.tasks[0];
  const navigate = useNavigate();
  const isCompose = location.pathname === '/upload-compose';
  const inPreview = location.pathname === '/uploads' || isCompose;
  return <aside className="border-b border-brand/20 bg-brand-muted/20 px-4 py-3" data-testid="upload-preview-controls" aria-label="Upload preview controls">
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-medium text-brand-300">UI preview · No files uploaded. No posts published.</p>
      {inPreview && <details className="mt-1 text-xs text-muted-foreground">
        <summary data-testid="upload-preview-scenarios" className="min-h-11 cursor-pointer rounded py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Test a scenario</summary>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <label className="flex items-center gap-2">Simulated account
            <select aria-label="Preview account" value={queue.owner ? queue.owner.username === previewOwner.username ? 'original' : 'other' : 'signed-out'} className="min-h-11 rounded border border-border bg-card px-3 text-foreground focus-visible:ring-2 focus-visible:ring-ring" onChange={event => {
              queue.switchAccount(event.target.value === 'signed-out' ? null : { ...previewOwner, username: event.target.value === 'original' ? 'me' : 'other' });
              navigate('/uploads');
            }}>
              <option value="original">Original preview account</option><option value="other">Other preview account</option><option value="signed-out">Signed out</option>
            </select>
          </label>
          <label className="flex items-center gap-2">State
            <select aria-label="Preview scenario" disabled={!queue.owner} value={selected?.phase || 'empty'} className="min-h-11 rounded border border-border bg-card px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" onChange={event => {
              const scenario = previewScenario(event.target.value);
              queue.reset(scenario);
              // The outer harness URL restores the scenario on browser refresh.
              const url = new URL(window.location.href);
              url.searchParams.set('screen', 'uploads');
              url.searchParams.set('scenario', scenario);
              window.history.replaceState({}, '', url);
              navigate('/uploads');
            }}>
              {uploadScenarios.map(scenario => <option key={scenario} value={scenario}>{scenario}</option>)}
            </select>
          </label>
          {selected?.phase === 'uploading' && <>
            <Button variant="outline" className="min-h-11" onClick={() => queue.command(selected.id, { type: 'progress', uploadedBytes: Math.min(selected.file.size, selected.uploadedBytes + selected.file.size / 10), remainingSeconds: 180 })}>Advance upload</Button>
            <Button variant="outline" className="min-h-11" onClick={() => queue.command(selected.id, { type: 'offline' })}>Lose connection</Button>
            <Button variant="outline" className="min-h-11" onClick={() => queue.command(selected.id, { type: 'uploaded' })}>Finish upload</Button>
          </>}
          {selected && ['uploading', 'paused', 'offline'].includes(selected.phase) && <Button variant="outline" className="min-h-11" onClick={() => queue.command(selected.id, { type: 'file-lost' })}>Simulate reopen</Button>}
          {selected?.phase === 'processing' && <>
            <Button variant="outline" className="min-h-11" onClick={() => queue.command(selected.id, { type: 'processed' })}>Video ready</Button>
            <Button variant="outline" className="min-h-11" onClick={() => queue.command(selected.id, { type: 'processing-failed', message: 'Video preparation didn’t finish. Your original file is still available.' })}>Fail processing</Button>
          </>}
          {selected?.phase === 'publishing' && <>
            <Button variant="outline" className="min-h-11" onClick={() => queue.command(selected.id, { type: 'published' })}>Confirm published</Button>
            <Button variant="outline" className="min-h-11" onClick={() => queue.command(selected.id, { type: 'publish-failed', message: 'Publication could not be confirmed. Check its status before retrying.' })}>Fail publication</Button>
          </>}
        </div>
      <nav className="flex flex-wrap gap-x-4 text-xs" aria-label="Upload preview navigation">
        <Link className="inline-flex min-h-11 items-center rounded text-brand-300 hover:underline focus-visible:ring-2 focus-visible:ring-ring" to="/upload-compose">Try the composer</Link>
        <Link className="inline-flex min-h-11 items-center rounded text-brand-300 hover:underline focus-visible:ring-2 focus-visible:ring-ring" to="/uploads">Uploads</Link>
        <Link className="inline-flex min-h-11 items-center rounded text-brand-300 hover:underline focus-visible:ring-2 focus-visible:ring-ring" to="/feed">Browse while uploading</Link>
      </nav>
      </details>}
    </div>
  </aside>;
}

export function UploadPreviewCenter() {
  const { tasks, command, owner } = usePreviewQueue();
  return <><UploadPreviewControls />{owner ? <UploadCenter key={ownerKey(owner)} tasks={tasks} onCommand={command} composePath="/upload-compose" /> : <div className="mx-auto max-w-3xl p-6"><h1 className="font-display text-2xl text-foreground">Preview signed out</h1><p className="mt-3 text-sm text-muted-foreground">Choose the original preview account to recover its pending posts. No other account can see them here.</p></div>}</>;
}

export function UploadPreviewComposer() {
  const { queue, owner } = usePreviewQueue();
  const navigate = useNavigate();
  return <><UploadPreviewControls /><div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
    <h1 className="mb-2 font-display text-2xl font-semibold text-foreground">Bring your film to life</h1>
    <p className="mb-6 text-sm text-muted-foreground">Choose a video, write your post, then press Post. Nothing starts uploading when you attach a file.</p>
    {owner ? <div className="rounded-xl border border-border bg-card"><PostComposer key={ownerKey(owner)} chromeless onQueueMediaPost={draft => { queue(draft); navigate('/uploads'); }} /></div> : <p className="text-sm text-muted-foreground">Choose a preview account before composing.</p>}
  </div></>;
}

export function UploadPreviewDock() {
  const { tasks } = usePreviewQueue();
  const { pathname } = useLocation();
  if (pathname === '/uploads' || pathname === '/upload-compose') return null;
  return <><div className="fixed bottom-60 right-4 z-40 rounded bg-card px-3 py-2 text-xs text-muted-foreground md:bottom-48 sm:right-6">Upload UI preview</div><UploadIndicator tasks={tasks} /></>;
}
