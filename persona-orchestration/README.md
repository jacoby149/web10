# Persona Orchestration

Live-testing personas that make the social platform look alive. Five users with funny names, distinct personalities, real photos, and a plan to go ham.

## The Cast

| # | Username | Display Name | Vibe |
|---|----------|--------------|------|
| 1 | `solar-flare-69` | Solar Flare | The unhinged crypto-bro podcaster who thinks he's the next Joe Rogan |
| 2 | `noodle-empress` | Noodle Empress | Chaotic food blogger, posts pictures of ramen at 3am, aggressively nice |
| 3 | `void-walker` | Void Walker | Dark academia aesthetic, quotes Nietzsche at 2am, secretly soft |
| 4 | `butterfly-mechanic` | Butterfly Mechanic | DIY everything — fixes bugs literally and metaphorically, workshop pics |
| 5 | `disco-donkey` | Disco Donkey | Pure chaos energy, dance memes, unhinged DMs, the class clown |

## How It Works

1. **Seed the accounts** — run `seed_personas.sh` against your local or dev API to create all 5 users
2. **Log in as each persona** — grab their JWT token, use it to make posts, upload photos, send DMs
3. **Follow the action plan** — each persona has a `actions.md` file with their first week of content
4. **Cross-pollinate** — personas follow each other, comment on each other, DM each other, react to each other

## Quick Start

```bash
# Create all 5 accounts (point at your API)
export API_BASE="http://api.localhost:6000"
bash seed_personas.sh

# Or use the Python script for more control
python seed_personas.py --api http://api.localhost:6000
```

## File Structure

```
persona-orchestration/
├── README.md              # This file
├── seed_personas.sh       # Bash seed script
├── seed_personas.py       # Python seed script (full control)
├── photos/                # Profile photos & post media (stock/CC0)
├── solar-flare-69/
│   └── actions.md         # First week of content plan
├── noodle-empress/
│   └── actions.md
├── void-walker/
│   └── actions.md
├── butterfly-mechanic/
│   └── actions.md
└── disco-donkey/
    └── actions.md
```

## Passwords

All personas use `web10test!2026` as their password. Change it in `seed_personas.sh` / `seed_personas.py` if needed.

## API Endpoints Used

- `POST /signup` — create account
- `POST /web10token` — login, get JWT
- `POST /{user}/profile` — set display name, bio
- `POST /{user}/posts` — create posts
- `POST /{user}/upload` + `POST /{user}/upload/confirm` — upload media
- `POST /{user}/contacts` — add contacts
- `POST /{user}/follows` — follow other personas
- `POST /{user}/dm-{a}--{b}` — send DMs
- `POST /{user}/reactions` — like/react to posts
- `POST /{user}/comments` — comment on posts