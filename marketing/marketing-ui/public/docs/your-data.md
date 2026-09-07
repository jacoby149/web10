# Your Data

**Who this is for:** you — a web10 user. This is the ownership story: what
you control, where the controls are, and what the platform can and can't do
with your stuff.

## The short version

Your data is yours. Not the node's, not the app's, not the platform's. Three
consequences:

1. **You decide who sees what** — every post goes where you point it.
2. **You can cut any app off** — one action, and a website can't touch your
   data anymore.
3. **You can take it with you** — your data is exportable and portable. No
   lock-in.

All the controls live in the **web10 authenticator** — the same small window
you sign in with. It's where you take charge.

## The kill switch

Every app that wants to read or write your data has to ask, and you approve
it in the authenticator. That approval is a **contract** — and you can break
it any time.

- **Revoke one app** — in the authenticator, open your apps/contracts, pick
  the app, revoke. It loses access immediately.
- **Revoke everything** — the kill switch. No website touches your data.
  Ever. Your posts stay on your node; they just stop being reachable by any
  app until you approve one again.

Apps can't sneak back in. If you revoked them, they have to ask you again —
and you'll see the request.

## Control who sees your content

- **Delete a post** — it's gone from every group it was in.
- **Leave a group** — you stop seeing it, and your posts stop going there.
- **Make a post private** — pull it out of the groups it's in; only you see
  it.
- **Make everything private** — one action removes all your content from all
  groups. Everything goes dark. Reversible.
- **Pause sharing with a group** — you stay in the group, you still see
  their content, but they can't see yours. Reversible, no drama.

## Block someone

Two levels, your choice:

- **Block them entirely** — they can't see any of your content, anywhere on
  the node.
- **Block them in one group** — you're still in the group together, they
  still see everyone else's content, just not yours. For the "I don't want
  to leave the chess club but I don't want Dave reading my posts" situation.

Blocking is one-directional: they can still see *their* content from you
unless you block them entirely. It's your view of the node that changes.

## Export your data

Your posts, your media, your followers list — **exportable**. The node export
(one click, your data as a file you keep) is on the way; until it ships, your
data is still fully portable in principle — it lives in plain, standard
formats on your node, and the export is a download, not a favor. If you run
your own node, your data is on your infrastructure, full stop.

Want to move your *old* platform's data **in**? See
[Import from Other Platforms](/docs/import-from-other-platforms).

## What the node can see (the honest part)

web10 nodes are **readable by design** — the node operator can read the data
they host. That's a deliberate trade, not an accident: it's what makes
discovery, search, and accountability work, and it's why the operator is
legally liable for the data they host. The access is **terms-controlled** —
the node's terms say what they can do with your data, and that's the
agreement you're making by using the node.

Two things that never change, regardless of the node's terms:

- **Apps can't see your data without your approval** (the contracts above).
- **You can always revoke, delete, or export** (the controls above).

If that trade isn't for you, run your own node — or pick a node whose terms
you actually like. The data is yours either way.

## Where to do all of this

The **authenticator** — the sign-in window:

- Your apps and contracts (revoke one, or all)
- The groups you manage (your audience, your members)
- The groups you're in (leave, pause sharing)
- Your account (password, phone, email — see
  [Account Recovery](/docs/account-recovery))
