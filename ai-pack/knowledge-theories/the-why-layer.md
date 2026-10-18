# The Why Layer

Every piece of the system exists for a reason. The knowledge base captures that reason so the "what" and "how" don't drift into feature accumulation.

## The Problem

Technical systems grow. APIs get endpoints. UIs get screens. Over time, no one remembers why a thing was built — only what it does. The result is bloat, conflicting features, and decisions made without understanding the original intent.

## The Theory

Every component needs a **why** that connects it back to the business. Not a vague mission statement. A concrete answer to: *What problem does this solve for whom, and what value does it create?*

The why layer sits above the technical details and below the business strategy. It's the bridge.

## How It Works

For each major piece of the system, answer:

1. **Why does it exist?** — The human or business problem it solves.
2. **Why this way?** — Why this approach, not another? What made this the right call?
3. **What value does it add?** — Revenue, trust, reach, control, speed — what does it actually deliver?

### Example: Why web10?

Legacy social media takes your audience, your data, your revenue share. Creators are tenants. web10 exists so creators own their distribution. The technical consequence: self-hostable nodes, portable data, creator-controlled terms.

### Example: Why contracts?

Without contracts, there's no enforceable agreement between a creator and a consumer. The business problem: trust. The technical consequence: signed terms records, scoped tokens, revocable access.

### Example: Why discovery?

A node that no one finds is a blog from 2003. The business problem: reach without surrendering control. The technical consequence: public posts index, cross-node search, schema registry for interoperability.

### Example: Why web10 marketing?

The product is invisible until someone understands it. The business problem: acquisition. The technical consequence: marketing-ui for the landing page, marketing-api for the exporter pipeline, docs for developers.

## When to Write a Why

- Before building something new — forces clarity before code
- When onboarding someone who asks "why do we have this?"
- When a feature feels disconnected from the rest of the system
- When making a trade-off and you need to remember what you're optimizing for

## When Not to

- Trivial utilities and internal helpers — the code is the why
- Experimental spikes — write the why if it graduates to production
- Bug fixes — the why is the bug report

## The Test

If you can't answer "why does this exist" in one sentence that a non-technical person understands, the why is missing or wrong.