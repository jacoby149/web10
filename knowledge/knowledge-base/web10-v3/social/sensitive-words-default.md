# Default Sensitive Words List

The shipped default for `node_config.sensitive_words`. These are **hate speech and slurs only** — not general profanity. The operator can add profanity or additional terms through the Node Config UI.

**Matching rules:** case-insensitive, whole-word (word boundaries). No regex. No partial/substring matches.

**Scope:** single tokens only. Multi-word phrases ("heil hitler", "slant eye") are not matched by the v0 whole-word engine. They are noted here for reference but are not in the default list.

---

## Anti-Black

| Word | Notes |
|---|---|
| nigger | |
| niggers | plural |
| nigga | |
| niggas | plural |
| niggah | variant spelling |
| niggahs | plural variant |
| n1gger | leetspeak evasion |
| n1gga | leetspeak evasion |
| niggur | misspelling |
| nigr | truncated form |
| nigs | truncated plural |

## Anti-Asian

| Word | Notes |
|---|---|
| chink | |
| chinks | plural |
| gook | |
| gooks | plural |
| gooks | variant spelling |

## Anti-Latino / Anti-Hispanic

| Word | Notes |
|---|---|
| spic | |
| spics | plural |
| wetback | |
| wetbacks | plural |
| beaner | |
| beaners | plural |

## Anti-Indigenous / Anti-Native

| Word | Notes |
|---|---|
| redskin | |
| redskins | plural (the former team name) |

## Homophobic

| Word | Notes |
|---|---|
| fag | |
| fags | plural |
| faggot | |
| faggots | plural |
| f4ggot | leetspeak evasion |
| f4g | leetspeak evasion |
| feggot | misspelling |
| faggit | misspelling |
| f0gg0t | leetspeak evasion |

## Transphobic

| Word | Notes |
|---|---|
| tranny | |
| trannies | plural |
| tran | truncated |

## Antisemitic

| Word | Notes |
|---|---|
| kike | |
| kikes | plural |
| k1ke | leetspeak evasion |
| yid | |
| yids | plural |
| kraut | historical, still used as slur |
| krauts | plural |

## Anti-Arab / Anti-Middle Eastern

| Word | Notes |
|---|---|
| sandnigger | compound slur |
| sandniggers | plural |
| raghead | |
| ragheads | plural |

## Disability Slurs

| Word | Notes |
|---|---|
| retard | used as a dehumanizing noun/adjective |
| retards | plural |
| retart | misspelling / evasion |
| r4tard | leetspeak evasion |
| spastic | UK/AU slur (cerebral palsy) |
| spastics | plural |

## Anti-Polish / Anti-Eastern European

| Word | Notes |
|---|---|
| polack | |
| polacks | plural |

## Anti-Indian (South Asian)

| Word | Notes |
|---|---|
| curry | used as a racial slur (borderline — also a food; operator's call whether to include) |

> **Note on "curry":** this is a borderline inclusion. It's a real word (the food) used as a slur. The whole-word matcher will flag innocent "curry" mentions. **Not in the default list.** The operator can add it if they want.

## Miscellaneous / Catch-all

| Word | Notes |
|---|---|
| heil | as in "heil hitler" — single word, high-confidence in context |
| | |

> **Note on "heil":** borderline. It's a German word (greeting) but in an English-language social context it's almost exclusively the Nazi salutation. **Not in the default list** — too many false positives for a v0. The operator can add it.

---

## The Flat Default List

This is the exact JSON array that ships as the `node_config.sensitive_words` default:

```json
[
  "nigger", "niggers", "nigga", "niggas", "niggah", "niggahs",
  "n1gger", "n1gga", "niggur", "nigr", "nigs",
  "chink", "chinks", "gook", "gooks", "gooks",
  "spic", "spics", "wetback", "wetbacks", "beaner", "beaners",
  "redskin", "redskins",
  "fag", "fags", "faggot", "faggots",
  "f4ggot", "f4g", "feggot", "faggit", "f0gg0t",
  "tranny", "trannies", "tran",
  "kike", "kikes", "k1ke", "yid", "yids", "kraut", "krauts",
  "sandnigger", "sandniggers", "raghead", "ragheads",
  "retard", "retards", "retart", "r4tard",
  "spastic", "spastics",
  "polack", "polacks"
]
```

**Total: 52 words.**

---

## What's NOT in the list (and why)

| Category | Why excluded |
|---|---|
| General profanity (fuck, shit, bitch, etc.) | Not hate speech. Context-dependent. The operator opts in. |
| "dyke" | Reclaimed by many in the lesbian community. Context-dependent. |
| "curry" | A real word (food). High false-positive rate. |
| "heil" | A German greeting. Too ambiguous for a default. |
| "jap" | Can be an abbreviation (Japan, JAP = JavaScript...). High false-positive rate. |
| "mongol" / "mongolian" | Real words (Mongolia, Mongolian). "Mongoloid" is the slur but it's rare in practice. |
| Multi-word phrases | The v0 matcher is whole-word, single-token. Phrases are a v1 consideration. |
| "whore", "slut", "cunt" | Gendered slurs but not *hate speech* in the same category. Context-dependent. Operator's call. |
| "tranny" as clinical | "Transsexual" is the clinical term. "Tranny" is the slur. Only the slur is listed. |

---

## Evasion Patterns (reference, not in the list)

These patterns exist in the wild but are **not** caught by a whole-word matcher. They're documented here so the operator understands the limitation:

| Pattern | Example | Why it's not caught |
|---|---|---|
| Extended vowels | niiiigger, fagggooot | Not a whole-word match |
| Interjected characters | n-i-g-g-e-r, f.a.g | Hyphens/dots break the word boundary |
| Unicode lookalikes | ۷іgger (Cyrillic і) | Different codepoints |
| Emojis / symbols | n***r, f🐔got | Symbols break the word boundary |
| Reversed | reggin, toggaf | Not a dictionary word |
| Audio / image | Slurs in voice notes or images | Not text |

**v1 consideration:** a normalization pass (strip non-alphanumeric, fold Unicode) before matching would catch most of these. Not in v0.

---

## Maintenance

This list is a **starting point**, not a finished product. The operator is expected to:

- Review the list on first node setup (the Node Config UI shows it)
- Add words specific to their community's issues
- Remove words that cause false positives in their user base
- Add new slurs as they emerge (language evolves)

The list is a node setting, not a protocol constant. Different nodes can have different lists. The default is a reasonable floor, not a ceiling.
