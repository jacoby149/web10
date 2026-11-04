// Simulation lifecycle only. This is not an auth gate or durable upload store.
import { fileHint, transferPhases, uploadReducer, type MediaPostDraft, type UploadAction, type UploadTask } from '@/components/Uploads/uploadState';

export interface PreviewOwner { node: string; provider: string; username: string }
export const previewOwner: PreviewOwner = { node: 'preview-node', provider: 'web10', username: 'me' };
export const ownerKey = (owner: PreviewOwner | null) => owner ? JSON.stringify([owner.node, owner.provider, owner.username]) : null;
type DraftSnapshot = Omit<MediaPostDraft, 'media'> & {
  media: (Omit<MediaPostDraft['media'][number], 'file' | 'albumArt'> & { file: ReturnType<typeof fileHint>; albumArt?: ReturnType<typeof fileHint> })[];
};
interface Entry { task: UploadTask; draft?: DraftSnapshot; attempt: number }
interface Snapshot { owner: PreviewOwner | null; tasks: UploadTask[] }

export class PreviewUploadQueue {
  private partitions = new Map<string, Entry[]>();
  private listeners = new Set<() => void>();
  private generation = 0;
  private sequence = 0;
  private snapshot: Snapshot;

  constructor(owner: PreviewOwner | null, tasks: UploadTask[]) {
    this.snapshot = { owner: owner ? { ...owner } : null, tasks: [] };
    const key = ownerKey(owner);
    if (key) this.partitions.set(key, tasks.map(task => ({ task, attempt: ++this.sequence })));
    this.refresh();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private entries() { return this.partitions.get(ownerKey(this.snapshot.owner) || '') || []; }
  private refresh() {
    this.snapshot = { owner: this.snapshot.owner, tasks: this.entries().map(entry => entry.task) };
    this.listeners.forEach(listener => listener());
  }
  activate(owner: PreviewOwner | null) {
    // Invalidate even on A→logout→A or an explicit same-owner reauthentication.
    this.generation++;
    this.entries().forEach(entry => {
      if (transferPhases.includes(entry.task.phase)) entry.task = uploadReducer(entry.task, { type: 'file-lost' });
      entry.attempt = ++this.sequence;
    });
    this.snapshot = { owner: owner ? { ...owner } : null, tasks: [] };
    this.refresh();
  }
  getDraft(id: string) { return this.entries().find(entry => entry.task.id === id)?.draft; }

  /** Bind each render/worker attempt. Retained callbacks cannot borrow a new session. */
  bind() {
    const key = ownerKey(this.snapshot.owner);
    const generation = this.generation;
    const attempts = new Map(this.entries().map(entry => [entry.task.id, entry.attempt]));
    const current = () => key !== null && key === ownerKey(this.snapshot.owner) && generation === this.generation;
    return {
      command: (id: string, action: UploadAction) => {
        if (!current()) return;
        const entry = this.entries().find(item => item.task.id === id);
        if (!entry || entry.attempt !== attempts.get(id)) return;
        const next = uploadReducer(entry.task, action);
        if (next === entry.task) return;
        if (next.phase !== entry.task.phase) entry.attempt = ++this.sequence;
        entry.task = next;
        this.refresh();
      },
      queue: (draft: MediaPostDraft) => {
        if (!current()) throw new Error('The preview account changed. Open a fresh composer before posting.');
        if (draft.media.length !== 1 || !draft.media[0].file.type.startsWith('video/')) {
          throw new Error('This upload-flow preview supports one video per post. Live posting is unchanged.');
        }
        // Metadata only: do not retain raw File objects across preview sessions.
        const saved: DraftSnapshot = {
          title: draft.title, text: draft.text, visibility: draft.visibility,
          authorAs: draft.authorAs, authorLabel: draft.authorLabel,
          groups: draft.groups ? [...draft.groups] : undefined,
          pinnedAdId: draft.pinnedAdId, markAsMusic: draft.markAsMusic,
          media: draft.media.map(({ file, albumArt, ...metadata }) => ({ ...metadata, file: fileHint(file), albumArt: albumArt ? fileHint(albumArt) : undefined })),
        };
        const media = saved.media[0];
        const id = `preview-${++this.sequence}`;
        const entry: Entry = { attempt: ++this.sequence, draft: saved, task: {
          id, title: saved.title, description: saved.text, authorLabel: saved.authorLabel,
          audienceLabel: saved.visibility === 'public' ? 'Public' : 'Chosen audience',
          file: media.file, durationSeconds: media.duration, uploadedBytes: 0, phase: 'uploading',
        } };
        this.partitions.set(key!, [...this.entries(), entry]);
        this.refresh();
        return id;
      },
      reset: (tasks: UploadTask[]) => {
        if (!current()) return;
        this.generation++;
        this.partitions.set(key!, tasks.map(task => ({ task, attempt: ++this.sequence })));
        this.refresh();
      },
    };
  }
}
