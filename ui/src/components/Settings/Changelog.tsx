import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitCommit, CalendarDays, Loader2 } from 'lucide-react';

interface ChangelogEntry {
  version: string;
  date: string;
  description: string;
}

function parseChangelog(raw: string): ChangelogEntry[] {
  const lines = raw.split('\n');
  const entries: ChangelogEntry[] = [];
  const headerRe = /^(\d+\.\d+(?:\.\d+)?)\s*\|\|\s*(\d{2}\.\d{2}\.\d{4})$/;

  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(headerRe);
    if (m) {
      const version = m[1];
      const date = m[2];
      const descLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(headerRe)) {
        if (lines[i].trim()) {
          descLines.push(lines[i]);
        }
        i++;
      }
      entries.push({ version, date, description: descLines.join(' ').trim() });
    } else {
      i++;
    }
  }
  return entries;
}

function Changelog() {
  const [entries, setEntries] = React.useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch('/CHANGELOG.md')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load changelog');
        return r.text();
      })
      .then(parseChangelog)
      .then(setEntries)
      .then(() => setLoading(false))
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" strokeWidth={1.5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Unable to load changelog.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.slice(0, 50).map((entry, idx) => (
        <Card key={`${entry.version}-${idx}`}>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                <GitCommit className="mr-1 h-3 w-3" strokeWidth={1.5} />
                v{entry.version}
              </Badge>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3" strokeWidth={1.5} />
                {entry.date}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              {entry.description}
            </p>
          </CardContent>
        </Card>
      ))}
      {entries.length > 50 && (
        <p className="text-center text-xs text-muted-foreground">
          Showing 50 of {entries.length} entries
        </p>
      )}
    </div>
  );
}

export default Changelog;