import { Globe } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

function Provider({ I }: { I: Record<string, any> }) {
  return (
    <div className="mb-4">
      <Label htmlFor="provider" className="mb-1.5 block text-muted-foreground">
        web10 provider
      </Label>
      <div className="relative">
        <Globe
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
        />
        <Input
          id="provider"
          className="pl-9"
          defaultValue={I.config.REACT_APP_DEFAULT_API}
          placeholder="provider.web10.app"
          data-testid="provider-input"
        />
      </div>
    </div>
  );
}

export default Provider;
