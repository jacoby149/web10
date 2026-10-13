# Use-Case-Driven Writing

Start broad, drill deep, end with what's next.

## Structure

### 1. Abstract Use Case

Begin with the human goal at the highest level. Who is the user? What do they want? Frame it as a story, not a feature list.

> User X wants to become an influencer and monetize from day one — like Spotify, but they keep control of their audience and revenue.

No jargon. No product names. Just the desire.

### 2. Specific Use Case

Narrow the lens. Give the user a real identity, real assets, real friction with the status quo.

> They are a musician. They have live music videos they want to post. They don't trust legacy social media — bad reputation, opaque reach, arbitrary demonetization. They want their own distribution where they set the terms.

Concrete enough that a reader sees themselves in it.

### 3. Technical How

Explain how the system makes it work. Backend mechanics, data flow, protocol. This is where the product becomes real.

> The musician's node stores their videos. Their terms record says who can access them and under what conditions. When a fan's app requests a video, the API checks the terms, validates the token, and serves the content. Revenue splits are handled by the metering layer...

Technical but grounded in the use case above, not abstract architecture.

### 4. Logistics

End with timelines, what's planned, what's in flight, what's deferred.

> The video posting flow ships in M0. Monetization wiring follows in M2. Federation (cross-node discovery) is deferred to M3.

Sets expectations. No overpromising.

## When to Use

- Product docs explaining a feature from the user's perspective
- Onboarding content for new contributors
- Architecture docs that need to stay grounded in real problems
- Any doc where "what does this actually do for someone?" matters

## Don't Use When

- Pure API reference (use technical style)
- Internal planning notes (use narrative style)
- External outreach or decks (use pitch style)