import { Search, Users } from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import { GroupCard } from '@/components/GroupCard'

const PAGE_SIZE = 50

function nodeApi(): string {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('api')
    if (q) return q
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return 'http://api.localhost'
  }
  return (import.meta as any).env?.VITE_API_URL || 'https://api.web10.app'
}

interface DirectoryGroup {
  group_id: string
  name: string
  owner: string
  slug: string
  join_policy: string
  member_count: number
  tags: string[]
}

function GroupDirectory() {
  const [groups, setGroups] = useState<DirectoryGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`${nodeApi()}/v3/groups/directory`, {
      method: 'GET',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (alive) setGroups(Array.isArray(data.groups) ? data.groups : [])
      })
      .catch(() => { /* directory renders empty on failure */ })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // The set of tags across the directory — for the topic filter chips.
  const allTags = useMemo(() => {
    const seen = new Set<string>()
    for (const g of groups) for (const t of g.tags) seen.add(t)
    return Array.from(seen).sort()
  }, [groups])

  const filtered = useMemo(
    () =>
      groups.filter((g) => {
        const q = searchQuery.toLowerCase()
        const matchesQuery =
          !q || g.name.toLowerCase().includes(q) || g.owner.toLowerCase().includes(q) || g.slug.toLowerCase().includes(q)
        const matchesTag = !activeTag || g.tags.includes(activeTag)
        return matchesQuery && matchesTag
      }),
    [groups, searchQuery, activeTag],
  )

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="reveal text-center">
          <span className="inline-flex items-center rounded-full bg-brand-muted px-2.5 py-0.5 text-[0.75rem] font-medium uppercase tracking-wide text-brand-300">
            The web10 Group Directory
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Communities on a node you can read.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Groups that chose to be listed — browse them, read what&rsquo;s public, join the ones that fit.
          </p>
        </div>

        {/* Search + topic filter */}
        <div className="reveal mt-12" data-testid="directory-browse">
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search groups…"
              className="w-full rounded-full border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors duration-150 focus:border-brand"
              data-testid="directory-search"
            />
          </div>

          {allTags.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2" data-testid="directory-tags">
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                    activeTag === t
                      ? 'border-brand bg-brand-muted text-brand-300'
                      : 'border-border bg-surface text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`directory-tag-${t}`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <GroupCard
                    key={`skeleton-${i}`}
                    skeleton
                    groupId=""
                    name=""
                    owner=""
                    joinPolicy=""
                    memberCount={0}
                    tags={[]}
                    data-testid={`directory-card-skeleton-${i}`}
                  />
                ))
              : filtered.map((g, i) => (
                  <GroupCard
                    key={g.group_id}
                    groupId={g.group_id}
                    name={g.name}
                    owner={g.owner}
                    joinPolicy={g.join_policy}
                    memberCount={g.member_count}
                    tags={g.tags}
                    data-testid={`directory-card-${i}`}
                  />
                ))}
          </div>

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center" data-testid="directory-empty">
              <Users className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-muted-foreground">
                {searchQuery || activeTag
                  ? `No groups match${searchQuery ? ` “${searchQuery}”` : ''}${activeTag ? ` #${activeTag}` : ''}.`
                  : 'No groups are listed yet.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GroupDirectory
