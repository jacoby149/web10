import { Briefcase, GraduationCap } from 'lucide-react';
import { CatalogInput } from '@/components/shared/CatalogInput';
import type { ProfileAffiliation, ProfileRecord } from '@/data/types';

type Field = 'workplace' | 'school';

export function ProfileAffiliationFields({ profile, onChange, disabled }: {
  profile: Partial<ProfileRecord>;
  onChange: (field: Field, value: ProfileAffiliation | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="max-w-md space-y-3" data-testid="profile-affiliation-fields">
      <CatalogInput kind="employers" label="Works at (optional)" placeholder="Search companies or type an employer"
        value={profile.workplace?.name ?? ''} disabled={disabled}
        onChange={(name, entry) => onChange('workplace', name ? { name, directoryId: entry?.id } : null)} />
      <CatalogInput kind="schools" label="Studied at (optional)" placeholder="Search colleges or type a school"
        value={profile.school?.name ?? ''} disabled={disabled}
        onChange={(name, entry) => onChange('school', name ? { name, directoryId: entry?.id } : null)} />
      <p className="text-xs text-muted-foreground">Anyone who can see your profile can see these details.</p>
      <p className="text-xs text-muted-foreground">School data: <a className="underline" href="https://ror.org/" target="_blank" rel="noreferrer">ROR</a> and <a className="underline" href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>.</p>
    </div>
  );
}

export function ProfileAffiliationRows({ profile }: { profile?: ProfileRecord | null }) {
  return (
    <>
      {profile?.workplace?.name && <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="profile-workplace">
        <Briefcase className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">Works at {profile.workplace.name}</span>
      </div>}
      {profile?.school?.name && <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="profile-school">
        <GraduationCap className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">Studied at {profile.school.name}</span>
      </div>}
    </>
  );
}
