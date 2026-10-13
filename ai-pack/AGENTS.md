# AGENTS.md — How to Use This Knowledge Base

This file is for AI agents writing or editing docs in this repo. Read it before producing any documentation.

## The Workflow

Whether you are writing something new or rewriting something that's a miss, the process is the same:

### 1. Pick a Knowledge Theory

Go to [knowledge-theories](./knowledge-theories/) and choose the framework that fits what you're documenting:

- **The Why Layer** — connecting technical decisions to business value
- **The How Layer** — comprehensive technical explanation (crypto, protocols, architecture)
- **The What Layer** — the map (where things live, deploy targets, ownership)

### 2. Pick a Writing Style

Go to [writing-styles](./writing-styles/) and choose the structure and voice:

- **Use-Case-Driven** — abstract goal → specific scenario → technical how → logistics & timeline

### 3. Pick a Voice

Go to [voices](./voices/) and choose a voice so the writing doesn't sound like AI:

- **Clive Tobacco Smoker** — respectable gentleman, fine tobacco, merry-making satire

### 4. Visual Styles (if making a chart)

Go to [visual-styles](./visual-styles/) and pick a style for Mermaid diagrams. Also re-check which knowledge theory is most relevant — the theory determines what the chart is trying to show.

### 5. Write

Start from a blank file. Apply the chosen theory, style, and voice. If rewriting, do not carry forward old text — write fresh. If the old doc was a grab-bag of topics, split it into focused docs.

## Editing vs Rewriting

| The doc is... | Use... |
|---|---|
| Mostly right, but has a factual error or inconsistency | [The Touch-Up](./editing-styles/the-touch-up.md) |
| Fundamentally misaligned, wrong goal, or contradicts itself | [The Rewrite](./editing-styles/the-rewrite.md) (follow the workflow above) |

## Rules

- One topic per doc. A grab-bag doc is a miss — split it.
- A doc that misleads is worse than no doc. Delete bad docs rather than patching them.
- The touch-up is surgical. Fix the error, stop. Don't start reworking surrounding text.
- Always pick a voice. Unvoiced writing defaults to AI-sounding prose.