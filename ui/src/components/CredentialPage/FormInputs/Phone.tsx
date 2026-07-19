import PhoneInput from "react-phone-input-2";
import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';

function Phone({ I, value, onChange }: { I: Record<string, any>, value?: string, onChange?: (val: string) => void }) {
  if (!I.config.REACT_APP_VERIFY_REQUIRED) return null;

  return (
    <div className="mb-4">
      <Label htmlFor="phone" className="mb-1.5 block text-muted-foreground">
        Mobile number
      </Label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <PhoneInput
            inputProps={{ id: 'phone', 'data-testid': 'phone-input' }}
            country={"us"}
            enableSearch={true}
            inputClass="!h-9 !w-full !rounded-sm !border !border-input !bg-transparent !text-sm !shadow-sm"
            buttonClass="!rounded-l-sm !border !border-input !bg-transparent"
            preferredCountries={['us', 'il', 'jp']}
            value={value !== undefined ? value : I.phone}
            onChange={(val) => {
              if (onChange) onChange(val);
              else I.setPhone(val);
            }}
          />
        </div>
        <span
          className="inline-flex h-9 w-9 shrink-0 cursor-help items-center justify-center text-muted-foreground"
          title="web10 uses Twilio to authenticate users"
        >
          <Info className="h-4 w-4" strokeWidth={1.5} />
        </span>
      </div>
    </div>
  );
}

export default Phone;