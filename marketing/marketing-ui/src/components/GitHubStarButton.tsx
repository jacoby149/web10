import { Star } from 'lucide-react'
import { Button } from './ui/button'
import { useStars } from './GitHubStarsContext'
import { trackFunnel } from '../lib/analytics'

const REPO_URL = 'https://github.com/jacoby149/web10'

// lucide-react dropped its brand icons (there is no `Github`/`GitHub` export as
// of v1.x), so the GitHub mark is inlined here as a filled brand SVG. Uses
// `currentColor` so it inherits the button's text color like a lucide icon.
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  )
}

function GitHubStarButton({ className, onClose }: { className?: string; onClose?: () => void }) {
  const { stars, loading } = useStars()

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={() => { onClose?.(); trackFunnel('github_click'); window.open(REPO_URL, '_blank', 'noopener') }}
    >
      <GitHubIcon className="h-3.5 w-3.5" />
      <Star className="h-3.5 w-3.5" strokeWidth={1.75} />
      {loading ? (
        <span className="w-5 h-3 rounded-sm bg-muted animate-pulse" />
      ) : stars != null ? (
        <span>{stars >= 1000 ? `${(stars / 1000).toFixed(1).replace(/\.0$/, '')}k` : stars}</span>
      ) : (
        'Star'
      )}
    </Button>
  )
}

export default GitHubStarButton