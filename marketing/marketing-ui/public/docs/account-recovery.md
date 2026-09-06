# Account Recovery

**Who this is for:** you — a web10 user who forgot a password, switched
phones, or wants to add a backup way in.

## The idea: your account is anchored to a contact

A **contact** is a phone number or an email address on your account. It's
verified with a 6-digit code, and once it's on your account, it's a front
door: **enter contact → get code → pick your account → you're in.**

One contact can carry several usernames. If you have two accounts on the same
email, the code step shows you both and you pick which one you want.

## Sign in with your phone or email

1. On the sign-in screen, choose **phone or email** instead of username +
   password.
2. Enter the number or address on your account.
3. Check your texts (or inbox) for the 6-digit code and enter it.
4. Pick your account from the list — or type a **new username** to create an
   account on that contact.
5. You're signed in.

This works whether you remember your password or not. That's the point.

## Reset a forgotten password

Same flow — there is no separate "forgot password" maze:

1. Sign in with your phone or email (the steps above).
2. Pick the account you want.
3. When you're in, set a **new password** from your account settings. No old
   password required — your verified contact *is* the proof it's you.

## Create an account with a contact

On nodes that require a contact (web10.app does), the contact flow **is** the
sign-up:

1. Enter your phone or email, get the code, enter it.
2. No account on that contact yet? Type the username you want.
3. Done — the account is created with your verified contact attached.

## Add a contact to an existing account

If your account was created before you had a phone or email on it, add one:

1. Sign in the classic way (username + password).
2. In your account settings, add your **phone** or **email**.
3. Confirm the 6-digit code it sends you.

Now you have the fast, passwordless front door — and a way back in if you
ever forget the password.

## What if your account has no contact?

Username + password still works — it's the fallback, and it always will. But
add a contact when you can: it's the difference between "I'm locked out
forever" and "give me 30 seconds."

## Safety notes

- The code is short-lived — a code from an hour ago is useless.
- Someone who has your phone or inbox **and** knows your username can get in.
  If that happens, the fix is the same flow: take back the contact, set a new
  password.
- A contact is a convenience and a proof of reachability — it's not a secret
  you're guarding, it's a door you're owning.
