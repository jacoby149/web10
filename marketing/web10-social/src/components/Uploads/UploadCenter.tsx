import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, CheckCircle2, Upload, WifiOff } from 'lucide-react';
import { UploadCard, type UploadCommand } from './UploadCard';
import { isFinished, uploadPercent, type UploadTask } from './uploadState';
import { Button } from '@/components/ui/button';

export function UploadCenter({ tasks, onCommand, composePath, onSelectFile }: { tasks: UploadTask[]; onCommand: UploadCommand; composePath: string; onSelectFile?: (id: string, file: File) => void }) {
  const [params] = useSearchParams();
  const selected = params.get('upload');
  const visible = selected ? tasks.filter(task => task.id === selected) : tasks;
  const pending = tasks.filter(task => !isFinished(task)).length;
  return <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-8" data-testid="upload-center">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-brand-300">Publishing</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Your uploads</h1>
      </div>
      <Button asChild variant="outline" className="min-h-11 shrink-0 gap-2 focus-visible:ring-2 focus-visible:ring-ring"><Link to={composePath}>New post<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
    </div>
    <p className="mb-6 mt-3 text-sm leading-relaxed text-muted-foreground">{pending ? `${pending} post${pending === 1 ? '' : 's'} in progress. Your audience sees it when it’s ready.` : 'A home for the posts you’re bringing to life.'}</p>
    {selected && <Link to="/uploads" className="mb-4 inline-flex min-h-11 items-center gap-2 rounded text-sm text-brand-300 hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" aria-hidden="true" />All uploads</Link>}
    {visible.length ? <div className="space-y-4">{visible.map(task => <UploadCard key={task.id} task={task} onCommand={onCommand} onSelectFile={onSelectFile} />)}</div> : <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center" data-testid="upload-empty">
      <Upload className="mx-auto h-8 w-8 text-brand-300" strokeWidth={1.5} aria-hidden="true" />
      <h2 className="mt-4 font-display text-xl font-medium text-foreground">{selected ? 'Upload not found' : 'Your next story starts here'}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{selected ? 'This upload may belong to another session or no longer be available. Check all uploads before starting again.' : 'Choose a video and write your post. Uploading starts only when you press Post.'}</p>
      <Button asChild variant="brand" className="mt-6 min-h-11 focus-visible:ring-2 focus-visible:ring-ring"><Link to={selected ? '/uploads' : composePath}>{selected ? 'All uploads' : 'Create a post'}</Link></Button>
    </div>}
    <p className="mt-6 text-xs leading-relaxed text-muted-foreground">Uploads are resumable. If you leave, reselect the original file when you return—you won’t start from zero. After upload completes, video preparation can continue without you.</p>
  </section>;
}

/** Mount above routes with the real queue provider, not inside a composer. */
export function UploadIndicator({ tasks }: { tasks: UploadTask[] }) {
  const active = tasks.filter(task => !isFinished(task));
  const task = active[0] || tasks.find(task => task.phase === 'published');
  if (!task) return null;
  const status = task.phase === 'published' ? 'Your post is ready' : task.phase === 'preparing' ? 'Preparing upload' : task.phase === 'verifying' ? 'Verifying upload' : task.phase === 'uploading' ? `Uploading · ${uploadPercent(task)}%`
    : task.phase === 'paused' ? 'Upload paused' : task.phase === 'offline' ? 'Connection lost'
      : task.phase === 'needs-file' ? 'Select your file to continue' : task.phase === 'processing' ? 'Preparing your video'
        : task.phase === 'publishing' ? 'Publishing your post' : 'Your post needs attention';
  const Icon = task.phase === 'published' ? CheckCircle2 : task.phase === 'offline' ? WifiOff : Upload;
  return <Link to={`/uploads?upload=${encodeURIComponent(task.id)}`} data-testid="upload-indicator" className="fixed inset-x-4 bottom-40 z-40 mx-auto flex min-h-16 max-w-sm items-center gap-3 rounded-xl border border-brand/30 bg-card p-4 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inset-x-auto md:bottom-28 sm:right-6 sm:mx-0 sm:w-80 hover:bg-elevated">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{status}</span><span className="block truncate text-xs text-muted-foreground">{active.length > 1 ? `${active.length} posts in progress` : task.title || task.file.name}</span></span>
    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>;
}
