import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import { FileText, Code, Terminal, ExternalLink, Compass, BookOpen } from 'lucide-react'
import { trackFunnel } from '../lib/analytics'

type DocPage = { slug: string; title: string; file: string }

// The audience model (plan.md "Public Docs Overhaul"): each section answers
// "who is this for?" — the pitch, then one section per reader. Demo apps are
// their own section (they're the docs made runnable).
const DOC_SECTIONS: { title: string; pages: DocPage[] }[] = [
  {
    title: 'Overview',
    pages: [
      { slug: 'overview', title: 'Overview', file: '/docs/overview.md' },
    ],
  },
  {
    title: 'For Users',
    pages: [
      { slug: 'getting-started', title: 'Getting Started', file: '/docs/getting-started.md' },
      { slug: 'groups-in-plain-terms', title: 'Groups in Plain Terms', file: '/docs/groups-in-plain-terms.md' },
      { slug: 'your-data', title: 'Your Data', file: '/docs/your-data.md' },
      { slug: 'account-recovery', title: 'Account Recovery', file: '/docs/account-recovery.md' },
      { slug: 'import-from-other-platforms', title: 'Import from Other Platforms', file: '/docs/import-from-other-platforms.md' },
      { slug: 'export-guidance', title: 'Export Guidance', file: '/docs/export-guidance.md' },
    ],
  },
  {
    title: 'For Developers',
    pages: [
      { slug: 'protocol-spec', title: 'Protocol Spec', file: '/docs/protocol-spec.md' },
      { slug: 'conventions', title: 'Conventions', file: '/docs/conventions.md' },
      { slug: 'groups', title: 'Groups', file: '/docs/groups.md' },
      { slug: 'sdk', title: 'SDK Guide', file: '/docs/sdk.md' },
      { slug: 'query-engine', title: 'Query Engine', file: '/docs/query-engine.md' },
      { slug: 'app-contracts', title: 'App Contracts', file: '/docs/app-contracts.md' },
      { slug: 'media', title: 'Media', file: '/docs/media.md' },
      { slug: 'scaffolding', title: 'Scaffolding', file: '/docs/scaffolding.md' },
      { slug: 'cli-quickstart', title: 'CLI Quickstart', file: '/docs/cli-quickstart.md' },
    ],
  },
  {
    title: 'For Node Operators / Influencers',
    pages: [
      { slug: 'start-a-node', title: 'Start a Node', file: '/docs/start-a-node.md' },
      { slug: 'node-config', title: 'Node Config', file: '/docs/node-config.md' },
      { slug: 'app-store', title: 'App Store', file: '/docs/app-store.md' },
      { slug: 'your-audience', title: 'Your Audience', file: '/docs/your-audience.md' },
      { slug: 'being-a-creator', title: 'Being a Creator', file: '/docs/being-a-creator.md' },
    ],
  },
  {
    title: 'For Monetizers',
    pages: [
      { slug: 'ads', title: 'Ads', file: '/docs/ads.md' },
      { slug: 'ad-catalog', title: 'Ad Catalog', file: '/docs/ad-catalog.md' },
      { slug: 'affiliate-programs', title: 'Affiliate Programs', file: '/docs/affiliate-programs.md' },
      { slug: 'payment-rails', title: 'Payment Rails', file: '/docs/payment-rails.md' },
      { slug: 'monetization-bootcamp', title: 'Monetization Bootcamp', file: '/docs/monetization-bootcamp.md' },
    ],
  },
]

const DOC_PAGES = DOC_SECTIONS.flatMap(section => section.pages)

const DEMO_APPS = [
  { slug: 'hello', title: 'Hello', url: '/docs/hello/' },
  { slug: 'notes', title: 'Notes', url: '/docs/notes/' },
  { slug: 'query', title: 'Query', url: '/docs/query/' },
  { slug: 'messages', title: 'Messages', url: '/docs/messages/' },
  { slug: 'groups', title: 'Groups', url: '/docs/groups/' },
  { slug: 'media', title: 'Media (HLS)', url: '/docs/media/' },
  { slug: 'feed', title: 'Feed', url: '/docs/feed/' },
  { slug: 'sharing', title: 'Sharing', url: '/docs/sharing/' },
]

function DocsSidebar() {
  const location = useLocation()
  // /docs (no sub-page) is the Overview landing — mark it active there too
  const rawPage = location.pathname.replace(/^\/docs\/?/, '')
  const currentPage = rawPage === '' ? 'overview' : rawPage.split('/')[0]

  return (
    <aside className="w-full shrink-0 border-b border-border px-4 py-6 sm:px-6 md:w-56 md:border-b-0 md:border-r md:py-10">
      {DOC_SECTIONS.map(section => (
        <div key={section.title} className="mb-6">
          <h3 className="mb-3 text-[0.75rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
            {section.title}
          </h3>
          <nav className="flex flex-col gap-1">
            {section.pages.map(page => {
              const Icon = page.slug === 'overview' ? Compass : page.slug === 'export-guidance' ? BookOpen : FileText
              return (
                <Link
                  key={page.slug}
                  to={`/docs/${page.slug}`}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150 ease-out ${
                    currentPage === page.slug
                      ? 'bg-brand-muted font-medium text-brand-300'
                      : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  {page.title}
                </Link>
              )
            })}
          </nav>
        </div>
      ))}

      <h3 className="mb-3 text-[0.75rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
        Demo Apps
      </h3>
      <nav className="flex flex-col gap-1">
        {DEMO_APPS.map(app => (
          <a
            key={app.slug}
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150 ease-out ${
              currentPage === app.slug
                ? 'bg-brand-muted font-medium text-brand-300'
                : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
            }`}
          >
            <Code className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {app.title}
            <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-50" strokeWidth={1.5} />
          </a>
        ))}
      </nav>
    </aside>
  )
}

function DocsContent() {
  const { page } = useParams()
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('Documentation')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // /docs with no sub-page renders the Overview landing — never a blank
    const resolved = page ?? 'overview'
    const doc = DOC_PAGES.find(p => p.slug === resolved)
    if (!doc) {
      setContent('<p>Select a document from the sidebar, or try the <a href="/docs/overview" class="text-brand-300">Overview</a> to get started.</p>')
      setTitle('Documentation')
      return
    }

    setTitle(doc.title)
    setLoading(true)
    fetch(doc.file)
      .then(r => r.text())
      .then(md => {
        remark()
          .use(remarkGfm)
          .use(remarkHtml)
          .process(md)
          .then(result => {
            // Wrap tables in a scroll container so wide tables scroll
            // horizontally at 375px instead of breaking the layout.
            const html = String(result.value).replace(
              /<table>/g,
              '<div class="docs-table-scroll"><table>',
            ).replace(/<\/table>/g, '</table></div>')
            setContent(html)
            setLoading(false)
          })
          .catch(() => {
            setContent('<p>Failed to load document.</p>')
            setLoading(false)
          })
      })
      .catch(() => {
        setContent('<p>Failed to load document.</p>')
        setLoading(false)
      })
  }, [page])

  return (
    <div className="flex-1 px-4 py-10 sm:px-8 md:px-12">
      {loading ? (
        <div className="docs-prose animate-pulse">
          <div className="mb-4 h-8 w-2/3 rounded bg-elevated" />
          <div className="mb-2 h-4 w-full rounded bg-elevated" />
          <div className="mb-2 h-4 w-5/6 rounded bg-elevated" />
          <div className="h-4 w-3/4 rounded bg-elevated" />
        </div>
      ) : (
        <article className="docs-prose" aria-label={title} dangerouslySetInnerHTML={{ __html: content }} />
      )}
    </div>
  )
}

function Docs() {
  useEffect(() => {
    trackFunnel('docs_view')
  }, [])
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col md:flex-row">
        <DocsSidebar />
        <DocsContent />
      </div>
    </div>
  )
}

export default Docs