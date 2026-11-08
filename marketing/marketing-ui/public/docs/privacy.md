# Privacy Policy

Short version: web10 is a data-policy platform, not a privacy platform.
Your data is yours, the node can read it by design, and we track how the app
is used — never what you post.

This policy covers the web10 reference node and the web10-social app.
A self-hosted node sets its own terms; check the policy of the node you use.

## Your data is yours

- Everything you post lives in your own database collection. Apps are
  stateless frontends that hold a scoped, expiring token to read and write it.
- You can export your data at any time and take it anywhere. There is no
  lock-in.
- You control which apps can read or write each collection. Revoke any app
  any time.
- You can remove your media from the node at any time.

## The node is readable by design

The node can read your data — that is what makes discovery, search, and
auditability possible. Access is terms-controlled: the node's terms say
what a reader can do with your data.

There is no default end-to-end encryption, and the client is a PWA, not a
native app. If that trade isn't for you, run your own node — or pick a node
whose terms fit you.

## What we track

We use PostHog on the user-facing surfaces to improve the experience and measure
acquisition, signup and return activity. Opaque account identifiers link signed-in
usage across sessions; we do not send contacts, usernames or credentials to
PostHog. Campaign labels can travel between our marketing, social and login
surfaces. Anonymous visits are not proof of unique people.

Optional recordings mask text and inputs, remove DOM attributes and block media;
network bodies and console content are not recorded. Heatmaps contain interaction
coordinates, not your content. This deliberately reduces recording fidelity.

The marketing site also sends first-party usage and error reports to the
node, including page paths, referrers, browser information, actions, and
error details.

Content is never tracked: your posts, messages, and media are not in the
recordings, not in the events, not sold, and not fed to any ad machine.

## Ads

The node may run its own ads alongside your media only while it is hosted
on the node — see the [Terms of Service](/docs/terms) for the details.
The sponsors on a creator's content are otherwise the creator's.

## Contact

Copyright and takedown requests: [jacob@web10.app](mailto:jacob@web10.app)
(see the [Terms of Service](/docs/terms)).

Privacy questions: [jacob@web10.app](mailto:jacob@web10.app).
