# Importance of the Knowledge Base

[← back to README](./README.md)

## Why a Knowledge Base Exists

A knowledge base is a human-language description of what the code is supposed to do. Not what it *does* — what it's *supposed to do*. That distinction matters.

Code tells you what the machine does. A knowledge base tells you why.

## Onboarding Humans

Every company keeps a knowledge base for one reason: onboarding. A new hire walks in with no context. The knowledge base is the textual map — what the systems are, how they talk to each other, what decisions were made, where things live. Without it, the new hire reads code and guesses at intent. With it, they know what "right" looks like before they touch a line.

## Onboarding AI

Every AI agent wakes up with no memory. A fresh consciousness. No context from last session, no tribal knowledge, no "oh right, we did it that way because..." It reads the code and tries to infer the project's objectives from the code alone. But code is an imperfect record of intent — it carries the scars of old decisions, the residue of half-finished features, the compromises made under deadline. An AI reading slightly stale code can walk away with the wrong assumptions about what the project is trying to do.

A knowledge base onboards the AI the same way it onboards a human — but in seconds instead of weeks. The AI reads the knowledge base first, then the code, then checks whether they align. If they don't, it knows something is wrong before it writes a speculative fix.

## The Only Way to Detect Misalignment

Here's the thing you can't figure out without a knowledge base: **what if the objective of the code and the code itself are misaligned?**

The code says one thing. The intent says another. Maybe a feature was half-implemented. Maybe a refactor changed behavior nobody noticed. Maybe the business goal shifted and the code never caught up. Without a knowledge base, the AI sees the code and assumes the code is right. It reads the implementation and treats it as the specification. Then it builds on top of a wrong foundation, and everything above it converges to the wrong place.

A knowledge base is the specification. The code is the implementation. Comparing the two is the only way to see when they've diverged. And since the knowledge base is written in human language, a human can verify it in seconds — far faster than reading the code to extract intent. The knowledge base gives you the highest human verifiability that the AI is getting onboarded correctly.

## The Funnel

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

The knowledge base is not just a debug aid. It is onboarding — a textual map of what the code is supposed to do and where everything lives. It is a shareable resource you can send to people and pitch with, *and* the signal that makes the next debug cheap.

## Keeping It Right

The knowledge base drifts as the code changes. The AI-assisted repair loop is how you keep it current: the AI audits it against the code, the other docs, and the business plan + manifesto; returns a small batch of doubts; the human resolves them; the AI honestly checks whether they're resolved. Iterate to convergence. See `human-assisted-kb-repair.md` for the flow.

The maintenance cost is small compared to the debugging cost it prevents. A 10-minute repair loop is cheaper than a $125 debugging session. And it stops the bug from happening in the first place.