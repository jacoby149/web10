import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Pin, Users, X } from 'lucide-react';
import { getV3Client } from '@/data/v3';
import { readGroupIdentity } from '@/data/groups';
import { selectActingAuthor, useActingAuthor } from '@/data/actingIdentity';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { resolveFaceMedia, GROUP_FACE_SQL, type FaceUrls } from '@web10/discover/face';

type Identity = { id: string; name: string };

export default function ActingIdentitySwitcher({ personalName, personalAvatar, onViewProfile, onCreateGroup }: { personalName?: string; personalAvatar?: string; onViewProfile?: () => void; onCreateGroup?: () => void }) {
  const selected = useActingAuthor();
  const token = getV3Client().readToken();
  const account = token ? `${token.provider}:${token.username}` : '';
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pending, setPending] = useState<string>();
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedFace, setSelectedFace] = useState<{ id: string; name?: string; avatarUrl?: string }>();
  const [faces, setFaces] = useState<Map<string, FaceUrls>>(new Map());
  const [pins, setPins] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const searchId = useId();
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openingPicker = useRef(false);
  const preferenceKey = `social:identity-preferences:${account}`;
  const mountPanel = (content: ReactNode) => mobile ? createPortal(content, document.body) : content;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (selected) Promise.all([
      readGroupIdentity(selected),
      resolveFaceMedia(async (sql, scope, prepare) => (await getV3Client().query(sql, { groups: scope, prepare })).rows, GROUP_FACE_SQL, [selected], 'group_id'),
    ]).then(([identity, faces]) => {
      const face = faces.get(selected);
      if (!cancelled) setSelectedFace({ id: selected, name: face?.name || identity.name, avatarUrl: face?.avatar_url });
    });
    return () => { cancelled = true; };
  }, [selected, account]);

  useEffect(() => {
    setIdentities([]);
    setOpen(false);
    setProfileOpen(false);
    try {
      const saved = JSON.parse(sessionStorage.getItem(preferenceKey) || '{}');
      setPins(Array.isArray(saved.pins) ? saved.pins : []);
      setRecent(Array.isArray(saved.recent) ? saved.recent : []);
    } catch { setPins([]); setRecent([]); }
  }, [preferenceKey]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    console.log('[social-identity] loading eligible identities');
    getV3Client().getMyGroups().then(async (groups) => {
      const results = await Promise.allSettled(groups.map(async (membership) => {
        const group = await getV3Client().getGroup(membership.group_id);
        const role = group.roles?.find((role) => role.name === membership.my_role);
        const perms = role?.permissions as Record<string, string[]> | undefined;
        if (!['posts', 'comments', 'reactions'].some((service) =>
          [...(perms?.['*'] || []), ...(perms?.[service] || [])].includes('create'))) return null;
        const face = await readGroupIdentity(group.group_id);
        return { id: group.group_id, name: face.name || group.group_id.split('/').pop() || 'Group' };
      }));
      const eligible = results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
      if (!cancelled) {
        setIdentities(eligible);
        const failed = results.filter((result) => result.status === 'rejected');
        if (failed.length) {
          console.warn('[social-identity] some identity details failed to load', failed);
          setError('Some identities could not be loaded. Retry to load missing choices.');
        }
      }
      // Resolve eligible faces in batches through the shared feed resolver.
      // A face the reader can't read is absent — the row keeps its initial.
      if (eligible.length) {
        resolveFaceMedia(async (sql, scope, prepare) => (await getV3Client().query(sql, { groups: scope, prepare })).rows, GROUP_FACE_SQL, eligible.map((identity) => identity.id), 'group_id')
          .then((resolved) => {
            if (cancelled) return;
            console.log('[social-identity] identity faces resolved', { resolved: resolved.size });
            setFaces(resolved);
          });
      } else if (!cancelled) {
        setFaces(new Map());
      }
    }).catch((error) => {
      console.warn('[social-identity] identities failed to load', error);
      if (!cancelled) setError('Identities could not be loaded. Retry to load choices.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    input.current?.focus();
    function dismiss(event: MouseEvent | KeyboardEvent) {
      if (mobile && event instanceof KeyboardEvent && event.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input');
        if (controls?.length) {
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) {
        console.log('[social-identity] picker dismissed without applying');
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      cancelled = true;
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, [open, account, mobile, retry]);

  if (!token) return null;
  const name = selected ? identities.find((identity) => identity.id === selected)?.name || (selectedFace?.id === selected ? selectedFace.name : undefined) || selected.split('/').pop() : personalName || token.username;
  const choices = identities.filter((identity) => `${identity.name} ${identity.id}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id)) ||
      (recent.indexOf(a.id) < 0 ? 999 : recent.indexOf(a.id)) - (recent.indexOf(b.id) < 0 ? 999 : recent.indexOf(b.id)) || a.name.localeCompare(b.name));
  function choose(id?: string) {
    selectActingAuthor(id);
    const nextRecent = id ? [id, ...recent.filter((item) => item !== id)].slice(0, 8) : recent;
    setRecent(nextRecent);
    sessionStorage.setItem(preferenceKey, JSON.stringify({ pins, recent: nextRecent }));
    setOpen(false);
    trigger.current?.focus();
  }
  const navigationTrigger = <button ref={trigger} type="button" {...(!onViewProfile ? { 'aria-haspopup': 'dialog' as const, 'aria-expanded': open } : {})} onClick={() => {
      if (onViewProfile) return;
      if (!open) { setPending(selected); setQuery(''); }
      console.log('[social-identity] picker toggled', { open: !open }); setOpen(!open);
    }}
      className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-2 py-0 text-left hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-auto md:min-h-11 md:px-3 md:py-2" data-testid="acting-identity-trigger">
      <Avatar className="h-8 w-8">{selected ? selectedFace?.id === selected && selectedFace.avatarUrl && <AvatarImage src={selectedFace.avatarUrl} alt="" /> : personalAvatar && <AvatarImage src={personalAvatar} alt="" />}<AvatarFallback className="bg-brand-muted text-brand-300">{name?.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
      <span className="min-w-0"><span className="block whitespace-nowrap text-xs text-muted-foreground">Acting as</span><span className="block max-w-24 truncate text-sm font-medium md:max-w-32">{name}</span></span>
      <ChevronDown className="h-4 w-4 text-muted-foreground" />
    </button>;
  return <div ref={root} className="relative min-w-0 shrink-0" data-testid="acting-identity">
    {onViewProfile ? <DropdownMenu.Root open={profileOpen} modal={false} onOpenChange={next => { setProfileOpen(next); if (next) setOpen(false); console.log('[social-profile] profile menu toggled', { open: next }); }}>
      <DropdownMenu.Trigger asChild>{navigationTrigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content aria-label="Profile" aria-labelledby={undefined} data-replay-private data-testid="profile-entry-menu" side="bottom" align="start" sideOffset={8} collisionPadding={12}
          onCloseAutoFocus={event => { if (openingPicker.current) { event.preventDefault(); openingPicker.current = false; } }}
          className="z-[60] w-64 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover p-1 text-foreground shadow-lg outline-none">
          <DropdownMenu.Item data-testid="profile-menu-view" aria-label="View profile" onSelect={() => { console.log('[social-profile] view personal profile'); onViewProfile(); }} className="flex min-h-14 cursor-pointer items-center gap-3 rounded px-3 py-2 outline-none data-[highlighted]:bg-elevated">
            <Avatar className="h-8 w-8">{personalAvatar && <AvatarImage src={personalAvatar} alt="" />}<AvatarFallback className="bg-brand-muted text-brand-300">{(personalName || token.username).charAt(0).toUpperCase()}</AvatarFallback></Avatar>
            <span className="min-w-0"><span className="block text-sm font-semibold">View profile</span><span className="block truncate text-xs text-muted-foreground">{personalName || token.username}</span></span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item onSelect={() => { openingPicker.current = true; setPending(selected); setQuery(''); setOpen(true); console.log('[social-identity] explicit change requested'); }} className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm text-muted-foreground outline-none data-[highlighted]:bg-elevated data-[highlighted]:text-foreground"><Users className="h-4 w-4" />Change identity</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root> : navigationTrigger}
    {open && mountPanel(<section ref={panel} role="dialog" aria-modal={mobile} aria-label="Choose acting identity" className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-lg border border-border bg-popover p-4 shadow-lg [&_button]:min-h-11 [&_button]:min-w-11 md:absolute md:inset-x-auto md:bottom-auto md:top-full md:mt-2 md:w-80 md:rounded-lg" data-testid="acting-identity-panel">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Acting identity</h2><Button type="button" variant="ghost" size="icon" aria-label="Close identities" onClick={() => { console.log('[social-identity] picker closed without applying'); setOpen(false); trigger.current?.focus(); }}><X className="h-4 w-4" /></Button></div>
      <button type="button" aria-pressed={!pending} onClick={() => { setPending(undefined); console.log('[social-identity] personal choice previewed'); }} className="mb-3 flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring"><span className="flex min-w-0 flex-1 items-center gap-2"><Avatar className="h-8 w-8" aria-hidden="true">{personalAvatar && <AvatarImage src={personalAvatar} alt="" />}<AvatarFallback className="bg-brand-muted text-brand-300">{(personalName || token.username)?.charAt(0).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0"><span className="block truncate text-sm">{token.username}</span><span className="block text-xs text-muted-foreground">Personal identity</span></span></span>{!pending && <Check className="h-4 w-4 text-brand-300" />}</button>
      <label className="block text-xs text-muted-foreground" htmlFor={searchId}>Search eligible groups</label>
      <input ref={input} id={searchId} value={query} onChange={(event) => setQuery(event.target.value)} className="my-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      {loading && <div className="h-16 animate-pulse rounded-lg bg-muted" aria-label="Loading identities" />}
      {error && <div role="alert" className="py-3 text-sm text-danger"><p>{error}</p><Button variant="ghost" onClick={() => setRetry((value) => value + 1)}>Retry</Button></div>}
      {!loading && !error && !identities.length ? <div className="my-3 rounded-lg border border-border bg-elevated p-3">
        <p className="text-sm font-medium text-foreground">Create a new identity!</p>
        <p className="mt-1 text-xs text-muted-foreground">Create a group in My Groups to post as it. Your personal profile is always available.</p>
        {onCreateGroup && <Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={() => { setOpen(false); console.log('[social-identity] opening group creation entry'); onCreateGroup(); }}>Create a group</Button>}
      </div> : !loading && !error && !choices.length && <p className="py-3 text-sm text-muted-foreground">No eligible groups match. Your personal identity is always available.</p>}
      {choices.map((identity) => <div key={identity.id} className="flex items-center rounded-lg hover:bg-elevated">
        <button type="button" aria-pressed={pending === identity.id} onClick={() => { setPending(identity.id); console.log('[social-identity] group choice previewed'); }} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring"><Avatar className="h-8 w-8" aria-hidden="true">{faces.get(identity.id)?.avatar_url && <AvatarImage src={faces.get(identity.id)!.avatar_url!} alt="" />}<AvatarFallback className="bg-brand-muted text-brand-300">{identity.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="block truncate text-sm">{identity.name}</span><span className="block text-xs text-muted-foreground">{pins.includes(identity.id) ? 'Pinned' : recent.includes(identity.id) ? 'Recent' : 'Group'}</span></span>{pending === identity.id && <Check className="h-4 w-4 text-brand-300" />}</button>
        <Button variant="ghost" size="icon" aria-label={`${pins.includes(identity.id) ? 'Unpin' : 'Pin'} ${identity.name}`} aria-pressed={pins.includes(identity.id)} onClick={() => { const next = pins.includes(identity.id) ? pins.filter((id) => id !== identity.id) : [...pins, identity.id]; setPins(next); sessionStorage.setItem(preferenceKey, JSON.stringify({ pins: next, recent })); }}><Pin className="h-4 w-4" /></Button>
      </div>)}
      <div className="sticky bottom-0 border-t border-border bg-popover py-3">
        <p className="mb-2 text-sm" aria-live="polite">{pending === selected ? 'Choose an identity, then confirm.' : `Switch to ${identities.find((identity) => identity.id === pending)?.name || pending || token.username}?`}</p>
        <Button type="button" className="w-full" disabled={pending === selected || (!!pending && (loading || !identities.some((identity) => identity.id === pending)))} onClick={() => choose(pending)}>Use identity</Button>
      </div>
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">Posts, comments and reactions only. Messages, billing and administration remain personal. Each action checks current permissions.</p>
    </section>)}
  </div>;
}
