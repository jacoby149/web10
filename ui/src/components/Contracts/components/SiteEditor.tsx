import React from 'react';
import { CirclePlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function SiteEditor({ contractI }: { contractI: Record<string, any> }) {
  const [value, setValue] = React.useState("");
  const addSite = () => {
    if (value !== "") {
      contractI.addSite(value);
      setValue("");
    }
  };
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addSite()}
        className="w-[160px]"
        placeholder="website.com"
        aria-label="Add a website or IP"
        data-testid="site-editor-input"
      />
      <Button variant="ghost" size="sm" onClick={addSite} data-testid="site-editor-add">
        <CirclePlus className="mr-1.5 h-4 w-4 text-brand-300" strokeWidth={1.5} />
        Add
      </Button>
    </div>
  );
}

export default SiteEditor;