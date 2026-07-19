import VerificationInput from 'react-verification-input';
import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function VerifyPhone({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(true);
  const [code, setCode] = React.useState("");

  return (
    <Card className="overflow-hidden" data-testid="verify-phone-section">
      <button
        type="button"
        onClick={() => setHide(!hide)}
        aria-expanded={!hide}
        data-testid="verify-phone-toggle"
        className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium text-foreground">Verify Phone Number</span>
        {hide ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        )}
      </button>
      {!hide && (
        <div className="p-4">
          <div className="max-w-full sm:max-w-[600px]">
            <VerificationInput
              onChange={(val) => {
                setCode(val);
                I.verificationChange(val);
              }}
              classNames={{
                container: "container",
                character: "character",
                characterInactive: "character--inactive",
                characterSelected: "character--selected",
              }}
            />
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-warning text-warning hover:bg-warning/15"
              data-testid="verify-phone-send-code"
              onClick={() => I.sendCode()}
            >
              Send Code
            </Button>
            <Button
              variant="brand"
              size="sm"
              data-testid="verify-phone-verify-code"
              disabled={code.length !== 6}
              onClick={() => {
                if (code.length === 6) {
                  I.verifyCode(code);
                }
              }}
            >
              Verify Code
            </Button>
          </div>
          <p className="ml-0.5 mt-2.5 text-sm text-warning">
            Verify your phone number and receive free web10 credits
          </p>
        </div>
      )}
    </Card>
  );
}

export default VerifyPhone;