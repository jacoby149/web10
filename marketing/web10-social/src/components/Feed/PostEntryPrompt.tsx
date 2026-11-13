import { useContext } from 'react';
import { PenLine } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useComposer } from '@/context/ComposerContext';
import { PersonalProfileContext } from '@/context/PersonalProfileContext';
import { getWapi } from '@/data/wapi';
import { trackEvent } from '@/lib/analytics';

/** An invitation in the stream, not an editable field or a second composer. */
export default function PostEntryPrompt() {
  const profile = useContext(PersonalProfileContext);
  const { openComposer } = useComposer();
  const token = getWapi().readToken();
  if (!token) return null;
  return <div className="border-b border-border bg-card px-4 py-4" data-testid="post-entry-prompt">
    <button type="button" aria-label="Create a post" onClick={() => { trackEvent('new_post_open'); openComposer(); }} className="group flex min-h-12 w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">
      <Avatar className="h-11 w-11 shrink-0">{profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}<AvatarFallback className="bg-brand-muted text-brand-300">{(profile?.name || token.username).charAt(0).toUpperCase()}</AvatarFallback></Avatar>
      <span className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-full border border-border bg-elevated px-4 text-sm text-muted-foreground transition-colors group-hover:border-brand/30 group-hover:text-foreground">
        <span>Share something! :)</span><PenLine className="h-4 w-4 shrink-0" aria-hidden="true" />
      </span>
    </button>
  </div>;
}
