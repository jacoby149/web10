import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Search, Settings, UserRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { readSocialAvatar } from '@/lib/socialAvatar';
import Branding from './Branding';

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-ink';
const row = 'flex min-h-11 w-full items-center gap-3 rounded px-3 text-left text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-ring';

function AccountMenu({ I, username, provider }: { I: Record<string, any>; username: string; provider?: string }) {
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState<string>();
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = useRef(I);
  current.current = I;
  const token = I.v3?.state?.token;

  useEffect(() => {
    setAvatar(undefined);
    const { v3, ownAccountRead } = current.current;
    if (!token || !v3.state?.apiOrigin || !v3.listMedia || !ownAccountRead) return;
    const abort = new AbortController();
    const ownsRead = ownAccountRead('socialAvatar');
    const owns = () => !abort.signal.aborted && ownsRead();
    readSocialAvatar(v3, username, provider, owns, abort.signal).then(url => {
      if (owns()) setAvatar(url);
    }).catch(() => {
      if (owns()) console.log('[auth-ui] avatar unavailable; keeping account icon');
    });
    return () => abort.abort();
  }, [username, provider, token]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="relative min-w-0" ref={ref} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={open ? 'hub-account-actions' : undefined}
        onClick={() => setOpen(value => !value)} data-testid="topbar-account"
        className={`flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-full border border-hub-ink/20 bg-hub-tint py-1 pl-1 pr-3 text-hub-ink hover:bg-hub-tint-hover ${focus}`}>
        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-hub-header">
          {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" className="size-full object-cover"
            onError={() => setAvatar(currentUrl => currentUrl === avatar ? undefined : currentUrl)} data-testid="topbar-avatar" />
            : <UserRound aria-hidden="true" className="size-4" />}
        </span>
        <span className="max-w-40 truncate text-sm font-medium" data-testid="topbar-username">{username}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
      </button>
      {open && (
        <div id="hub-account-actions" className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          <button type="button" onClick={() => { setOpen(false); I.setMode('settings'); }} className={row} data-testid="account-settings">
            <Settings aria-hidden="true" className="size-4" /> Settings
          </button>
          <button type="button" onClick={() => { setOpen(false); I.logout(); }} className={row} data-testid="account-logout">
            <LogOut aria-hidden="true" className="size-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function TopBar({ I }: { I: Record<string, any> }) {
  const authed = I.isAuthenticated?.();
  const account = I.v3?.readToken?.();
  const searchLabel = I.mode === 'contracts' ? 'Search app permissions' : 'Search requests';
  return (
    <header className="hub-header grid h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-4 sm:grid-cols-[minmax(max-content,1fr)_minmax(0,28rem)_minmax(max-content,1fr)] sm:px-6" data-testid="hub-header">
      <button type="button" className={`justify-self-start rounded ${focus}`} onClick={() => I.setMode(authed ? 'contracts' : 'login')} aria-label="web10 Hub home">
        <Branding I={I} size="sm" tagline={false} hubHeader />
      </button>
      <div className="relative hidden min-w-0 sm:block">
        {authed && (I.mode === 'contracts' || I.mode === 'requests') && <>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input className="h-9 border-hub-ink/20 bg-hub-tint pl-9 text-hub-ink placeholder:text-hub-ink/75 focus-visible:ring-hub-ink" placeholder={`${searchLabel}…`}
            aria-label={searchLabel} value={I.search ?? ''} onChange={event => I.runSearch(event.target.value)} data-testid="topbar-search" />
        </>}
      </div>
      <div className="min-w-0 justify-self-end">
        {authed && account?.username && <AccountMenu
          key={JSON.stringify([I.v3.state?.apiOrigin, account.provider, account.username, I.accountReadGeneration])}
          I={I} username={account.username} provider={account.provider} />}
      </div>
    </header>
  );
}
