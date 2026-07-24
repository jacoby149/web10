#!/usr/bin/env python3
"""
Seed 5 persona accounts for live testing the web10 social platform.
Creates accounts, sets profiles, establishes cross-follows, and seeds
content that actually reaches the discovery feed.

IDEMPOTENT (ws-G2 fix, 23.07.2026): re-running on top of existing data is a
no-op (or an upsert). Every create path reads first and skips (or updates)
if the record already exists, keyed by a stable `origin_id` (posts + DMs)
or a natural key (contacts/follows by username+provider, ledger entries by
target+author+payload). The previous script created a fresh duplicate on
every run — 5 runs = 5 copies of every post/contact/follow/DM, which made
the feed demo as broken (gauntlet step 8). Use `--cleanup` once to remove
duplicates from prior buggy runs; subsequent normal runs are safe.

Post-D5.5 (public/private discovery split, landed 1.0.92) contract:
  * Public posts go to the `public_posts` service (visibility "public").
  * A post is indexed into discovery ONLY if the user's `public_posts`
    term record whitelists `anon`. Signup does NOT set this by default
    (services_record() ships an empty whitelist), so this seeder writes
    the anon-whitelist term record explicitly before posting.
  * Reactions and comments are structured, validated interactions written
    to the PUBLIC LEDGER via `POST /public/entries` (not a per-user
    `reactions`/`comments` service). They reference a registered schema
    (Reaction / Comment) and target the post via the key the discovery
    engine reads: "{author}/public_posts/{post_id}". Engagement counts on
    the discovery index are derived from the ledger's `payload.action`.

The provider/site are DERIVED from the --api host (never hardcoded), so
seeding dev populates dev and seeding prod populates prod. See README.md.

Usage:
    python seed_personas.py --api http://api.localhost:6000
    python seed_personas.py --api https://api.dev.web10.app
    python seed_personas.py --api https://api.dev.web10.app --provider api.dev.web10.app --site social.dev.web10.app
    python seed_personas.py --api https://api.dev.web10.app --cleanup   # remove dups from prior buggy runs
    python seed_personas.py --api https://api.dev.web10.app --verify    # report-only, no writes
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("Install requests: pip3 install requests")
    sys.exit(1)

PASSWORD = "web10test!2026"

# State file for schema-id reuse across runs (avoids re-registering the
# Reaction/Comment schemas every run — register_schema has no dedup).
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".seed-state.json")

PERSONAS = [
    {
        "username": "solar-flare-69",
        "display_name": "Solar Flare",
        "bio": "Podcast host. Crypto degenerate. I will talk for 4 hours about anything. New episode every day at 3am because sleep is for weak chains. \U0001f680\U0001f31e",
    },
    {
        "username": "noodle-empress",
        "display_name": "Noodle Empress",
        "bio": "Ramen snob with a $12 bowl budget. If it's got broth, I'll eat it. 3am food pics are a feature, not a bug. \U0001f35c\u2728",
    },
    {
        "username": "void-walker",
        "display_name": "Void Walker",
        "bio": "Reading Camus in a candlelit room at 2am. Dark academia is not an aesthetic, it's a lifestyle. Also I like cats. \U0001f4da\U0001f5a4",
    },
    {
        "username": "butterfly-mechanic",
        "display_name": "Butterfly Mechanic",
        "bio": "Fixing bugs and butterflies since 2019. Workshop pics, DIY tutorials, and zero patience for people who don't label their cables. \U0001f98b\U0001f527",
    },
    {
        "username": "disco-donkey",
        "display_name": "Disco Donkey",
        "bio": "Professional chaos agent. If you're not laughing, you're doing it wrong. Dance memes only. No thoughts, just vibes. \U0001fabf\U0001f573",
    },
]

POSTS = {
    "solar-flare-69": [
        {
            "text": "Hot take: the entire podcast industry is just men in expensive chairs arguing about things they read on Twitter 20 minutes ago. I'm part of the problem. Send help. Or coffee. Mostly coffee.",
            "tags": ["podcast", "hot-takes"],
        },
        {
            "text": "Just had a 47-minute rant on my show about why decentralized social media is the only way forward. My co-host fell asleep. The chat was wild though. 12k listeners, 3 of them stayed awake. That's engagement for you.",
            "tags": ["web10", "crypto", "podcast"],
        },
        {
            "text": "Unpopular opinion: most 'builders' in crypto have never built anything that a 14 year old couldn't replicate in a weekend. Show me your GitHub, not your Twitter bio.",
            "tags": ["hot-takes", "crypto"],
        },
        {
            "text": "Day 47 of drinking only matcha and doing pushups. My skin is glowing, my wallet is not. Balance.",
            "tags": ["wellness", "lifestyle"],
        },
        {
            "text": "The algorithm shadowbanned me AGAIN. 2M followers, 400 impressions. Meanwhile on this platform my post reaches 100% of my followers because the architecture guarantees it. This is the difference between renting and owning your audience. Wake up.",
            "tags": ["web10", "creator-economy"],
        },
        {
            "text": "Recording tonight's episode at 2am because that's when the thoughts hit hardest. Topic: why every 'AI will replace creators' take is cope from people who've never made anything worth watching. The tool doesn't have the story, you do.",
            "tags": ["podcast", "ai", "hot-takes"],
        },
        {
            "text": "Three sponsors reached out this week. Not because I have the biggest show, but because I OWN the relationship with my listeners. No platform skims 30% to show my posts to the people who already asked to see them. This is the pitch, lived.",
            "tags": ["web10", "creator-economy", "sponsors"],
        },
    ],
    "noodle-empress": [
        {
            "text": "Found a ramen shop that doesn't show up on Google Maps. The owner is a 78 year old man who has been making the same broth for 50 years. I cried. Into the bowl. \U0001f35c",
            "tags": ["ramen", "hidden-gems", "food"],
        },
        {
            "text": "3am and I'm making tonkotsu from scratch because the delivery apps are all closed and I have standards. The pork bones have been boiling for 12 hours. My apartment smells like a Tokyo street. No regrets.",
            "tags": ["home-cooking", "ramen", "3am"],
        },
        {
            "text": "Rating: Ichiran Shibuya 8/10, Afuri Daikanyama 9/10, that unmarked shop in Shinjuku that I'm not naming because I want it to stay secret 11/10. Fight me.",
            "tags": ["ramen", "ratings", "tokyo"],
        },
        {
            "text": "Hot take: instant ramen is a gateway drug. You start with Cup Noodles at 2am after a bad date and somehow 6 months later you're fermenting your own miso. It happens to the best of us.",
            "tags": ["hot-takes", "food", "misadventures"],
        },
        {
            "text": "Made udon for the first time. The dough is like working with concrete. My arms hurt. The result? Beautiful. Slap that noodle on a plate like you mean it.",
            "tags": ["udon", "home-cooking", "diy"],
        },
        {
            "text": "Update on the 3am tonkotsu: the broth reduced for 14 hours and it's so rich it's basically a religious experience. I'm not saying I peaked, but I'm not saying I didn't. \U0001f35c\u2728",
            "tags": ["ramen", "home-cooking", "3am"],
        },
        {
            "text": "Someone asked me for my secret. It's patience. And pork bones. And a 3am delusion that you can make restaurant-grade ramen in your kitchen. The delusion is the secret ingredient.",
            "tags": ["ramen", "food", "hot-takes"],
        },
    ],
    "void-walker": [
        {
            "text": "\"Man is nothing else but what he makes of himself.\" \u2014 Sartre. Reading this at 2:47am with a cup of black coffee and a cat named Camus on my lap. This is the life. \U0001f4d6",
            "tags": ["philosophy", "dark-academia", "books"],
        },
        {
            "text": "Bought a leather-bound notebook. Wrote one sentence in it. The sentence was 'to be or not to be' because I'm not a monster. Now it sits on my desk judging me. We have an understanding.",
            "tags": ["dark-academia", "literature"],
        },
        {
            "text": "The library is the only place where silence feels like company. Spent 6 hours today in the philosophy section. The librarian knows me now. She doesn't judge. She brings me tea.",
            "tags": ["library", "dark-academia", "quiet"],
        },
        {
            "text": "Started reading 'The Stranger' again for the 7th time. Each time I find something new. Camus was writing about algorithmic feed fatigue in 1942 and nobody noticed. The absurdity of modern life hasn't changed, just the medium.",
            "tags": ["camus", "philosophy", "books"],
        },
        {
            "text": "My plant died. I named it Nietzsche. I'm writing a eulogy. It's going to be good. Update: the eulogy is better than most things I've read this year. Maybe I should be a writer instead of a philosophy student.",
            "tags": ["dark-humor", "plants", "writing"],
        },
        {
            "text": "Camus the cat just knocked over my copy of 'The Myth of Sisyphus.' I think he's trying to tell me something about the futility of meaning. Or he wants food. It's always the food.",
            "tags": ["cats", "philosophy", "dark-humor"],
        },
        {
            "text": "Re-reading 'Nausea' by Sartre. The protagonist feels the world is too much, too present. Sometimes I feel that scrolling a feed that's designed to make me feel inadequate. Ownership of your own space is the antidote. Quiet is a feature.",
            "tags": ["sartre", "philosophy", "web10"],
        },
    ],
    "butterfly-mechanic": [
        {
            "text": "Fixed a 1998 Honda Civic today. The mechanic shop quoted $800. I did it for $47 in parts and 3 hours of swearing. The car runs better than it has in a decade. This is why I don't trust mechanic shops. \U0001f527",
            "tags": ["diy", "cars", "workshop"],
        },
        {
            "text": "Built a butterfly enclosure in my backyard. Released 12 Monarch butterflies this morning. Watching them take flight for the first time is the most peaceful thing I've ever witnessed. Also my neighbor thinks I'm weird. Worth it. \U0001f98b",
            "tags": ["butterflies", "nature", "diy"],
        },
        {
            "text": "Pro tip: label your cables. I spent 4 hours today tracing a network cable through a wall only to find out it was connected to a printer that hasn't worked since 2019. Four hours. Four. Hours. Label. Your. Cables.",
            "tags": ["tech", "diy", "pro-tips"],
        },
        {
            "text": "Restored a vintage soldering iron I found at a flea market. 1970s Weller. Still works perfectly. There's something about fixing old things that makes you feel connected to the people who made them. This person, 50 years ago, cared about quality.",
            "tags": ["restoration", "tools", "workshop"],
        },
        {
            "text": "My workshop is 80% tools I'll never use and 20% coffee stains. The 80% makes me feel prepared. The 20% makes me feel alive. Perfect balance.",
            "tags": ["workshop", "lifestyle", "diy"],
        },
        {
            "text": "New project: converting an old radio cabinet into a workbench. The wood is solid 1950s oak. I'm keeping the tuning dial as a decoration because some things are too beautiful to strip. The past and the present, sharing a surface.",
            "tags": ["restoration", "workshop", "diy"],
        },
        {
            "text": "Label-maker update: I've now labeled my label maker. We've gone full circle. My therapist says this is progress. I say it's organizational.",
            "tags": ["diy", "pro-tips", "workshop"],
        },
    ],
    "disco-donkey": [
        {
            "text": "Just danced to 'Stayin' Alive' in the middle of a grocery store. The cashier gave me a look. I gave her a beat. She joined in. We got kicked out. Best shopping trip ever. \U0001f573\U0001f6d2",
            "tags": ["chaos", "dance", "memes"],
        },
        {
            "text": "My therapist says I need to find an outlet for my energy. So I started a dance channel. 47 followers. 46 of them are my mom checking on me. The other one is a bot. I'm thriving.",
            "tags": ["dance", "memes", "chaos"],
        },
        {
            "text": "Challenge: I'm going to do the moonwalk across every room in my house. Room 1 (kitchen): success. Room 2 (bathroom): slipped on a wet floor, survived. Room 3 (bedroom): the cat judged me. 2/3 rooms. Not bad for a Tuesday.",
            "tags": ["challenge", "moonwalk", "chaos"],
        },
        {
            "text": "Found out my donkey emoji is more popular than my actual name. People call me Disco Donkey IRL now. My grandma doesn't get it. She asked if I'm 'that donkey guy on the computer.' Yes, grandma. Yes I am. And I own it.",
            "tags": ["identity", "memes", "chaos"],
        },
        {
            "text": "Life hack: if you're having a bad day, put on 'Dancing Queen' and dance like nobody's watching. Then check your phone and realize everyone IS watching because you live with roommates. Still worth it. \U0001f451\U0001f483",
            "tags": ["life-hacks", "abba", "chaos"],
        },
        {
            "text": "New dance move invented: the 'Server Down.' You freeze mid-spin and pretend the music buffered. Nobody laughed. I'm keeping it anyway. Comedy is subjective and my audience is ahead of the curve.",
            "tags": ["dance", "memes", "chaos"],
        },
        {
            "text": "Got my first sponsor DM. A lamp company wants me to dance under their lamps. The future is now, old man. The creator economy is REAL and it is LAMP-SHAPED. \U0001f4a1\U0001f573",
            "tags": ["creator-economy", "dance", "chaos"],
        },
    ],
}

COMMENTS = {
    # "poster_username": [commenter, text]
    "solar-flare-69": [
        ("noodle-empress", "I fall asleep during podcasts too but at least I have ramen as a snack \U0001f35c"),
        ("disco-donkey", "47 MINUTES?? That's like 3 dance songs. You need to tighten the show up my friend \U0001f573"),
        ("void-walker", "Sartre would have something to say about performative intellectualism in podcast culture. Just saying."),
    ],
    "noodle-empress": [
        ("butterfly-mechanic", "That unmarked shop sounds amazing. I once found a ramen place by following the smell. Worked every time."),
        ("solar-flare-69", "I'd have this on my podcast. The man has been making broth for 50 years. That's the kind of dedication I talk about."),
        ("disco-donkey", "3am cooking is my love language too but I'm usually just making cereal at that hour \U0001fabf"),
    ],
    "void-walker": [
        ("noodle-empress", "Camus the cat is the best thing I've read all week. Please tell me he's still alive (unlike Nietzsche the plant)"),
        ("butterfly-mechanic", "There's something darkly poetic about naming a plant after a philosopher who wrote about the death of God. Respect. \U0001f98b"),
        ("disco-donkey", "I read the library book you recommended. It was in a language I don't know. I liked the pictures though. 10/10 would be confused again \U0001f4da"),
    ],
    "butterfly-mechanic": [
        ("solar-flare-69", "$47 vs $800? That's the kind of ROI I talk about on the show. You're out here building real value."),
        ("void-walker", "The care a craftsman puts into a tool is the same care a writer puts into a sentence. Both are acts of love for the work. Beautiful post."),
        ("disco-donkey", "I tried to fix my toaster once. Now I just buy new bread. We all have our limits \U0001f527\U0001f35e"),
    ],
    "disco-donkey": [
        ("noodle-empress", "Getting kicked out of a grocery store for dancing is the most iconic thing I've ever heard. You're a legend \U0001fabf\U0001f483"),
        ("solar-flare-69", "This energy is exactly what the creator economy needs. Unfiltered, authentic, zero apologies. You're gonna blow up."),
        ("void-walker", "In a world of curated perfection, your chaotic authenticity is refreshingly absurd. Camus would approve. \U0001f4d6"),
    ],
}

DMS = [
    {"from": "disco-donkey", "to": "solar-flare-69", "message": "yo heard you need a hype man for the podcast. i'm available. my rate is 3 dance breaks per episode"},
    {"from": "solar-flare-69", "to": "disco-donkey", "message": "honestly the chat loves when you show up. you're on. first episode free though, i'm not crazy"},
    {"from": "noodle-empress", "to": "butterfly-mechanic", "message": "hey i saw your workshop pics and i have a question. do you think you could help me fix my rice cooker? it's making a weird noise and i'm scared"},
    {"from": "butterfly-mechanic", "to": "noodle-empress", "message": "send me a video of the noise. if it's the heating element i can fix it for like $5 in parts. also what brand is it?"},
    {"from": "void-walker", "to": "noodle-empress", "message": "your 3am ramen posts are the only thing keeping me awake past 2am and for that i am both grateful and disturbed"},
    {"from": "noodle-empress", "to": "void-walker", "message": "that's the most romantic thing anyone has ever said to me. also i made extra miso soup. come over. it's 3:17am."},
    {"from": "disco-donkey", "to": "void-walker", "message": "hey void walker i need you to write a eulogy for my left sneaker. it fell apart during a moonwalk. it deserved better than the trash"},
    {"from": "void-walker", "to": "disco-donkey", "message": "\"Here lies a shoe that dared to dream of the moon. It was rubber-soled but spirit-winged.\" You're welcome. Charge: one library book."},
    {"from": "solar-flare-69", "to": "butterfly-mechanic", "message": "bro i need you to look at my mic stand. it's wobbling during recordings and the audio guys are losing it"},
    {"from": "butterfly-mechanic", "to": "solar-flare-69", "message": "send me a pic of the base. bet it's a loose bolt. i'll DM you a fix in 5 minutes"},
    {"from": "disco-donkey", "to": "noodle-empress", "message": "ok real talk. if i cook you a 3am meal can you teach me to make ramen from scratch? i'll bring the donkey energy you bring the noodle wisdom"},
    {"from": "noodle-empress", "to": "disco-donkey", "message": "only if you promise not to dance while stirring the broth. last time someone danced in my kitchen the cat knocked over the soy sauce. trauma."},
    # Reply threads (gauntlet step 5: "persona DMs are one-directional —
    # opening a thread shows only one side. add replies so it reads like a
    # conversation, not a monologue."):
    {"from": "butterfly-mechanic", "to": "noodle-empress", "message": "update: it was the heating element. $4.27 in parts from the electronics store. your rice cooker is reborn. you owe me a bowl."},
    {"from": "noodle-empress", "to": "butterfly-mechanic", "message": "DEAL. come over friday. i'm making the tonkotsu. bring your own chopsticks though, i learned my lesson last time."},
    {"from": "disco-donkey", "to": "solar-flare-69", "message": "just did a 3-minute dance break during the ad read. the chat went WILD. i think this is the start of something beautiful"},
    {"from": "solar-flare-69", "to": "disco-donkey", "message": "the numbers don't lie. you're officially the podcast hype dancer. i'm putting you in the credits. title: 'Minister of Vibes.'"},
]

REACTIONS = [
    # (reactor, poster, post_index_0-based, reaction_type)
    ("noodle-empress", "solar-flare-69", 0, "\u2764\ufe0f"),
    ("disco-donkey", "solar-flare-69", 4, "\U0001f525"),
    ("void-walker", "noodle-empress", 0, "\u2764\ufe0f"),
    ("butterfly-mechanic", "noodle-empress", 1, "\U0001f525"),
    ("solar-flare-69", "void-walker", 0, "\U0001f9e0"),
    ("disco-donkey", "void-walker", 4, "\u2764\ufe0f"),
    ("noodle-empress", "butterfly-mechanic", 0, "\U0001f525"),
    ("void-walker", "butterfly-mechanic", 3, "\u2764\ufe0f"),
    ("solar-flare-69", "disco-donkey", 0, "\U0001f525"),
    ("butterfly-mechanic", "disco-donkey", 2, "\u2764\ufe0f"),
    ("noodle-empress", "disco-donkey", 4, "\U0001f483"),
    ("void-walker", "disco-donkey", 1, "\u2764\ufe0f"),
    ("disco-donkey", "noodle-empress", 0, "\U0001f35c"),
    ("butterfly-mechanic", "noodle-empress", 2, "\U0001f525"),
    ("solar-flare-69", "void-walker", 3, "\U0001f9e0"),
    ("noodle-empress", "butterfly-mechanic", 1, "\U0001f98b"),
    ("void-walker", "solar-flare-69", 2, "\u2764\ufe0f"),
    ("disco-donkey", "butterfly-mechanic", 4, "\U0001f527"),
    ("butterfly-mechanic", "solar-flare-69", 5, "\U0001f525"),
    ("void-walker", "noodle-empress", 5, "\u2764\ufe0f"),
    ("disco-donkey", "void-walker", 5, "\u2764\ufe0f"),
    ("noodle-empress", "disco-donkey", 5, "\U0001f483"),
]


# ── Discovery service + public-ledger contract ─────────────────────────────
POST_SERVICE = "public_posts"  # D5.5: discoverable posts live here.

# Public-ledger schemas the app registers by default (see web10-social
# feed.ts DEFAULT_SCHEMAS). Reactions/comments reference these by _id.
# `action` is added to the payload so the discovery engine can count
# engagement (documentdb._ledger_engagement_for_post groups on
# payload.action: like/reaction -> likes, comment -> comments, repost).
REACTION_SCHEMA = {
    "name": "Reaction",
    "schema": {
        "type": "object",
        "required": ["type", "target"],
        "properties": {
            "type": {"type": "string"},
            "target": {"type": "string", "description": "post_id or comment_id"},
            "action": {"type": "string"},
            "author_username": {"type": "string"},
            "author_provider": {"type": "string"},
        },
    },
}
COMMENT_SCHEMA = {
    "name": "Comment",
    "schema": {
        "type": "object",
        "required": ["text", "target"],
        "properties": {
            "text": {"type": "string"},
            "target": {"type": "string", "description": "post_id being commented on"},
            "action": {"type": "string"},
            "author_username": {"type": "string"},
            "author_provider": {"type": "string"},
        },
    },
}


def derive_provider(api_url):
    """The node's provider identity == the api hostname (no scheme/port)."""
    host = urlparse(api_url).hostname
    return host or "api.localhost"


def derive_site(api_url):
    """The social app's site == the api host with the `api.` prefix swapped
    for `social.` (e.g. api.dev.web10.app -> social.dev.web10.app)."""
    host = urlparse(api_url).hostname or "api.localhost"
    if host.startswith("api."):
        return "social." + host[len("api."):]
    return "social." + host


def api(base, method, path, data=None):
    """Perform a request; return (status_code, parsed_body)."""
    url = f"{base}{path}"
    try:
        resp = requests.request(method, url, json=data, timeout=30)
    except requests.RequestException as e:
        return 0, str(e)
    try:
        return resp.status_code, resp.json()
    except Exception:
        return resp.status_code, resp.text


def _is_already_exists(status, body):
    """Signup is idempotent: an existing user (EXISTS, 401) is success."""
    if status == 200:
        return False
    text = str(body).lower()
    return "already exist" in text or "reserved" in text


# ── Read helpers (PATCH = read in web10 CRUD) ──────────────────────────────

def read_records(base, username, service, token, query=None):
    """PATCH /{user}/{service} returns matching records (list). Returns []."""
    status, body = api(base, "PATCH", f"/{username}/{service}", {
        "token": token,
        "query": query or {},
    })
    if status == 200 and isinstance(body, list):
        return body
    return []


def query_ledger(base, token, target=None, author=None, schema_id=None, limit=200):
    """PATCH /public/entries — query the public ledger (anon OK, token OK).
    Filter by target / author / schema_id. Returns list of entries."""
    q = {"limit": limit}
    if target:
        q["target"] = target
    if author:
        q["author"] = author
    if schema_id:
        q["schema_id"] = schema_id
    status, body = api(base, "PATCH", "/public/entries", {"token": token, "query": q})
    if status == 200 and isinstance(body, list):
        return body
    return []


def delete_record(base, username, service, token, query):
    """DELETE /{user}/{service} — delete matching records from a collection."""
    return api(base, "DELETE", f"/{username}/{service}", {"token": token, "query": query})


def delete_ledger_entry(base, token, entry_id):
    """DELETE /public/entries/{id} — delete a ledger entry (author only)."""
    return api(base, "DELETE", f"/public/entries/{entry_id}", {"token": token})


# ── Schema-id reuse (avoids re-registering every run) ───────────────────────

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_state(state):
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f, indent=2)
    except Exception:
        pass


def schema_exists(base, schema_id):
    """PATCH /schemas/{id} — check if a schema is still registered."""
    status, body = api(base, "PATCH", f"/schemas/{schema_id}", {"token": None, "query": {}})
    return status == 200 and isinstance(body, dict)


def get_or_register_schema(base, token, schema, provider, state):
    """Reuse an existing schema_id if it's still valid; else register + save."""
    provider_state = state.setdefault("providers", {}).setdefault(provider, {})
    key = "reaction_schema_id" if schema["name"] == "Reaction" else "comment_schema_id"
    existing_id = provider_state.get(key)
    if existing_id and schema_exists(base, existing_id):
        return existing_id
    status, sid, body = register_schema(base, token, schema)
    if sid:
        provider_state[key] = sid
        save_state(state)
    return sid


# ── Write helpers (now idempotent: read-before-write) ───────────────────────

def signup(base, persona):
    return api(base, "POST", "/signup", {
        "username": persona["username"],
        "password": PASSWORD,
    })


def login(base, username, site):
    status, body = api(base, "POST", "/web10token", {
        "username": username,
        "password": PASSWORD,
        "site": site,
        "target": "",
    })
    token = body.get("token") if isinstance(body, dict) else None
    return status, token, body


def set_public_posts_terms(base, username, token):
    """D5.5 gate: index a post into discovery only if its service whitelists
    anon. Signup ships an empty whitelist, so create the term record here.
    Idempotent: a duplicate services record returns 400 (DUPLICATE_SERVICE)."""
    return api(base, "POST", f"/{username}/services", {
        "token": token,
        "query": {
            "service": POST_SERVICE,
            "whitelist": [{"username": "anon", "provider": ".*", "read": True}],
            "blacklist": [],
        },
    })


def register_schema(base, token, schema):
    status, body = api(base, "POST", "/schemas/register", {
        "token": token,
        "query": {"name": schema["name"], "schema": schema["schema"]},
    })
    sid = body.get("_id") if isinstance(body, dict) else None
    return status, sid, body


def set_profile(base, username, token, persona):
    """Upsert: if a profile record exists, PUT-update it; else POST-create.
    The old script always POSTed, leaving N profile records after N runs."""
    existing = read_records(base, username, "profile", token)
    payload = {
        "display_name": persona["display_name"],
        "bio": persona["bio"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing and isinstance(existing, list) and existing[0].get("_id"):
        pid = existing[0]["_id"]
        return api(base, "PUT", f"/{username}/profile", {
            "token": token,
            "query": {"_id": pid},
            "update": {"$set": payload},
        })
    return api(base, "POST", f"/{username}/profile", {
        "token": token,
        "query": payload,
    })


def post_origin_id(username, idx):
    """Stable key per seeded post — survives re-runs without duplication."""
    return f"seed-{username}-{idx:02d}"


def create_post(base, username, token, post_data, idx):
    """Idempotent: read public_posts by origin_id first. If a record exists,
    reuse its _id (don't re-create). Else create with the stable origin_id."""
    oid = post_origin_id(username, idx)
    existing = read_records(base, username, POST_SERVICE, token, {"origin_id": oid})
    if existing and isinstance(existing, list) and existing[0].get("_id"):
        rec = existing[0]
        rec["skipped"] = True
        return 200, rec
    return api(base, "POST", f"/{username}/{POST_SERVICE}", {
        "token": token,
        "query": {
            **post_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "visibility": "public",
            "origin": "web10",
            "origin_id": oid,
        },
    })


def post_target_key(username, post_id):
    """The ledger target the discovery engine reads for engagement."""
    return f"{username}/{POST_SERVICE}/{post_id}"


def add_contact(base, username, token, target_username, provider):
    """Idempotent: skip if a contact with this (username, provider) exists."""
    existing = read_records(base, username, "contacts", token, {
        "username": target_username, "provider": provider,
    })
    if existing:
        return 200, {"_id": existing[0].get("_id"), "skipped": True}
    return api(base, "POST", f"/{username}/contacts", {
        "token": token,
        "query": {
            "username": target_username,
            "provider": provider,
            "added_at": datetime.now(timezone.utc).isoformat(),
        },
    })


def follow_user(base, username, token, target_username, provider):
    """Idempotent: if a follow with this (username, provider) exists and is
    active, skip. If it exists but isn't active, PUT-update to active.
    Else create. Mirrors the social app's follows.ts:followUser pattern."""
    existing = read_records(base, username, "follows", token, {
        "username": target_username, "provider": provider,
    })
    if existing and isinstance(existing, list) and existing[0].get("_id"):
        rec = existing[0]
        if rec.get("body", rec).get("status") == "active":
            return 200, {"_id": rec.get("_id"), "skipped": True}
        return api(base, "PUT", f"/{username}/follows", {
            "token": token,
            "query": {"_id": rec.get("_id")},
            "update": {"$set": {"status": "active", "followed_at": datetime.now(timezone.utc).isoformat()}},
        })
    return api(base, "POST", f"/{username}/follows", {
        "token": token,
        "query": {
            "username": target_username,
            "provider": provider,
            "status": "active",
            "followed_at": datetime.now(timezone.utc).isoformat(),
        },
    })


def deliver_to_inbox(base, target_user, token, author_username, post_id, post_body, provider):
    """Idempotent fan-out: skip if an inbox record with this post_id already
    exists for the target user."""
    existing = read_records(base, target_user, "inbox", token, {"post_id": post_id})
    if existing:
        return 200, {"skipped": True}
    return api(base, "POST", f"/{target_user}/inbox", {
        "token": token,
        "query": {
            "author_username": author_username,
            "author_provider": provider,
            "post_id": post_id,
            "delivered_at": datetime.now(timezone.utc).isoformat(),
            "post_body": post_body,
            "origin": "web10",
        },
    })


def dm_origin_id(from_user, to_user, idx):
    return f"seed-dm-{from_user}-{to_user}-{idx:02d}"


def send_dm(base, from_user, to_user, token, message, provider, idx):
    """Idempotent: read dms by origin_id; skip if exists; else create.
    DMs live in a single `dms` service (see web10-social dms.ts) with
    sender/recipient fields. Written to the sender's own collection."""
    oid = dm_origin_id(from_user, to_user, idx)
    existing = read_records(base, from_user, "dms", token, {"origin_id": oid})
    if existing:
        return 200, {"skipped": True}
    return api(base, "POST", f"/{from_user}/dms", {
        "token": token,
        "query": {
            "message": message,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "sender_username": from_user,
            "sender_provider": provider,
            "recipient_username": to_user,
            "recipient_provider": provider,
            "media_refs": [],
            "origin_id": oid,
        },
    })


def add_reaction(base, reactor, token, schema_id, poster, post_id, reaction_type, provider):
    """Idempotent: query the ledger for an existing reaction by this author
    on this target with this type. Skip if found; else create."""
    target = post_target_key(poster, post_id)
    entries = query_ledger(base, token, target=target, author=reactor)
    for e in entries:
        payload = e.get("payload", e.get("body", {}).get("payload", {})) if isinstance(e, dict) else {}
        if isinstance(payload, dict) and payload.get("type") == reaction_type:
            return 200, {"skipped": True}
    return api(base, "POST", "/public/entries", {
        "token": token,
        "query": {
            "schema_id": schema_id,
            "target": target,
            "payload": {
                "type": reaction_type,
                "target": post_id,
                "action": "like",
                "author_username": reactor,
                "author_provider": provider,
            },
        },
    })


def add_comment(base, commenter, token, schema_id, poster, post_id, text, provider):
    """Idempotent: query the ledger for an existing comment by this author
    on this target with this text. Skip if found; else create."""
    target = post_target_key(poster, post_id)
    entries = query_ledger(base, token, target=target, author=commenter)
    for e in entries:
        payload = e.get("payload", e.get("body", {}).get("payload", {})) if isinstance(e, dict) else {}
        if isinstance(payload, dict) and payload.get("text") == text:
            return 200, {"skipped": True}
    return api(base, "POST", "/public/entries", {
        "token": token,
        "query": {
            "schema_id": schema_id,
            "target": target,
            "payload": {
                "text": text,
                "target": post_id,
                "action": "comment",
                "author_username": commenter,
                "author_provider": provider,
            },
        },
    })


# ── Cleanup: remove duplicates from prior buggy (non-idempotent) runs ──────

def _record_field(rec, field):
    """Extract a field from a to_gui-shaped record (body fields at top level
    after to_gui, or nested under body for raw db docs)."""
    if not isinstance(rec, dict):
        return None
    if field in rec:
        return rec[field]
    body = rec.get("body", {})
    if isinstance(body, dict) and field in body:
        return body[field]
    return None


def cleanup_duplicates(base, tokens, provider):
    """Remove duplicate records from prior non-idempotent runs. For each
    collection, group by the natural dedup key, keep the oldest (smallest
    _id ObjectId), delete the rest. Reports what it removes."""
    print("=== CLEANUP: removing duplicates from prior buggy runs ===")
    total_deleted = 0

    for uname, token in tokens.items():
        # Posts: dedup by origin_id (new) or text (old records without origin_id)
        posts = read_records(base, uname, POST_SERVICE, token)
        seen = {}
        for p in posts:
            oid = _record_field(p, "origin_id")
            text = _record_field(p, "text")
            key = oid or f"text::{text}"
            pid = p.get("_id") if isinstance(p, dict) else None
            if not pid:
                continue
            if key in seen:
                # duplicate — delete this one
                delete_record(base, uname, POST_SERVICE, token, {"_id": pid})
                total_deleted += 1
            else:
                seen[key] = pid
        dup_posts = len(posts) - len(seen)
        if dup_posts:
            print(f"  {uname}: removed {dup_posts} duplicate posts (kept {len(seen)})")

        # Contacts: dedup by (username, provider)
        contacts = read_records(base, uname, "contacts", token)
        seen = {}
        for c in contacts:
            cu = _record_field(c, "username")
            cp = _record_field(c, "provider")
            cid = c.get("_id") if isinstance(c, dict) else None
            if not cid:
                continue
            key = f"{cu}::{cp}"
            if key in seen:
                delete_record(base, uname, "contacts", token, {"_id": cid})
                total_deleted += 1
            else:
                seen[key] = cid
        dup_contacts = len(contacts) - len(seen)
        if dup_contacts:
            print(f"  {uname}: removed {dup_contacts} duplicate contacts")

        # Follows: dedup by (username, provider)
        follows = read_records(base, uname, "follows", token)
        seen = {}
        for f in follows:
            fu = _record_field(f, "username")
            fp = _record_field(f, "provider")
            fid = f.get("_id") if isinstance(f, dict) else None
            if not fid:
                continue
            key = f"{fu}::{fp}"
            if key in seen:
                delete_record(base, uname, "follows", token, {"_id": fid})
                total_deleted += 1
            else:
                seen[key] = fid
        dup_follows = len(follows) - len(seen)
        if dup_follows:
            print(f"  {uname}: removed {dup_follows} duplicate follows")

        # DMs: dedup by origin_id (new) or (sender, recipient, message) (old)
        dms = read_records(base, uname, "dms", token)
        seen = {}
        for d in dms:
            oid = _record_field(d, "origin_id")
            msg = _record_field(d, "message")
            su = _record_field(d, "sender_username")
            ru = _record_field(d, "recipient_username")
            key = oid or f"{su}::{ru}::{msg}"
            did = d.get("_id") if isinstance(d, dict) else None
            if not did:
                continue
            if key in seen:
                delete_record(base, uname, "dms", token, {"_id": did})
                total_deleted += 1
            else:
                seen[key] = did
        dup_dms = len(dms) - len(seen)
        if dup_dms:
            print(f"  {uname}: removed {dup_dms} duplicate DMs")

        # Inbox: dedup by post_id
        inbox = read_records(base, uname, "inbox", token)
        seen = {}
        for i in inbox:
            pid = _record_field(i, "post_id")
            iid = i.get("_id") if isinstance(i, dict) else None
            if not iid:
                continue
            if pid and pid in seen:
                delete_record(base, uname, "inbox", token, {"_id": iid})
                total_deleted += 1
            else:
                if pid:
                    seen[pid] = iid
        dup_inbox = len(inbox) - len(seen)
        if dup_inbox:
            print(f"  {uname}: removed {dup_inbox} duplicate inbox records")

        # Ledger entries: dedup reactions by (target, type), comments by (target, text)
        entries = query_ledger(base, token, author=uname, limit=500)
        seen_reactions = {}
        seen_comments = {}
        for e in entries:
            eid = e.get("_id") if isinstance(e, dict) else None
            if not eid:
                continue
            payload = e.get("payload", {}) if isinstance(e, dict) else {}
            if not isinstance(payload, dict):
                payload = e.get("body", {}).get("payload", {}) if isinstance(e, dict) else {}
            action = payload.get("action", "")
            target = e.get("target", e.get("body", {}).get("target", "")) if isinstance(e, dict) else ""
            if action == "comment":
                key = f"{target}::{payload.get('text', '')}"
                if key in seen_comments:
                    delete_ledger_entry(base, token, eid)
                    total_deleted += 1
                else:
                    seen_comments[key] = eid
            else:
                key = f"{target}::{payload.get('type', '')}"
                if key in seen_reactions:
                    delete_ledger_entry(base, token, eid)
                    total_deleted += 1
                else:
                    seen_reactions[key] = eid
        dup_ledger = len(entries) - len(seen_reactions) - len(seen_comments)
        if dup_ledger:
            print(f"  {uname}: removed {dup_ledger} duplicate ledger entries")

    print(f"\n  TOTAL: {total_deleted} duplicate records removed")

    # Backfill origin_id on old posts (pre-idempotency) by matching text, so
    # the re-seed recognizes them instead of creating new duplicates.
    backfilled = 0
    for uname, token in tokens.items():
        if uname not in POSTS:
            continue
        posts = read_records(base, uname, POST_SERVICE, token)
        text_to_oid = {}
        for idx, pd in enumerate(POSTS[uname]):
            text_to_oid[pd["text"]] = post_origin_id(uname, idx)
        for p in posts:
            if not isinstance(p, dict):
                continue
            existing_oid = _record_field(p, "origin_id")
            if existing_oid:
                continue
            text = _record_field(p, "text")
            oid = text_to_oid.get(text)
            pid = p.get("_id")
            if oid and pid:
                api(base, "PUT", f"/{uname}/{POST_SERVICE}", {
                    "token": token,
                    "query": {"_id": pid},
                    "update": {"$set": {"origin_id": oid, "origin": "web10"}},
                })
                backfilled += 1
    if backfilled:
        print(f"  Backfilled origin_id on {backfilled} old posts (text-matched)")

    return total_deleted


# ── Verify: report-only, no writes ──────────────────────────────────────────

def verify_state(base, tokens, provider):
    """Report the current state of persona data: counts per collection +
    any duplicates found. Non-mutating."""
    print("=== VERIFY: reporting persona data state (no writes) ===")
    for uname, token in tokens.items():
        posts = read_records(base, uname, POST_SERVICE, token)
        contacts = read_records(base, uname, "contacts", token)
        follows = read_records(base, uname, "follows", token)
        dms = read_records(base, uname, "dms", token)
        inbox = read_records(base, uname, "inbox", token)
        ledger = query_ledger(base, token, author=uname, limit=500)

        # Check for duplicate posts (by text)
        texts = [_record_field(p, "text") for p in posts if isinstance(p, dict)]
        dup_texts = len(texts) - len(set(texts))

        print(f"  {uname}: {len(posts)} posts, {len(contacts)} contacts, "
              f"{len(follows)} follows, {len(dms)} DMs, {len(inbox)} inbox, "
              f"{len(ledger)} ledger entries"
              + (f"  ⚠ {dup_texts} duplicate posts!" if dup_texts else ""))


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Seed persona accounts for web10 social testing")
    parser.add_argument("--api", default="http://api.localhost:6000", help="API base URL")
    parser.add_argument("--provider", default=None, help="Override node provider (default: derived from --api host)")
    parser.add_argument("--site", default=None, help="Override login site (default: social.<api-host>)")
    parser.add_argument("--skip-content", action="store_true", help="Only create accounts, skip posts/DMs/comments")
    parser.add_argument("--cleanup", action="store_true", help="Remove duplicate records from prior non-idempotent runs, then exit")
    parser.add_argument("--verify", action="store_true", help="Report current data state (no writes), then exit")
    args = parser.parse_args()

    base = args.api.rstrip("/")
    provider = args.provider or derive_provider(base)
    site = args.site or derive_site(base)
    print(f"Target API: {base}")
    print(f"Provider:   {provider}")
    print(f"Login site: {site}")
    print(f"Personas:   {len(PERSONAS)}")
    print()

    # Login all personas first (needed for cleanup + verify + seed)
    print("=== Logging in ===")
    tokens = {}
    for p in PERSONAS:
        uname = p["username"]
        # Ensure account exists (signup is idempotent)
        status, body = signup(base, p)
        if status == 200:
            print(f"  {uname}: signup 200")
        elif _is_already_exists(status, body):
            print(f"  {uname}: signup {status} (already exists — ok)")
        else:
            print(f"  {uname}: signup {status} FAILED: {body}")
        time.sleep(0.1)
        status, token, body = login(base, uname, site)
        if token:
            tokens[uname] = token
            print(f"  {uname}: logged in")
        else:
            print(f"  {uname}: login {status} FAILED: {body}")
    print()

    if not tokens:
        print("ERROR: No tokens obtained. Check API connectivity and credentials.")
        sys.exit(1)

    # --cleanup: remove duplicates from prior buggy runs, then exit
    if args.cleanup:
        cleanup_duplicates(base, tokens, provider)
        print("\nCleanup complete. Run again without --cleanup to seed (now idempotent).")
        return

    # --verify: report-only, then exit
    if args.verify:
        verify_state(base, tokens, provider)
        return

    # Step 1: Set discovery terms (whitelist anon on public_posts)
    print("=== Step 1: Whitelisting anon on public_posts (discovery gate) ===")
    for uname in tokens:
        status, body = set_public_posts_terms(base, uname, tokens[uname])
        note = "ok" if status == 200 else ("already set — ok" if status == 409 else f"FAILED: {body}")
        print(f"  {uname}: POST /{uname}/services {status} ({note})")
    print()

    # Step 2: Register public-ledger schemas (idempotent: reuse via state file)
    print("=== Step 2: Registering public-ledger schemas (idempotent) ===")
    state = load_state()
    schema_token = tokens[next(iter(tokens))]
    reaction_schema_id = get_or_register_schema(base, schema_token, REACTION_SCHEMA, provider, state)
    comment_schema_id = get_or_register_schema(base, schema_token, COMMENT_SCHEMA, provider, state)
    print(f"  Reaction schema: {reaction_schema_id or 'FAILED'}")
    print(f"  Comment schema:  {comment_schema_id or 'FAILED'}")
    print()

    # Step 3: Set profiles (upsert: update if exists, create if not)
    print("=== Step 3: Setting profiles (upsert) ===")
    for p in PERSONAS:
        uname = p["username"]
        if uname in tokens:
            status, _ = set_profile(base, uname, tokens[uname], p)
            print(f"  {uname}: profile {status}")
    print()

    if args.skip_content:
        print("Content seeding skipped (--skip-content).")
        print("\nTokens saved. Use them to log in as each persona.")
        return

    # Step 4: Cross-follow everyone (idempotent: skip if active, update if stale)
    print("=== Step 4: Cross-following (idempotent) ===")
    usernames = [p["username"] for p in PERSONAS if p["username"] in tokens]
    follow_new = 0
    follow_skip = 0
    for uname in usernames:
        for target in usernames:
            if target != uname:
                s1, _ = add_contact(base, uname, tokens[uname], target, provider)
                s2, b2 = follow_user(base, uname, tokens[uname], target, provider)
                if isinstance(b2, dict) and b2.get("skipped"):
                    follow_skip += 1
                elif s2 == 200:
                    follow_new += 1
        print(f"  {uname}: following {len(usernames) - 1} personas")
    print(f"  ({follow_new} new follows, {follow_skip} already active)")
    print()

    # Step 5: Create posts (idempotent: reuse by origin_id) + fan-out to inbox
    print("=== Step 5: Creating posts (idempotent by origin_id) ===")
    post_ids = {}
    post_new = 0
    post_reused = 0
    for uname, posts in POSTS.items():
        if uname not in tokens:
            continue
        post_ids[uname] = []
        p_new = p_reused = 0
        for idx, post_data in enumerate(posts):
            status, body = create_post(base, uname, tokens[uname], post_data, idx)
            pid = body.get("_id", "") if isinstance(body, dict) else ""
            post_ids[uname].append(pid)
            if isinstance(body, dict) and body.get("skipped"):
                post_reused += 1
                p_reused += 1
            elif status == 200 and pid:
                post_new += 1
                p_new += 1
            else:
                print(f"    ! {uname} post {idx} {status}: {body}")
            # Fan-out to followers' inboxes (idempotent: skip if post_id exists)
            for follower in usernames:
                if follower != uname and follower in tokens:
                    deliver_to_inbox(base, follower, tokens[follower], uname, pid, post_data, provider)
            time.sleep(0.1)
        print(f"  {uname}: {len(post_ids[uname])} posts ({p_new} new, {p_reused} reused)")
    print()

    # Step 6: Reactions -> public ledger (idempotent: skip if target+author+type exists)
    print("=== Step 6: Adding reactions (idempotent) ===")
    reaction_new = 0
    reaction_skip = 0
    if reaction_schema_id:
        for reactor, poster, post_idx, rtype in REACTIONS:
            if reactor in tokens and poster in post_ids and post_idx < len(post_ids[poster]):
                target_id = post_ids[poster][post_idx]
                if target_id:
                    status, body = add_reaction(
                        base, reactor, tokens[reactor], reaction_schema_id,
                        poster, target_id, rtype, provider,
                    )
                    if isinstance(body, dict) and body.get("skipped"):
                        reaction_skip += 1
                    elif status == 200:
                        reaction_new += 1
                    else:
                        print(f"    ! reaction {status}: {body}")
        print(f"  {reaction_new} new reactions, {reaction_skip} already existed")
    else:
        print("  SKIPPED: Reaction schema not registered")
    print()

    # Step 7: Comments -> public ledger (idempotent: skip if target+author+text exists)
    print("=== Step 7: Adding comments (idempotent) ===")
    comment_total = sum(len(v) for v in COMMENTS.values())
    comment_new = 0
    comment_skip = 0
    if comment_schema_id:
        for poster, comments in COMMENTS.items():
            if poster not in post_ids or not post_ids[poster] or not post_ids[poster][0]:
                continue
            target_post_id = post_ids[poster][0]  # comment on the first post
            for commenter, text in comments:
                if commenter in tokens:
                    status, body = add_comment(
                        base, commenter, tokens[commenter], comment_schema_id,
                        poster, target_post_id, text, provider,
                    )
                    if isinstance(body, dict) and body.get("skipped"):
                        comment_skip += 1
                    elif status == 200:
                        comment_new += 1
                    else:
                        print(f"    ! comment {status}: {body}")
        print(f"  {comment_new} new comments, {comment_skip} already existed")
    else:
        print("  SKIPPED: Comment schema not registered")
    print()

    # Step 8: DMs (idempotent: skip if origin_id exists)
    print("=== Step 8: Sending DMs (idempotent by origin_id) ===")
    dm_new = 0
    dm_skip = 0
    for idx, dm in enumerate(DMS):
        frm = dm["from"]
        if frm in tokens:
            status, body = send_dm(base, frm, dm["to"], tokens[frm], dm["message"], provider, idx)
            if isinstance(body, dict) and body.get("skipped"):
                dm_skip += 1
            elif status == 200:
                dm_new += 1
    print(f"  {dm_new} new DMs, {dm_skip} already existed")
    print()

    # Summary
    print("=" * 50)
    print("SEED COMPLETE (idempotent)")
    print("=" * 50)
    print(f"\nAll personas use password: {PASSWORD}")
    print(f"Provider: {provider}  |  Site: {site}")
    print("\nResults (new / already-existed):")
    print(f"  Posts (public_posts): {post_new} new / {post_reused} reused")
    print(f"  Reactions (ledger):   {reaction_new} new / {reaction_skip} existed")
    print(f"  Comments (ledger):    {comment_new} new / {comment_skip} existed")
    print(f"  DMs:                  {dm_new} new / {dm_skip} existed")
    print(f"  Follows:              {follow_new} new / {follow_skip} existed")
    print(
        "\nRe-running this script is a no-op on existing data (skips or upserts).\n"
        "If you see duplicates from prior buggy runs, use --cleanup to remove them:\n"
        "  python3 seed_personas.py --api <url> --cleanup"
    )


if __name__ == "__main__":
    main()