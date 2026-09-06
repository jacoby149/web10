# Node Config

**Who this is for:** you — a node operator. This is what the admin account
can actually touch: the node's identity, its admins, its signup policy, and
its integrations.

## What the config is

The node's operator configuration is a single document, stored in the
node's own database (one store, like everything else on a v3 node). It
holds:

| Setting | What it does |
|---|---|
| **Admins** | The usernames allowed to read/write node config — the admin panel gate |
| **Provider** | The node's API identity — baked into every token, derived into every group id |
| **Signup gates** | Require a beta code / a verified phone / a subscription |
| **Authenticator hosts** | Which hosts are allowed to mint tokens (your auth UI) |
| **Integration credentials** | Media storage (S3/MinIO), SMS/email verification, billing |

The admin panel shows the **effective config** — what the node actually
runs — so a fresh node's panel shows its live values instead of blanks.
The one thing it never shows is the JWT signing key.

## Admin-ness: a list, not a badge

Being an admin is **not a user attribute** — the users table has no admin
flag. Admin-ness is node-global config:

```
is_admin(username) = username ∈ (baseline admins ∪ your configured admins)
```

- The **baseline** is a built-in list (env-overridable) that's always
  included, even before setup saves a list. This is the lockout-proof: a
  fresh node is operable from the first boot, and a misconfigured admins
  list can't brick the node.
- **Your configured admins** are set by the setup wizard (the admin
  account you created) and take the union from there on.

Two things this means in practice:

- **Owning your own collection is not admin.** On a shared node, every
  user owns a collection — that must not unlock the Stripe keys and the
  CORS settings.
- **Adding an admin is a config change**, made by an admin, in the admin
  panel. There's no self-elevation path.

Every admin endpoint enforces the same gate: your token is verified, its
provider matches this node, and your username is in the union. The
"am I admin?" check the panel uses **never errors** — if the config can't
be read, the answer is "no," not a 500 that hides the panel.

## The signup gates (access policy)

The setup wizard's **Access Policy** step is the node's front-door policy —
node policy, not a platform hardcode. Each gate is independent:

- **Require a beta code** — signups need a valid code (you set it). A
  closed beta.
- **Require a phone number** — signups must carry a phone (or email) that's
  verified with a code. This is the "everyone legit" gate: a real,
  reachable person behind the account. web10.app runs it on.
- **Require a subscription** — signups must be paying (with free
  credits/space allowances if you set them).

All off = an open node: anyone can sign up. The contact gate is what makes
[account recovery](/docs/account-recovery) work for your users — an
account without a contact can only ever be reached by its password.

## What the admin can touch

The admin panel (the authenticator, for admins) is the node's control
surface:

- **Node config** — the settings above: provider, admins, the signup
  gates, the authenticator hosts, the integrations.
- **The app store** — review, approve, and reject the apps that register on
  your node (see [App Store](/docs/app-store)).
- **Board moderation** — hide content from the public board. The board has
  no moderator role, so the node admin is how it gets kept civil. Hiding is
  board-level: the author's own copy is untouched, and it's restorable.

## What the admin can't touch

This is the part that makes web10 a platform instead of a walled garden:

- **Users' data.** The admin can moderate the public board, but a user's
  private content, their groups, their contracts — the admin's tools don't
  reach there beyond what the node's terms already say. The node is
  readable by design and the operator is liable for hosted data; that's the
  trade your users are making by choosing your node.
- **The protocol.** There's no admin override of the permission model, no
  backdoor into a user's collection, no "make this app approved without
  asking." The admin is an operator, not a god-mode.

## Where it lives

- **Local node:** the setup wizard at `http://auth.localhost` (first boot),
  then the Node Config section of the authenticator as an admin.
- **Production:** the same surface, on your auth vhost
  (`https://auth.{zone}`). The config lives in the node's database volume —
  backing up that volume is backing up your node's identity.

Next: [App Store](/docs/app-store) — the other thing your admin account
runs day to day.
