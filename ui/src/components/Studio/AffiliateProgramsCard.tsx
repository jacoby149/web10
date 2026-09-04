import React from 'react';
import { GraduationCap, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AFFILIATE_PROGRAMS, type AffiliateProgram } from './studio-data';

interface AffiliateProgramsCardProps {
  I: Record<string, any>;
  onStatus: (msg: string) => void;
}

/**
 * The monetization bootcamp, factored into the Studio: the "get started"
 * card that points a creator toward the affiliate programs worth joining.
 * Each row is a program + its sign-up page (external, new tab). This is the
 * "point people toward the programs" surface; the full guide is
 * knowledge/knowledge-base/web10-v3/social/monetization-bootcamp.md.
 */
export function AffiliateProgramsCard({ I, onStatus }: AffiliateProgramsCardProps) {
  return (
    <div className="rounded border border-border bg-card p-5 transition-colors hover:border-brand/50" data-testid="studio-affiliate-programs-card">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-elevated text-muted-foreground">
          <GraduationCap className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-medium text-foreground">Affiliate Programs</h3>
            <Badge variant="brand">START HERE</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign up for the programs that match what you post — then make your first ad in the Ads card. The link pays you; web10 just delivers it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">No audience minimum</Badge>
            <Badge variant="outline">You keep 100%</Badge>
            <Badge variant="outline">Pays you, not the node</Badge>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {AFFILIATE_PROGRAMS.map(program => (
          <ProgramRow key={program.name} program={program} />
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Rates and cookie windows shift — confirm on the program&apos;s page before you pitch a brand off them.
      </p>
    </div>
  );
}

function ProgramRow({ program }: { program: AffiliateProgram }) {
  return (
    <a
      href={program.signupUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex items-start justify-between gap-3 rounded border border-border bg-elevated/40 p-3 transition-colors',
        'hover:border-brand/60 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      data-testid={`affiliate-program-${program.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      aria-label={`Sign up for ${program.name}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{program.name}</span>
          <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-brand-300" strokeWidth={1.75} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{program.niche}</p>
        <p className="mt-1 text-xs tabular-nums text-foreground">{program.commission}</p>
        <p className="mt-1 text-xs text-muted-foreground">{program.why}</p>
      </div>
    </a>
  );
}
