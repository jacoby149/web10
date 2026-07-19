import { Lock } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

function ReTypePass({ I }: { I: Record<string, any> }) {
  return (
    <div className="mb-4">
      <Label htmlFor="retypepass" className="mb-1.5 block text-muted-foreground">
        Retype password
      </Label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
        />
        <Input
          id="retypepass"
          type="password"
          className="pl-9"
          placeholder="••••••••"
          autoComplete="new-password"
          data-testid="retype-password-input"
        />
      </div>
    </div>
  );
}

export default ReTypePass;
