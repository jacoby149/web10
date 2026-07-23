import { GitHub, Star } from 'lucide-react'
import { Button } from './ui/button'
import { useStars } from './GitHubStarsContext'
import { trackFunnel } from '../lib/analytics'

const REPO_URL = 'https://github.com/jacoby149/web10'

function GitHubStarButton({ className, onClose }: { className?: string; onClose?: () => void }) {
  const { stars, loading } = useStars()

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={() => { onClose?.(); trackFunnel('github_click'); window.open(REPO_URL, '_blank', 'noopener') }}
    >
      <Github className="h-3.5 w-3.5" strokeWidth={1.75} />
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