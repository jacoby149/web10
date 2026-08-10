import * as React from 'react';
import { ShieldCheck, Phone } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PhoneInput from '../CredentialPage/FormInputs/Phone';

function RecoveryContact({ I }: { I: Record<string, any> }) {
  const [phone, setPhone] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const hasPhone = I.v3?.readToken?.() && I.phone?.trim().length >= 7;

  const handleSave = () => {
    if (phone.trim().length < 7) {
      I.setStatus('Please enter a valid phone number.');
      return;
    }
    setSaving(true);
    I.setStatus('Saving recovery phone…');
    I.v3
      .setRecoveryPhone(phone.trim())
      .then(() => I.servicesLoad())
      .then(() => {
        I.setStatus('Recovery phone saved!');
        setSaving(false);
        setTimeout(() => I.setStatus(null), 2000);
      })
      .catch((e: any) => {
        I.setStatus(e.response?.data?.detail || 'Failed to save recovery phone.');
        setSaving(false);
      });
  };

  return (
    <Card data-testid="recovery-contact-section">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand" strokeWidth={1.5} />
          <CardTitle>Recovery Contact</CardTitle>
        </div>
        <CardDescription>
          Set a recovery phone so you can always get back into your account.
          Without one, losing your password means losing everything.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasPhone ? (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Phone className="h-4 w-4 text-success" strokeWidth={1.5} />
            <span>
              Recovery phone set:{' '}
              <span className="font-medium" data-testid="recovery-phone-display">
                {I.phone}
              </span>
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <PhoneInput I={I} value={phone} onChange={setPhone} />
            <div className="flex gap-2">
              <Button
                variant="brand"
                size="sm"
                data-testid="recovery-phone-save"
                onClick={handleSave}
                disabled={saving || phone.trim().length < 7}
              >
                {saving ? 'Saving…' : 'Save Recovery Phone'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Once A20's email recovery lands, you'll be able to set a recovery email here too.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RecoveryContact;