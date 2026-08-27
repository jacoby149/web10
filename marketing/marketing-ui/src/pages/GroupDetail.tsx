import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, Lock, LockOpen, Shield, MessageSquareLock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SOCIAL_ORIGIN } from '@/lib/origins'

function nodeApi(): string {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('api')
    if (q) return q
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return 'http://api.localhost'
  }
  return (import.meta as any).env?.VITE_API_URL || 'https://api.web10.app'
}

interface GroupPost {
  doc_id: string
  author_key: string
  body: { text?: string }
  created_at: string
}

interface GroupDetailData {
  group_id: string
  name: string
  owner: string
  slug: string
  join_policy: string
  discoverable: boolean
  member_count: number
  permission_summary: string
  description: string
  avatar_ref: string
  website: string
  tags: string[]
  is_member: boolean
  posts_state: 'ok' | 'join_to_view'
  posts: GroupPost[]
}

function joinPolicyBadge(policy: string) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide'
  switch (policy) {
    case 'open':
      return <span className={cn(base, 'bg-success/15 text-success')}><LockOpen className="h-3.5 w-3.5" strokeWidth={1.5} /> Open</span>
    case 'request':
      return <span className={cn(base, 'bg-warning/15 text-warning')}><Shield className="h-3.5 w-3.5" strokeWidth={1.5} /> Request</span>
    case 'invite_only':
      return <span className={cn(base, 'bg-danger/15 text-danger')}><Lock className="h-3.5 w-3.5" strokeWidth={1.5} /> Invite</span>
    default:
      return <span className={cn(base, 'bg-elevated text-muted-foreground')}>{policy}</span>
  }
}

function authorName(authorKey: string): string {
  // author_key is like "web10.app/users/alice" or "web10.app/users/users/alice" —
  // the last path segment is the username.
  const parts = authorKey.split('/')
  return parts[parts.length - 1] || authorKey
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const groupId = id ? decodeURIComponent(id) : ''

  const [group, setGroup] = useState<GroupDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`${nodeApi()}/v3/groups/detail?group_id=${encodeURIComponent(groupId)}`)
      .then((r) => {
        if (r.status === 404) throw new Error('not found')
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((data) => alive && setGroup(data))
      .catch((err) => {
        if (alive && err.message === 'not found') setNotFound(true)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [groupId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <Link to="/groups" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground" data-testid="back-to-directory">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            Back to Directory
          </Link>
          <div className="mt-8 flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            <div className="h-24 w-24 animate-pulse rounded-2xl bg-elevated" />
            <div className="flex flex-1 flex-col gap-3">
              <div className="h-7 w-48 animate-pulse rounded bg-elevated" />
              <div className="h-4 w-64 animate-pulse rounded bg-elevated" />
            </div>
          </div>
          <div className="mt-12 h-40 animate-pulse rounded-2xl bg-elevated" />
        </div>
      </div>
    )
  }

  if (notFound || !group) {
    return (
      <div className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Link to="/groups" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground" data-testid="back-to-directory">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            Back to Directory
          </Link>
          <div className="mt-12 flex flex-col items-center gap-4">
            <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground">Group not found</h1>
            <p className="max-w-xs text-muted-foreground">This group may have been removed or the link is outdated.</p>
            <Link to="/groups" className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors duration-150 ease-out hover:bg-brand-600">
              Browse Directory
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <Link to="/groups" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground" data-testid="back-to-directory">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back to Directory
        </Link>

        {/* Header */}
        <div className="mt-8 flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left sm:gap-8">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-elevated">
            {group.avatar_ref ? (
              <img src={group.avatar_ref} alt={group.name} className="h-full w-full object-cover" />
            ) : null}
            <div
              data-fallback="true"
              className={cn('absolute inset-0 flex items-center justify-center text-4xl font-semibold text-muted-foreground', group.avatar_ref ? 'hidden' : '')}
            >
              {group.name.charAt(0).toUpperCase()}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl" data-testid="group-detail-name">
              {group.name}
            </h1>
            <span className="text-sm text-muted-foreground">@{group.owner}</span>
            {group.description ? (
              <p className="text-muted-foreground" data-testid="group-detail-description">{group.description}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {joinPolicyBadge(group.join_policy)}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
                {group.member_count.toLocaleString()} members
              </span>
            </div>
            {group.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5" data-testid="group-detail-tags">
                {group.tags.map((t) => (
                  <span key={t} className="rounded-full bg-elevated px-2.5 py-0.5 text-xs font-medium text-muted-foreground">#{t}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Posts — gated by the reader's membership (I3) */}
        <div className="mt-12" data-testid="group-detail-posts">
          <h2 className="mb-4 font-display text-lg font-medium text-foreground">Posts</h2>

          {group.posts_state === 'ok' ? (
            group.posts.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {group.posts.map((p) => (
                  <li key={p.doc_id} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">@{authorName(p.author_key)}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{formatDate(p.created_at)}</span>
                    </div>
                    {p.body?.text ? (
                      <p className="mt-2 text-sm leading-relaxed text-foreground">{p.body.text}</p>
                    ) : (
                      <p className="mt-2 text-sm italic text-muted-foreground">(media post)</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted-foreground">
                No posts yet.
              </p>
            )
          ) : (
            /* join_to_view — the group is findable, its content is gated */
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-surface p-8 text-center" data-testid="join-to-view">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-elevated">
                <MessageSquareLock className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-medium text-foreground">Join to view posts</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  This group&rsquo;s posts are for members. Sign in and join to see what&rsquo;s shared here.
                </p>
              </div>
              <a
                href={SOCIAL_ORIGIN}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors duration-150 ease-out hover:bg-brand-600"
                data-testid="join-group-button"
              >
                Open web10 social
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GroupDetail
