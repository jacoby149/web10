import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// Password field with a show/hide toggle — the eye lets the user eyeball
// the value (e.g. check the signup password and its retype actually match).
function PasswordInput({
  id,
  label,
  autoComplete,
  testId,
}: {
  id: string;
  label: string;
  autoComplete: string;
  testId: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="mb-4">
      <Label htmlFor={id} className="mb-1.5 block text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
        />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          className="pl-9 pr-9"
          placeholder="••••••••"
          autoComplete={autoComplete}
          data-testid={testId}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          data-testid={`${testId}-toggle`}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setVisible(v => !v)}
        >
          {visible ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
        </button>
      </div>
    </div>
  );
}

export default PasswordInput;
