import { useState } from 'react';
import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// Contact field (D61): phone OR email — the account anchor at registration.
// A single input; the node's `require_contact` config decides server-side
// whether a contact is required (the unauthenticated signup screen has no
// public config read, so it always offers both, like the D61 recovery flow).
// Uncontrolled like the other signup fields (the form reads the DOM value at
// submit); local state only tracks the value so inputMode can flip to email
// when it looks like an address.
function Contact({ I }: { I: Record<string, any> }) {
  const [value, setValue] = useState("");
  const isEmail = value.includes("@");

  return (
    <div className="mb-4">
      <Label htmlFor="contact" className="mb-1.5 block text-muted-foreground">
        Phone number or email
      </Label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            id="contact"
            type="text"
            inputMode={isEmail ? "email" : "tel"}
            autoComplete="off"
            placeholder="+1 555 123 4567 or you@example.com"
            onChange={(e) => {
              setValue(e.target.value);
              if (I.setContact) I.setContact(e.target.value);
            }}
            data-testid="contact-input"
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

export default Contact;
