import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { remark } from 'remark'
import remarkHtml from 'remark-html'

const DOC_PAGES = [
  { slug: 'protocol-spec', title: 'Protocol Spec', file: '/docs/protocol-spec.md' },
  { slug: 'conventions', title: 'Conventions', file: '/docs/conventions.md' },
]

function DocsSidebar() {
  const location = useLocation()
  const currentPage = location.pathname.split('/').pop()

  return (
    <aside style={{ width: '250px', flexShrink: 0, padding: '2rem 1rem', borderRight: '1px solid #eee' }}>
      <h3 className="title is-5">Documentation</h3>
      <nav>
        {DOC_PAGES.map(page => (
          <div key={page.slug} style={{ marginBottom: '0.5rem' }}>
            <Link
              to={`/docs/${page.slug}`}
              style={{
                color: currentPage === page.slug ? '#3273dc' : 'inherit',
                fontWeight: currentPage === page.slug ? 'bold' : 'normal',
                textDecoration: 'none',
              }}
            >
              {page.title}
            </Link>
          </div>
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
    <div style={{ flex: 1, padding: '2rem 3rem', maxWidth: '900px' }}>
      <h1 className="title">{title}</h1>
      {loading && <p>Loading...</p>}
      <article
        className="content"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  )
}

function Docs() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
      <div style={{ display: 'flex' }}>
        <DocsSidebar />
        <DocsContent />
      </div>
    </div>
  )
}

export default Docs
