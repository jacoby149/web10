import ConfirmationPass from '../CredentialPage/FormInputs/ConfirmationPass';
import NewPassword from './FormInputs/NewPassword';
import ReTypeNewPass from './FormInputs/ReTypeNewPass';
import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function ChangePass({ I }: { I: Record<string, any> }) {
  const [hide, setHide] = React.useState(true);
  const [newPass, setNewPass] = React.useState("");
  const [retypeNewPass, setRetypeNewPass] = React.useState("");
  const [currentPass, setCurrentPass] = React.useState("");

  return (
    <Card className="overflow-hidden" data-testid="change-password-section">
      <button
        type="button"
        onClick={() => setHide(!hide)}
        aria-expanded={!hide}
        data-testid="change-password-toggle"
        className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium text-foreground">Change Password</span>
        {hide ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        )}
      </button>
      {!hide && (
        <div className="p-4">
          <div className="max-w-[300px] space-y-2">
            <NewPassword I={I} value={newPass} onChange={setNewPass} />
            <ReTypeNewPass I={I} value={retypeNewPass} onChange={setRetypeNewPass} />
            <ConfirmationPass I={I} value={currentPass} onChange={setCurrentPass} />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2.5 border-warning text-warning hover:bg-warning/15"
            data-testid="change-password-submit"
            onClick={() => I.changePassword(currentPass, newPass, retypeNewPass)}
          >
            Change Password
          </Button>
        </div>
      )}
    </Card>
  );
}

export default ChangePass;