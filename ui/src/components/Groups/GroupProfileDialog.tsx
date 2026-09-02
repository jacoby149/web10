import React from 'react';
import { User, Globe, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { groupDisplayName } from '@/lib/group-utils';

const IDENTITY_SERVICE = 'web10-social-group-identity';

function GroupProfileDialog({ open, onOpenChange, group, I }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: any;
  I: Record<string, any>;
}) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [website, setWebsite] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setWebsite('');
      setTags([]);
      setTagInput('');
      setSaving(false);
      setLoading(true);
      I.v3?.read?.(IDENTITY_SERVICE, { groups: [group.group_id] })
        .then((docs: any[]) => {
          if (docs && docs.length > 0) {
            const body = docs[docs.length - 1]?.body || {};
            setName(body.name || '');
            setDescription(body.description || '');
            setWebsite(body.website || '');
            setTags(body.tags || []);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const handleSave = async () => {
    setSaving(true);
    try {
      await I.v3?.create?.(IDENTITY_SERVICE, {
        body: {
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          website: website.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        },
        groups: [group.group_id],
      });
      I.setStatus?.('Group profile saved');
      onOpenChange(false);
    } catch {
      I.setStatus?.('Failed to save group profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-brand" strokeWidth={1.5} />
            Profile — {groupDisplayName(group.group_id)}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-center text-muted-foreground">Loading profile…</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Display name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name"
                className="mt-1.5"
                aria-label="Group display name"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">About</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this group about?"
                className="mt-1.5 w-full min-h-[80px] rounded border border-border bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Group description"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Website</label>
              <div className="mt-1.5 flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  aria-label="Group website"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">Tags</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full border border-brand/10 bg-brand-muted/60 px-2.5 py-1 text-xs text-brand-300"
                  >
                    #{t}
                    <button type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}>
                      <X className="h-3 w-3" strokeWidth={1.5} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Add a tag…"
                  className="flex-1"
                  aria-label="Add tag"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>
                  <Tag className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                  Add
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="brand" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default GroupProfileDialog;
