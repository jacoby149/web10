import { User } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { usernameHelp } from '@/lib/usernameHelp';

function Username({ I, showHelp = true }: { I: Record<string, any>; showHelp?: boolean }) {
  return (
    <div className="mb-4">
      <Label htmlFor="username" className="mb-1.5 block text-muted-foreground">
        Username
      </Label>
      <div className="relative">
        <User
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
        />
          <Input
            id="username"
            name="username"
            className="h-12 pl-10 text-base"
            placeholder="yourname"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={showHelp ? 'username-help' : undefined}
            data-testid="username-input"
            onChange={(e) => I.setLoginUsername?.(e.target.value)}
          />
      </div>
      {showHelp && <p id="username-help" className="mt-2 text-xs leading-relaxed text-muted-foreground">{usernameHelp}</p>}
    </div>
  );
}

export default Username;
