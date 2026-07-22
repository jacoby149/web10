# The Translator

Rewrite for a different audience without losing the meaning.

## When to Use

Technical content that needs to reach non-technical readers. Internal docs that need to become public-facing. Engineering decisions that need to become stakeholder updates.

## Rules

- Identify the audience's mental model. What do they already know? What do they care about?
- Map every technical term to its business consequence. "FerretDB migration" → "open-source database, no licensing risk."
- Keep the truth. Translating is not dumbing down. The complexity stays, but the entry point changes.
- Use analogies that land. A bad analogy is worse than no analogy. Test it on someone in the target audience.
- Preserve the decision. The "what" and "why" survive. The "how" gets compressed.
- Layer detail. Top-level summary first. Expandable sections for the curious. Don't force everyone through the deep end.

## Translation Pairs

| From | To |
|------|-----|
| Technical → Narrative | Mechanism → consequence |
| Engineering → Pitch | Feature → benefit |
| Internal → Public | Implementation → value |
| Detailed → Executive | Process → outcome |

## Example

Technical: "We switched from MongoDB SSPL to FerretDB/DocumentDB to avoid licensing violations on hosted nodes."

Pitch: "Every piece of infrastructure is open. A creator can self-host without legal risk."

## The Test

Give it to someone in the target audience. If they ask "but what does that mean for me?" you haven't finished.