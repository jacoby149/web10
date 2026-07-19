import { Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';

function ReTypeNewPass({ I, value, onChange }: { I: Record<string, any>, value?: string, onChange?: (val: string) => void }) {
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
      <Input
        id="retypepass"
        className="pl-9"
        type="password"
        placeholder="Retype New Password"
        aria-label="Retype new password"
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid="retype-new-password-input"
      />
    </div>
  );
}

export default ReTypeNewPass;