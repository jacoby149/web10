import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Check, CheckCircle2, Clapperboard, Clock3, Film, Globe, Lock, Pause, Play, RotateCcw, Upload, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fileHint, formatBytes, remainingTime, transferPhases, uploadPercent, type UploadAction, type UploadTask } from './uploadState';

const phaseLabels = {
  preparing: 'Preparing upload', verifying: 'Verifying upload',
  uploading: 'Uploading', paused: 'Upload paused', offline: 'Waiting for connection',
  'needs-file': 'Select your file to continue', processing: 'Preparing video',
  'processing-failed': 'Video preparation failed', publishing: 'Publishing',
  'publish-failed': 'Publication needs attention', published: 'Published', cancelled: 'Cancelled',
} as const;

export type UploadCommand = (id: string, action: UploadAction) => void;
const actionClass = 'min-h-11 gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card';

export function UploadCard({ task, onCommand, onSelectFile }: { task: UploadTask; onCommand: UploadCommand; onSelectFile?: (id: string, file: File) => void }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const selectFile = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const transfer = transferPhases.includes(task.phase);
  const error = task.phase === 'processing-failed' || task.phase === 'publish-failed';
  const percent = uploadPercent(task);
  const transferred = task.phase === 'uploading' ? Math.max(task.uploadedBytes, task.transferredBytes || 0) : task.uploadedBytes;
  const statusIcon = task.phase === 'published' ? CheckCircle2 : task.phase === 'offline' ? WifiOff
    : error ? AlertTriangle : task.phase === 'paused' ? Pause : transfer ? Upload : Clapperboard;
  const StatusIcon = statusIcon;
  const send = (action: UploadAction) => onCommand(task.id, action);
  const canCancel = transfer || task.phase === 'preparing' || task.phase === 'verifying' || task.phase === 'processing' || task.phase === 'processing-failed';
  const steps = ['Upload', 'Prepare', 'Publish'];
  const currentStep = transfer || task.phase === 'preparing' || task.phase === 'verifying' ? 0 : task.phase === 'processing' || task.phase === 'processing-failed' ? 1 : 2;
  const eta = task.phase === 'uploading' ? remainingTime(task.remainingSeconds) : undefined;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card" data-testid="upload-card" aria-label={task.title || task.file.name}>
      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-brand/20 bg-gradient-to-br from-brand-muted to-elevated text-brand-300 sm:h-20 sm:w-20">
            <Film className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Your next post</p>
            <h2 className="break-words font-display text-xl font-semibold tracking-tight text-foreground">{task.title || task.file.name}</h2>
            <p className="mt-1 break-all text-xs text-muted-foreground">{task.file.name} · {formatBytes(task.file.size)}{task.durationSeconds ? ` · ${Math.floor(task.durationSeconds / 3600)}:${String(Math.floor(task.durationSeconds / 60) % 60).padStart(2, '0')}:${String(Math.floor(task.durationSeconds) % 60).padStart(2, '0')}` : ''}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="max-w-full break-words">Posting as <strong className="font-medium text-foreground">{task.authorLabel}</strong></span>
          <span className="inline-flex items-center gap-1.5">{task.audienceLabel === 'Public' ? <Globe className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}{task.audienceLabel}</span>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p role="status" className={cn('flex items-center gap-2 text-sm font-medium', error ? 'text-danger' : task.phase === 'published' ? 'text-success' : 'text-foreground')}>
            <StatusIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {phaseLabels[task.phase]}
          </p>
          {transfer && <span className="font-mono text-sm tabular-nums text-brand-300">{percent}%</span>}
        </div>

        {transfer && <>
          <div role="progressbar" aria-label="Video upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${formatBytes(transferred)} of ${formatBytes(task.file.size)} transferred; ${formatBytes(task.uploadedBytes)} saved`} className="mt-3 h-2 overflow-hidden rounded-full bg-elevated">
            <div className={cn('h-full rounded-full bg-brand transition-all duration-150 motion-reduce:transition-none', task.phase !== 'uploading' && 'bg-brand-400/60')} style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs tabular-nums text-muted-foreground">
            <span>{formatBytes(transferred)} of {formatBytes(task.file.size)}</span>
            {transferred > task.uploadedBytes && <span>{formatBytes(task.uploadedBytes)} saved</span>}
            {eta && <span>{eta}</span>}
          </div>
        </>}

        <div className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {task.phase === 'preparing' && <p>Checking the original video and saving your draft. No video bytes have been uploaded yet.</p>}
          {task.phase === 'verifying' && <p>Your video bytes are uploaded. We’re verifying the file and saving the pending post. Keep this tab open until video preparation starts; if interrupted, return here to continue without uploading again.</p>}
          {task.phase === 'uploading' && <p>You can browse web10 while this uploads. If closing this tab or locking your phone pauses it, your uploaded progress is saved. Reselect the original file when you return to resume—not start from zero.</p>}
          {task.phase === 'paused' && <p>Your uploaded progress is saved. Resume whenever you’re ready.</p>}
          {task.phase === 'offline' && <p>Your uploaded progress is saved. We’ll retry when you’re back online.</p>}
          {task.phase === 'needs-file' && <p><strong className="font-medium text-foreground">{formatBytes(task.uploadedBytes)} already uploaded.</strong> Select the original file to resume where you left off—not start from zero. Your title, description and audience are still here.</p>}
          {task.phase === 'processing' && <p>Upload complete. We’re making your video ready to watch. You can close this page; your post will publish automatically when the video is ready.</p>}
          {task.phase === 'processing-failed' && <p>Your original video is uploaded. Try preparing it again—there’s no need to upload it twice.</p>}
          {task.phase === 'publishing' && <p>Your video is ready. We’re publishing your post to the audience you chose.</p>}
          {task.phase === 'publish-failed' && <p>Your video is ready and has not been uploaded again. Retry publication once its current status has been checked.</p>}
          {task.phase === 'published' && <p>Your post is ready to watch.</p>}
          {task.phase === 'cancelled' && <p>This pending post was cancelled. It won’t be published.</p>}
        </div>
        {task.error && <p role="alert" className="mt-3 break-words rounded-lg border border-danger/30 bg-danger-muted/40 p-3 text-sm text-danger">{task.error}</p>}

        {task.phase !== 'cancelled' && <ol aria-label="Publication progress" className="mt-6 grid grid-cols-3 gap-2 border-t border-border pt-4">
          {steps.map((step, index) => {
            const complete = index < currentStep || task.phase === 'published';
            return <li key={step} aria-current={index === currentStep && task.phase !== 'published' ? 'step' : undefined} className={cn('flex items-center gap-2 text-xs', complete || index === currentStep ? 'text-foreground' : 'text-muted-foreground')}>
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border', complete ? 'border-brand/30 bg-brand-muted text-brand-300' : index === currentStep ? 'border-brand text-brand-300' : 'border-border')}>
                {complete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>{step}
            </li>;
          })}
        </ol>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {task.phase === 'uploading' && <Button variant="outline" className={actionClass} onClick={() => send({ type: 'pause' })}><Pause className="h-4 w-4" aria-hidden="true" />Pause</Button>}
          {task.phase === 'paused' && <Button variant="brand" className={actionClass} onClick={() => send({ type: 'resume' })}><Play className="h-4 w-4" aria-hidden="true" />Resume upload</Button>}
          {task.phase === 'offline' && <Button variant="outline" className={actionClass} onClick={() => send({ type: 'resume' })}><RotateCcw className="h-4 w-4" aria-hidden="true" />Retry now</Button>}
          {task.phase === 'needs-file' && <>
            <input ref={selectFile} type="file" className="hidden" aria-label="Select original video" accept="video/mp4,video/webm" onChange={event => {
              const file = event.target.files?.[0];
              if (file) {
                if (onSelectFile) onSelectFile(task.id, file);
                else send({ type: 'select-file', file: fileHint(file) });
              }
              event.target.value = '';
            }} />
            <Button variant="brand" className={actionClass} onClick={() => selectFile.current?.click()}><Upload className="h-4 w-4" aria-hidden="true" />Select original file</Button>
          </>}
          {task.phase === 'processing-failed' && <Button variant="brand" className={actionClass} onClick={() => send({ type: 'retry-processing' })}><RotateCcw className="h-4 w-4" aria-hidden="true" />Retry processing</Button>}
          {task.phase === 'publish-failed' && <Button variant="brand" className={actionClass} onClick={() => send({ type: 'retry-publish' })}><RotateCcw className="h-4 w-4" aria-hidden="true" />Retry publication</Button>}
          {task.phase === 'published' && task.postPath && <Button asChild variant="brand" className={actionClass}><Link to={task.postPath}>View post<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></Button>}
          {canCancel && <Button ref={cancelButton} variant="ghost" className={cn(actionClass, 'text-muted-foreground hover:bg-elevated hover:text-foreground')} onClick={() => { setConfirmCancel(true); requestAnimationFrame(() => confirmButton.current?.focus()); }}>{task.phase === 'needs-file' ? 'Discard' : 'Cancel'}</Button>}
        </div>
        {confirmCancel && canCancel && <div role="group" aria-label="Confirm cancellation" className="mt-4 rounded-lg border border-border bg-elevated p-4" onKeyDown={event => {
          if (event.key === 'Escape') { setConfirmCancel(false); cancelButton.current?.focus(); }
        }}>
          <p className="text-sm font-medium text-foreground">Cancel this pending post?</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">It won’t be published. You may need to upload the file again if you start over.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button ref={confirmButton} variant="destructive" className={actionClass} onClick={() => { setConfirmCancel(false); send({ type: 'cancel' }); }}><X className="h-4 w-4" aria-hidden="true" />Cancel post</Button>
            <Button variant="outline" className={actionClass} onClick={() => { setConfirmCancel(false); cancelButton.current?.focus(); }}>Keep post</Button>
          </div>
        </div>}
        {task.description && <details className="mt-5 border-t border-border pt-3">
          <summary className="cursor-pointer rounded py-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Post description</summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{task.description}</p>
        </details>}
      </div>
      {(task.phase === 'processing' || task.phase === 'publishing') && <div className="flex items-center gap-2 border-t border-border bg-brand-muted/20 px-4 py-3 text-xs text-brand-300 sm:px-6"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{task.phase === 'processing' ? 'Longer videos can take a little while.' : 'Your post is not in the feed yet.'}</div>}
    </article>
  );
}
