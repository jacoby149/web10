# Terms of Service

**Who this is for:** anyone using a web10 node — the fans, the creators, the
people who run the nodes. The short version: **your data is yours, the node
is readable by design, and there's a real way to get infringing content
taken down.**

These are the terms for the reference node and the web10-social app. A node
you self-host sets its own terms on top of these — the protocol guarantees
the floor (your data is portable, your access is terms-controlled), and the
node decides the rest.

## Your data is yours

- Every record you create lives in **your** database collection, as
  `{service, body}`. Apps are stateless frontends that hold a **scoped,
  expiring token** to read and write it.
- You can **export** your data at any time and take it anywhere. There is no
  lock-in: the data outlives any app, and outlives the node if you leave.
- You control which apps can read or write each collection. Revoke any app
  any time.

## The node is readable by design

web10 is a data-policy platform, not a privacy platform. The node is
readable — that's what makes discovery, search, and auditability possible.
Access is **terms-controlled**: the node's terms say what a reader can do
with your data. There is no default end-to-end encryption, and the client is
a PWA, not a native app. If that trade isn't for you, run your own node —
or pick a node whose terms fit you.

## Telemetry

web10 tracks hard — GA4 + Hotjar on the user-facing surfaces — because it
competes with Meta and TikTok on user experience, and their UX is the output
of a decade of aggressive telemetry. The recording is **content-blind by
construction** (text blurred, images blocked), and GA4 events are
content-free by convention. **Content is never tracked** — posts, messages,
media are not in the recordings, not in the events, not sold, and not fed to
any ad machine. The only sponsors a fan sees are the creator's.

## Copyright & DMCA

If you believe content on a web10 node infringes your copyright, you can get
it taken down. web10 follows the **"Post-It Note" rule**: a simple, fast,
human takedown path.

1. **Email our designated agent** at **`copyright@web10.com`**.
2. Include a **link to the specific content**, your name, how to reach you,
   and a statement that you are the rights holder (or authorized to act on
   their behalf).
3. **We act fast.** A valid notice gets the content removed. Acting quickly
   on valid notices is what keeps a node protected while it's small.

You can also start this from inside the app: **Settings → About → Report
copyright** opens a pre-filled email to the designated agent with the
content's link already in the body.

A self-hosted node names its **own** designated agent in its own terms — the
address above is for the web10 reference node and web10-social.

## The line we won't cross

No shadow bans. No demonetization. No terms-of-service massacre waiting to
happen. Your audience is your list, your data is your data, and the only
sponsors you see are the creator's. The landlord owns the building service,
never the software — and never your data.

---

*The internal decision record for the data-policy model is D41; the telemetry
model is D56.*
