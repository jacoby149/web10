/** Shared across paging generations: abort does not free a live sequence early. */
let active = 0;
const waiting: { run: () => void; cancel: () => void }[] = [];
export function withSourceBudget<T>(read: () => Promise<T>, current: () => boolean, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const ended = () => new Error('Source request scope ended');
    if (!current() || signal.aborted) { reject(ended()); return; }
    const entry = {
      cancel: () => {
        const index = waiting.indexOf(entry);
        if (index >= 0) { waiting.splice(index, 1); signal.removeEventListener('abort', entry.cancel); reject(ended()); }
      },
      run: () => {
        signal.removeEventListener('abort', entry.cancel);
        if (!current() || signal.aborted) { reject(ended()); return; }
        active++;
        void Promise.resolve().then(() => {
          if (!current() || signal.aborted) throw ended();
          return read();
        }).then(resolve, reject).finally(() => {
          active--;
          while (active < 4 && waiting.length) waiting.shift()!.run();
        });
      },
    };
    if (active < 4) entry.run();
    else if (waiting.length >= 64) reject(new Error('Source request queue full'));
    else { waiting.push(entry); signal.addEventListener('abort', entry.cancel, { once: true }); }
  });
}
