# Importance of the Knowledge Base

The knowledge base is the lynchpin. Every other signal in the pyramid — logs, tests, changelog — checks against it. It is the entry point in every debugging flow: the AI loads the knowledge base first, then everything else, then checks whether they align. If they don't, it repairs the knowledge base before touching code.

```
knowledge base ──┐
                  ├──→ AI reads all four ──→ aligned? ──→ PR
     code        ──┄┐
  changelog      ──┄┄┐
      logs        ──┄┄┘
```

Good data in, good data out. Wrong data in, and the AI converges faster to the wrong place.

## Why It Matters More Than the Rest

Logs tell the AI *what happened*. Tests tell it *whether it's right*. The knowledge base tells it *what "right" is*. Without it, logs and tests are just checking against a guess.

The knowledge base is the only signal that cannot be verified automatically. Intent has no higher oracle — there is no test that verifies the goal is the right goal. That is why the human is always in the loop for the knowledge base, and why the AI-assisted repair loop exists. The AI covers the surface area; the human supplies the judgment.

## The Stakes

A stale knowledge base is worse than no knowledge base. It misleads confidently. The AI will build the wrong thing *faster* because it has signal — just the wrong signal. A perfect test suite and dense logs on a wrong knowledge base is a descent toward the wrong target: efficient, fast, and headed in the wrong direction.

That is why the knowledge base must be 100% correct. Not "mostly right." Not "good enough." Correct. Because everything above it converges against it.

## The Double Purpose

The knowledge base is not just a debug aid. It is onboarding — a textual map of what the code is supposed to do and where everything lives. An LLM with no context is the exact metaphor for a new hire with no context; the only difference is the LLM onboards in seconds instead of weeks. It is a shareable resource you can send to people and pitch with, *and* the signal that makes the next debug cheap.

## Keeping It Right

The knowledge base drifts as the code changes. The AI-assisted repair loop is how you keep it current: the AI audits it against the code, the other docs, and the business plan + manifesto; returns a small batch of doubts; the human resolves them; the AI honestly checks whether they're resolved. Iterate to convergence. See `human-assisted-kb-repair.md` for the flow.

The maintenance cost is small compared to the debugging cost it prevents. A 10-minute repair loop is cheaper than a $125 debugging session. And it stops the bug from happening in the first place.