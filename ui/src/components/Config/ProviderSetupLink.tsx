import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

// Provider destinations are fixed by the caller, never built from credentials.
export default function ProviderSetupLink({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
      data-testid={testId} data-provider-setup-link=""
      className="inline-flex min-h-11 items-center gap-2 rounded px-1 text-sm font-medium text-brand-300 underline-offset-4 hover:text-brand-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      {children}<ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function TwilioCredentialHelp() {
  return (
    <div className="space-y-1">
      <p className="text-xs leading-relaxed text-muted-foreground">Copy your Account SID and Auth Token from Twilio, then select or create a Verify service for its Service SID. These fields do not accept an API key SID/secret.</p>
      <div className="flex flex-col items-start">
        <ProviderSetupLink href="https://console.twilio.com/">Get Twilio Account SID &amp; Auth Token</ProviderSetupLink>
        <ProviderSetupLink href="https://console.twilio.com/us1/develop/verify/services">Get Twilio Verify Service SID</ProviderSetupLink>
      </div>
    </div>
  );
}
