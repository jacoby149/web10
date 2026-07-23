import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { remark } from 'remark'
import remarkHtml from 'remark-html'
import { FileText, Code, Terminal, ExternalLink, Compass } from 'lucide-react'
import { trackFunnel } from '../lib/analytics'

const DOC_PAGES = [
  { slug: 'overview', title: 'Overview', file: '/docs/overview.md' },
  { slug: 'protocol-spec', title: 'Protocol Spec', file: '/docs/protocol-spec.md' },
  { slug: 'conventions', title: 'Conventions', file: '/docs/conventions.md' },
  { slug: 'sdk', title: 'SDK Guide', file: '/docs/sdk.md' },
  { slug: 'cli-quickstart', title: 'CLI Quickstart', file: '/docs/cli-quickstart.md' },
]

const DEMO_APPS = [
  { slug: 'hello', title: 'Hello', url: '/docs/hello/index.html' },
  { slug: 'notes', title: 'Notes', url: '/docs/notes/index.html' },
  { slug: 'messages', title: 'Messages', url: '/docs/messages/index.html' },
]

function DocsSidebar() {
  const location = useLocation()
  // /docs (no sub-page) is the Overview landing — mark it active there too
  const rawPage = location.pathname.replace(/^\/docs\/?/, '')
  const currentPage = rawPage === '' ? 'overview' : rawPage.split('/')[0]

  return (
    <aside className="w-full shrink-0 border-b border-border px-4 py-6 sm:px-6 md:w-56 md:border-b-0 md:border-r md:py-10">
      <h3 className="mb-3 text-[0.75rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
        Documentation
      </h3>
      <nav className="mb-6 flex flex-col gap-1">
        {DOC_PAGES.map(page => {
          const Icon = page.slug === 'overview' ? Compass : FileText
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
          .use(remarkHtml)
          .process(md)
          .then(result => {
            setContent(String(result.value))
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