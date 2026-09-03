#!/usr/bin/env python3
"""
Seed 5 persona accounts for live-testing the web10 social platform (v3).

Creates accounts, sets profiles, and posts to the node-default discover group
(the universal public board) so the marketing trending page and the in-app
Discover look alive. Reactions and comments are seeded too, so the board has
real engagement (the trending sort keys off it).

v3 model (groups, not v2 terms/ledger):
  * The discover group `web10.app/groups/web10/discover` is a NODE DEFAULT —
    the node creates it at boot and auto-enrolls every user (including anon).
    A post is public when its author attaches it to this group.
  * Posts live in the `posts` service, attached to the discover group.
  * Reactions/comments live in the `reactions`/`comments` services and point
    at their target post via `ref_value` (the ref pattern). The board's
    engagement counts (get_ref_counts) key off ref_value.

IDEMPOTENT: a local state file (`.seed-state.json`) maps each seeded doc to a
stable key, so re-running skips what's already there. If you WIPE the node,
delete the state file too (or the script will skip docs that no longer exist).

Usage:
    python3 seed_personas.py --api http://api.localhost:6000
    python3 seed_personas.py --api https://api.dev.web10.app
    python3 seed_personas.py --api https://api.dev.web10.app --verify
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

# The node-default universal public board (matches the API's DISCOVER_GROUP_ID
# and the social app's getDiscoverGroupId()). Provider-derived — set in main()
# from the node's provider (the API host). The default below is prod.
DISCOVER_GROUP = "web10.app/groups/web10/discover"

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

# "poster_username": [(commenter, text), ...]
COMMENTS = {
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

# (reactor, poster, post_index_0-based, reaction_type)
REACTIONS = [
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


# ── v3 API helpers ───────────────────────────────────────────────────────────


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
    """Signup is idempotent: an existing user (EXISTS) is success."""
    if status == 200:
        return False
    text = str(body).lower()
    return "already exist" in text or "reserved" in text or "exists" in text


# ── State file (idempotency) ─────────────────────────────────────────────────


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


def state_key(provider, kind, *parts):
    return f"{provider}:{kind}:{':'.join(parts)}"


# ── v3 write helpers ─────────────────────────────────────────────────────────


def signup(base, persona):
    return api(base, "POST", "/v3/signup", {
        "username": persona["username"],
        "password": PASSWORD,
    })


def login(base, username, site):
    status, body = api(base, "POST", "/v3/login", {
        "username": username,
        "password": PASSWORD,
        "site": site,
    })
    token = body.get("token") if isinstance(body, dict) else None
    return status, token, body


def set_profile(base, username, token, persona, state, provider):
    """Create the persona's profile doc (service `profile`). Idempotent via
    the state file."""
    key = state_key(provider, "profile", username)
    if key in state:
        return 200, {"skipped": True}
    status, body = api(base, "POST", "/v3/create", {
        "token": token,
        "service": "profile",
        "body": {
            "display_name": persona["display_name"],
            "bio": persona["bio"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    })
    if status == 200 and isinstance(body, dict) and body.get("doc_id"):
        state[key] = body["doc_id"]
        save_state(state)
    return status, body


def create_post(base, username, token, post_data, idx, state, provider):
    """Post to the discover group (service `posts`). Idempotent via the state
    file keyed by (username, idx)."""
    key = state_key(provider, "post", username, f"{idx:02d}")
    if key in state:
        return 200, {"skipped": True, "doc_id": state[key]}
    status, body = api(base, "POST", "/v3/create", {
        "token": token,
        "service": "posts",
        "body": {
            "text": post_data["text"],
            "tags": post_data["tags"],
            "origin": "web10",
            "origin_id": f"seed-{username}-{idx:02d}",
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        "groups": [DISCOVER_GROUP],
    })
    if status == 200 and isinstance(body, dict) and body.get("doc_id"):
        state[key] = body["doc_id"]
        save_state(state)
    return status, body


def add_reaction(base, reactor, token, poster, post_doc_id, reaction_type, state, provider, idx):
    """A reaction in the `reactions` service pointing at the post via ref_value."""
    key = state_key(provider, "reaction", reactor, poster, f"{idx:02d}", reaction_type)
    if key in state:
        return 200, {"skipped": True}
    status, body = api(base, "POST", "/v3/create", {
        "token": token,
        "service": "reactions",
        "body": {
            "type": reaction_type,
            "target_service": "posts",
            "target_id": post_doc_id,
            "author_username": reactor,
        },
        "groups": [DISCOVER_GROUP],
        "ref_value": post_doc_id,
    })
    if status == 200 and isinstance(body, dict) and body.get("doc_id"):
        state[key] = body["doc_id"]
        save_state(state)
    return status, body


def add_comment(base, commenter, token, poster, post_doc_id, text, state, provider, idx):
    """A comment in the `comments` service pointing at the post via ref_value."""
    key = state_key(provider, "comment", commenter, poster, f"{idx:02d}")
    if key in state:
        return 200, {"skipped": True}
    status, body = api(base, "POST", "/v3/create", {
        "token": token,
        "service": "comments",
        "body": {
            "text": text,
            "target_service": "posts",
            "target_id": post_doc_id,
            "author_username": commenter,
        },
        "groups": [DISCOVER_GROUP],
        "ref_value": post_doc_id,
    })
    if status == 200 and isinstance(body, dict) and body.get("doc_id"):
        state[key] = body["doc_id"]
        save_state(state)
    return status, body


def read_board(base, limit=100):
    """Read the public board (anon-readable). The board is the discover group,
    read through the normal group-read path (no token). Returns the posts."""
    status, body = api(base, "POST", "/v3/read", {
        "service": "posts",
        "groups": [DISCOVER_GROUP],
        "limit": limit,
    })
    if status == 200 and isinstance(body, list):
        return body
    return []


def verify_state(base, tokens, provider):
    """Report the current board state (no writes)."""
    board = read_board(base)
    print(f"=== VERIFY: public board has {len(board)} post(s) ===")
    for p in board:
        body = p.get("body") or {}
        print(f"  [{p['author_key']}] {body.get('text', '')[:60]!r}")
    # Per-persona post counts
    print("\nPer-persona post counts (on the board):")
    counts = {}
    for p in board:
        counts[p["author_key"]] = counts.get(p["author_key"], 0) + 1
    for p in PERSONAS:
        print(f"  {p['username']}: {counts.get(p['username'], 0)}")


def main():
    parser = argparse.ArgumentParser(description="Seed persona accounts for web10 social testing (v3)")
    parser.add_argument("--api", default="http://api.localhost:6000", help="API base URL")
    parser.add_argument("--provider", default=None, help="Override node provider (default: derived from --api host)")
    parser.add_argument("--site", default=None, help="Override login site (default: social.<api-host>)")
    parser.add_argument("--skip-content", action="store_true", help="Only create accounts + profiles, skip posts/reactions/comments")
    parser.add_argument("--verify", action="store_true", help="Report current board state (no writes), then exit")
    args = parser.parse_args()

    base = args.api.rstrip("/")
    provider = args.provider or derive_provider(base)
    global DISCOVER_GROUP
    DISCOVER_GROUP = f"{provider}/groups/web10/discover"
    site = args.site or derive_site(base)
    state = load_state()
    print(f"Target API: {base}")
    print(f"Provider:   {provider}")
    print(f"Login site: {site}")
    print(f"Discover:   {DISCOVER_GROUP}")
    print(f"Personas:   {len(PERSONAS)}")
    print()

    # Signup + login all personas
    print("=== Signup + login ===")
    tokens = {}
    for p in PERSONAS:
        uname = p["username"]
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

    if args.verify:
        verify_state(base, tokens, provider)
        return

    # Step 1: profiles
    print("=== Step 1: profiles ===")
    for p in PERSONAS:
        uname = p["username"]
        status, body = set_profile(base, uname, tokens[uname], p, state, provider)
        print(f"  {uname}: profile {'skipped' if isinstance(body, dict) and body.get('skipped') else status}")
    print()

    if args.skip_content:
        print("--skip-content: stopping after accounts + profiles.")
        return

    # Step 2: posts to the discover group
    print("=== Step 2: posts to the discover group ===")
    created_posts = 0
    for p in PERSONAS:
        uname = p["username"]
        for idx, post in enumerate(POSTS.get(uname, [])):
            status, body = create_post(base, uname, tokens[uname], post, idx, state, provider)
            if isinstance(body, dict) and body.get("skipped"):
                continue
            created_posts += 1
            time.sleep(0.05)
        print(f"  {uname}: {len(POSTS.get(uname, []))} posts")
    print(f"  ({created_posts} new post(s) created)")
    print()

    # Step 3: reactions + comments (engagement for the trending sort)
    print("=== Step 3: reactions + comments ===")
    created_engagement = 0
    for reactor, poster, post_idx, rtype in REACTIONS:
        if reactor not in tokens or poster not in tokens:
            continue
        post_doc_id = state.get(state_key(provider, "post", poster, f"{post_idx:02d}"))
        if not post_doc_id:
            continue
        status, body = add_reaction(base, reactor, tokens[reactor], poster, post_doc_id, rtype, state, provider, post_idx)
        if not (isinstance(body, dict) and body.get("skipped")):
            created_engagement += 1
    for poster, comments in COMMENTS.items():
        if poster not in tokens:
            continue
        for idx, (commenter, text) in enumerate(comments):
            if commenter not in tokens:
                continue
            # Comments target the poster's first post (index 0) by default.
            post_doc_id = state.get(state_key(provider, "post", poster, "00"))
            if not post_doc_id:
                continue
            status, body = add_comment(base, commenter, tokens[commenter], poster, post_doc_id, text, state, provider, idx)
            if not (isinstance(body, dict) and body.get("skipped")):
                created_engagement += 1
    print(f"  ({created_engagement} new reaction/comment(s) created)")
    print()

    # Summary
    board = read_board(base)
    print(f"=== DONE: public board now has {len(board)} post(s) ===")
    print(f"  All personas use password: {PASSWORD}")
    print(f"  State file: {STATE_FILE}")


if __name__ == "__main__":
    main()
