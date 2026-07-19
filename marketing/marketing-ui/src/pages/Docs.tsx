import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { remark } from 'remark'
import remarkHtml from 'remark-html'
import { FileText } from 'lucide-react'

const DOC_PAGES = [
  { slug: 'protocol-spec', title: 'Protocol Spec', file: '/docs/protocol-spec.md' },
  { slug: 'conventions', title: 'Conventions', file: '/docs/conventions.md' },
]

function DocsSidebar() {
  const location = useLocation()
  const currentPage = location.pathname.split('/').pop()

  return (
    <aside className="w-full shrink-0 border-b border-border px-4 py-6 sm:px-6 md:w-56 md:border-b-0 md:border-r md:py-10">
      <h3 className="mb-3 text-[0.75rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
        Documentation
      </h3>
      <nav className="flex flex-col gap-1">
        {DOC_PAGES.map(page => (
          <Link
            key={page.slug}
            to={`/docs/${page.slug}`}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150 ease-out ${
              currentPage === page.slug
                ? 'bg-brand-muted font-medium text-brand-300'
                : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
            }`}
          >
            <FileText className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {page.title}
          </Link>
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
    const doc = DOC_PAGES.find(p => p.slug === page)
    if (!doc) {
      setContent('<p>Select a document from the sidebar.</p>')
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
