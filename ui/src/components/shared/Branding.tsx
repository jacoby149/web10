import { useState } from 'react';
import { useTheme } from '@/lib/theme';

interface BrandingProps {
  I: Record<string, any>;
  // sm = in-shell lockup (sidebar/topbar); lg = the auth-page hero mark.
  size?: 'sm' | 'lg';
  tagline?: boolean;
}

function Branding({ I, size = 'lg', tagline = true }: BrandingProps) {
  // Defaults are the canonical theme pair; a node may configure its own.
  // Custom artwork can be missing on a deploy — never show a broken
  // <img>. If it fails to load, drop it and let the wordmark carry the brand
  // (design.md §1: "no broken image icons").
  const { resolved } = useTheme();
  const logo = (resolved === 'light' ? I.config?.REACT_APP_LOGO_LIGHT : I.config?.REACT_APP_LOGO_DARK) || I.logo;
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const showLogo = logo && failedLogo !== logo;

  const large = size === 'lg';
  const markSize = large ? 'h-11 w-11' : 'h-8 w-8';
  const wordSize = large ? 'text-2xl' : 'text-lg';

  return (
    <div className={large ? 'flex flex-col items-center gap-3' : 'flex items-center gap-2.5'}>
      <div className="flex items-center gap-2.5">
        {showLogo && (
          <img
            className={`${markSize} object-contain`}
            src={logo}
            alt="web10"
            onError={() => setFailedLogo(logo)}
            data-testid="brand-logo"
          />
        )}
        <span className={`font-display font-semibold tracking-tight text-foreground ${wordSize}`}>
          web10
        </span>
      </div>
      {tagline && large && (
        <p className="text-sm text-muted-foreground">Own your data. Own your audience.</p>
      )}
    </div>
  );
}

export default Branding;
