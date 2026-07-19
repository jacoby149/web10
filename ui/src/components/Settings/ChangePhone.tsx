import Phone from '../CredentialPage/FormInputs/Phone';
import ConfirmationPass from '../CredentialPage/FormInputs/ConfirmationPass';
import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function ChangePhone({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(true);
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");

  return (
    <Card className="overflow-hidden" data-testid="change-phone-section">
      <button
        type="button"
        onClick={() => setHide(!hide)}
        aria-expanded={!hide}
        data-testid="change-phone-toggle"
        className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium text-foreground">Change Phone Number</span>
        {hide ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        )}
      </button>
      {!hide && (
        <div className="p-4">
          <div className="max-w-[300px] space-y-2">
            <Phone I={I} value={phone} onChange={setPhone} />
            <ConfirmationPass I={I} value={password} onChange={setPassword} />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2.5 border-warning text-warning hover:bg-warning/15"
            data-testid="change-phone-submit"
            onClick={() => I.changePhoneNumber(password, phone)}
          >
            Change Phone Number
          </Button>
        </div>
      )}
    </Card>
  );
}

export default ChangePhone;