# Licensing

**Who this is for:** anyone deciding whether to run, build on, or bet a
business on web10. The short version: **you can run this thing. Free. No
key, no cap, no fine print that changes the locks.**

## The one-paragraph version

web10 is licensed under the **Server Side Public License v1 (SSPL)** —
the same license MongoDB runs its database under. It is a strong,
well-known, commercially-proven license. It is **not** a paywall and it
is **not** a trap.

Here's the whole deal:

- **Run it.** Self-host a node on your own hardware, for yourself or for
  500,000 followers. Free. No license key, no activation, no metering
  that phones home, no "your trial is over."
- **Build on it.** Modify it, fork it, build apps on top of it. Free.
- **The one condition.** If you take web10, *modify* it, and offer that
  modified version to others **as a competing service**, you have to
  release your changes under the same license. That's it. That's the only
  string.

Running your own node — even a big, commercial one — does **not** trigger
that. You're *running* the software, not *reselling a modified version of
it as a service*. There's a difference, and it's the whole point.

## Why SSPL, and why that's a good thing

A lot of open platforms pick a license and treat it like a gotcha. We
didn't. We picked the license that a serious company — MongoDB — uses to
run a serious business on top of free software, and we kept it exactly as
is.

The reason is honest and unglamorous: **web10 wants to be a big company
someday.** We want to keep building this, keep the hosted nodes running,
keep the ads platform sharp, and be around in ten years. SSPL is what
makes that sustainable *without* closing the core.

The way it works: the software is free for everyone, forever. We make
our money on the **service** — hosting nodes for you, the ad platform,
enterprise support. SSPL just means that if someone wants to do *exactly
what we do* — run a modified web10 as a commercial service — they have to
open their work, the same way we do. It keeps the playing field level for
the people building the platform, and it costs you, the person running a
node, **nothing.**

It is, technically, "source-available" rather than OSI-certified open
source. That's a real distinction and we won't pretend otherwise. In
practice it means: the code is all there, you can read every line, you
can run and modify it, and the only obligation attaches to the narrow
case of reselling a modified version as a service. For the person running
a node or building an app, it behaves like the open software you expect.

## What you can and can't do

| You want to… | Can you? |
|---|---|
| Run a node for yourself or your community | **Yes, free.** No key, no cap. |
| Run a node for a big commercial audience | **Yes, free.** Running it isn't reselling it. |
| Modify it, fork it, build apps on it | **Yes, free.** |
| Sell your node's ads / subscriptions | **Yes.** That's your revenue, not a license issue. |
| Offer a *modified* web10 as a competing hosted service | Only if you release your changes under SSPL. |
| Close-source a modified web10 and sell it as a service | No — that's the one thing §13 exists to prevent. |

## The line we won't cross

We will never put a license key, a usage cap, or a "you need to upgrade"
gate on the **software.** The node is yours to run. Your users' data is
theirs to export and take anywhere, at every tier. The only thing that's
"paid" is the **service** we offer around the free software — hosting,
the ad platform, enterprise support. The landlord owns the building
service, never the software.

That's the whole philosophy in one sentence, and it's why the license
looks the way it does.

---

*The full license text is in [`LICENSE`](https://github.com/jacoby149/web10/blob/main/LICENSE)
(SSPL-1.0, verbatim). The internal decision record is D76.*
