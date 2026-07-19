import { Lock } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

function ConfirmationPass({
  I,
  value,
  onChange,
}: {
  I: Record<string, any>;
  value?: string;
  onChange?: (val: string) => void;
}) {
  return (
    <div className="mb-4">
      <Label htmlFor="retypepass" className="mb-1.5 block text-muted-foreground">
        Confirm current password
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
          autoComplete="current-password"
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          data-testid="confirmation-password-input"
        />
      </div>
    </div>
  );
}

export default ConfirmationPass;
