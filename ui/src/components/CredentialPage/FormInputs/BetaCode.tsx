import { KeyRound } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

function BetaCode({ I }: { I: Record<string, any> }) {
  if (!I.config.REACT_APP_BETA_REQUIRED) return null;

  return (
    <div className="mb-4">
      <Label htmlFor="betacode" className="mb-1.5 block text-muted-foreground">
        Beta code
      </Label>
      <div className="relative">
        <KeyRound
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
        />
        <Input
          id="betacode"
          type="password"
          className="pl-9"
          placeholder="Your invite code"
          data-testid="betacode-input"
        />
      </div>
    </div>
  );
}

export default BetaCode;
