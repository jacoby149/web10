import { User } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

function Username({ I }: { I: Record<string, any> }) {
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
          className="pl-9"
          placeholder="yourname"
          autoComplete="username"
          data-testid="username-input"
        />
      </div>
    </div>
  );
}

export default Username;
