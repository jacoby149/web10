#!/usr/bin/env python3
"""
Seed 5 persona accounts for live testing the web10 social platform.
Creates accounts, sets profiles, establishes cross-follows, and seeds
content that actually reaches the discovery feed.

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
"""

import argparse
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

PERSONAS = [
    {
        "username": "solar-flare-69",
        "display_name": "Solar Flare",
        "bio": "Podcast host. Crypto degenerate. I will talk for 4 hours about anything. New episode every day at 3am because sleep is for weak chains. 🚀🌞",
    },
    {
        "username": "noodle-empress",
        "display_name": "Noodle Empress",
        "bio": "Ramen snob with a $12 bowl budget. If it's got broth, I'll eat it. 3am food pics are a feature, not a bug. 🍜✨",
    },
    {
        "username": "void-walker",
        "display_name": "Void Walker",
        "bio": "Reading Camus in a candlelit room at 2am. Dark academia is not an aesthetic, it's a lifestyle. Also I like cats. 📚🖤",
    },
    {
        "username": "butterfly-mechanic",
        "display_name": "Butterfly Mechanic",
        "bio": "Fixing bugs and butterflies since 2019. Workshop pics, DIY tutorials, and zero patience for people who don't label their cables. 🦋🔧",
    },
    {
        "username": "disco-donkey",
        "display_name": "Disco Donkey",
        "bio": "Professional chaos agent. If you're not laughing, you're doing it wrong. Dance memes only. No thoughts, just vibes. 🫏🕺",
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
    ],
    "noodle-empress": [
        {
            "text": "Found a ramen shop that doesn't show up on Google Maps. The owner is a 78 year old man who has been making the same broth for 50 years. I cried. Into the bowl. 🍜",
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
    ],
    "void-walker": [
        {
            "text": "\"Man is nothing else but what he makes of himself.\" — Sartre. Reading this at 2:47am with a cup of black coffee and a cat named Camus on my lap. This is the life. 📖",
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
    ],
    "butterfly-mechanic": [
        {
            "text": "Fixed a 1998 Honda Civic today. The mechanic shop quoted $800. I did it for $47 in parts and 3 hours of swearing. The car runs better than it has in a decade. This is why I don't trust mechanic shops. 🔧",
            "tags": ["diy", "cars", "workshop"],
        },
        {
            "text": "Built a butterfly enclosure in my backyard. Released 12 Monarch butterflies this morning. Watching them take flight for the first time is the most peaceful thing I've ever witnessed. Also my neighbor thinks I'm weird. Worth it. 🦋",
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
    ],
    "disco-donkey": [
        {
            "text": "Just danced to 'Stayin' Alive' in the middle of a grocery store. The cashier gave me a look. I gave her a beat. She joined in. We got kicked out. Best shopping trip ever. 🕺🛒",
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
            "text": "Life hack: if you're having a bad day, put on 'Dancing Queen' and dance like nobody's watching. Then check your phone and realize everyone IS watching because you live with roommates. Still worth it. 👑💃",
            "tags": ["life-hacks", "abba", "chaos"],
        },
    ],
}

COMMENTS = {
    # "poster_username": [commenter, text]
    "solar-flare-69": [
        ("noodle-empress", "I fall asleep during podcasts too but at least I have ramen as a snack 🍜"),
        ("disco-donkey", "47 MINUTES?? That's like 3 dance songs. You need to tighten the show up my friend 🕺"),
        ("void-walker", "Sartre would have something to say about performative intellectualism in podcast culture. Just saying."),
    ],
    "noodle-empress": [
        ("butterfly-mechanic", "That unmarked shop sounds amazing. I once found a ramen place by following the smell. Worked every time."),
        ("solar-flare-69", "I'd have this on my podcast. The man has been making broth for 50 years. That's the kind of dedication I talk about."),
        ("disco-donkey", "3am cooking is my love language too but I'm usually just making cereal at that hour 🫏"),
    ],
    "void-walker": [
        ("noodle-empress", "Camus the cat is the best thing I've read all week. Please tell me he's still alive (unlike Nietzsche the plant)"),
        ("butterfly-mechanic", "There's something darkly poetic about naming a plant after a philosopher who wrote about the death of God. Respect. 🦋"),
        ("disco-donkey", "I read the library book you recommended. It was in a language I don't know. I liked the pictures though. 10/10 would be confused again 📚"),
    ],
    "butterfly-mechanic": [
        ("solar-flare-69", "$47 vs $800? That's the kind of ROI I talk about on the show. You're out here building real value."),
        ("void-walker", "The care a craftsman puts into a tool is the same care a writer puts into a sentence. Both are acts of love for the work. Beautiful post."),
        ("disco-donkey", "I tried to fix my toaster once. Now I just buy new bread. We all have our limits 🔧🍞"),
    ],
    "disco-donkey": [
        ("noodle-empress", "Getting kicked out of a grocery store for dancing is the most iconic thing I've ever heard. You're a legend 🫏💃"),
        ("solar-flare-69", "This energy is exactly what the creator economy needs. Unfiltered, authentic, zero apologies. You're gonna blow up."),
        ("void-walker", "In a world of curated perfection, your chaotic authenticity is refreshingly absurd. Camus would approve. 📖"),
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
]

REACTIONS = [
    # (reactor, poster, post_index_0-based, reaction_type)
    ("noodle-empress", "solar-flare-69", 0, "❤️"),
    ("disco-donkey", "solar-flare-69", 4, "🔥"),
    ("void-walker", "noodle-empress", 0, "❤️"),
    ("butterfly-mechanic", "noodle-empress", 1, "🔥"),
    ("solar-flare-69", "void-walker", 0, "🧠"),
    ("disco-donkey", "void-walker", 4, "❤️"),
    ("noodle-empress", "butterfly-mechanic", 0, "🔥"),
    ("void-walker", "butterfly-mechanic", 3, "❤️"),
    ("solar-flare-69", "disco-donkey", 0, "🔥"),
    ("butterfly-mechanic", "disco-donkey", 2, "❤️"),
    ("noodle-empress", "disco-donkey", 4, "💃"),
    ("void-walker", "disco-donkey", 1, "❤️"),
    ("disco-donkey", "noodle-empress", 0, "🍜"),
    ("butterfly-mechanic", "noodle-empress", 2, "🔥"),
    ("solar-flare-69", "void-walker", 3, "🧠"),
    ("noodle-empress", "butterfly-mechanic", 1, "🦋"),
    ("void-walker", "solar-flare-69", 2, "❤️"),
    ("disco-donkey", "butterfly-mechanic", 4, "🔧"),
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
    return api(base, "POST", f"/{username}/profile", {
        "token": token,
        "query": {
            "display_name": persona["display_name"],
            "bio": persona["bio"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    })


def create_post(base, username, token, post_data):
    return api(base, "POST", f"/{username}/{POST_SERVICE}", {
        "token": token,
        "query": {
            **post_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "visibility": "public",
            "origin": "web10",
        },
    })


def post_target_key(username, post_id):
    """The ledger target the discovery engine reads for engagement."""
    return f"{username}/{POST_SERVICE}/{post_id}"


def add_contact(base, username, token, target_username, provider):
    return api(base, "POST", f"/{username}/contacts", {
        "token": token,
        "query": {
            "username": target_username,
            "provider": provider,
            "added_at": datetime.now(timezone.utc).isoformat(),
        },
    })


def follow_user(base, username, token, target_username, provider):
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
    """Fan-out: write an inbox record to the target user's inbox."""
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


def send_dm(base, from_user, to_user, token, message, provider):
    """DMs live in a single `dms` service (see web10-social dms.ts) with
    sender/recipient fields — not a per-conversation service. The message is
    written to the sender's own collection, matching the app's sendDm()."""
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
        },
    })


def add_reaction(base, reactor, token, schema_id, poster, post_id, reaction_type, provider):
    """Write a reaction to the public ledger via POST /public/entries."""
    return api(base, "POST", "/public/entries", {
        "token": token,
        "query": {
            "schema_id": schema_id,
            "target": post_target_key(poster, post_id),
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
    """Write a comment to the public ledger via POST /public/entries."""
    return api(base, "POST", "/public/entries", {
        "token": token,
        "query": {
            "schema_id": schema_id,
            "target": post_target_key(poster, post_id),
            "payload": {
                "text": text,
                "target": post_id,
                "action": "comment",
                "author_username": commenter,
                "author_provider": provider,
            },
        },
    })


def main():
    parser = argparse.ArgumentParser(description="Seed persona accounts for web10 social testing")
    parser.add_argument("--api", default="http://api.localhost:6000", help="API base URL")
    parser.add_argument("--provider", default=None, help="Override node provider (default: derived from --api host)")
    parser.add_argument("--site", default=None, help="Override login site (default: social.<api-host>)")
    parser.add_argument("--skip-content", action="store_true", help="Only create accounts, skip posts/DMs/comments")
    args = parser.parse_args()

    base = args.api.rstrip("/")
    provider = args.provider or derive_provider(base)
    site = args.site or derive_site(base)
    print(f"Target API: {base}")
    print(f"Provider:   {provider}")
    print(f"Login site: {site}")
    print(f"Personas:   {len(PERSONAS)}")
    print()

    # Step 1: Create accounts (idempotent: existing user == success)
    print("=== Step 1: Creating accounts ===")
    for p in PERSONAS:
        uname = p["username"]
        status, body = signup(base, p)
        if status == 200:
            print(f"  {uname}: signup 200")
        elif _is_already_exists(status, body):
            print(f"  {uname}: signup {status} (already exists — ok)")
        else:
            print(f"  {uname}: signup {status} FAILED: {body}")
        time.sleep(0.2)

    # Step 2: Login all personas
    print("\n=== Step 2: Logging in ===")
    tokens = {}
    for p in PERSONAS:
        uname = p["username"]
        status, token, body = login(base, uname, site)
        if token:
            tokens[uname] = token
            print(f"  {uname}: web10token {status} (token acquired)")
        else:
            print(f"  {uname}: web10token {status} FAILED: {body}")
    print()

    if not tokens:
        print("ERROR: No tokens obtained. Check API connectivity and credentials.")
        sys.exit(1)

    # Step 3: Set discovery terms (whitelist anon on public_posts)
    print("=== Step 3: Whitelisting anon on public_posts (discovery gate) ===")
    for uname in tokens:
        status, body = set_public_posts_terms(base, uname, tokens[uname])
        # 409 = DUPLICATE_SERVICE: the anon-whitelist term already exists.
        note = "ok" if status == 200 else ("already set — ok" if status == 409 else f"FAILED: {body}")
        print(f"  {uname}: POST /{uname}/services {status} ({note})")
    print()

    # Step 4: Register public-ledger schemas (Reaction, Comment)
    print("=== Step 4: Registering public-ledger schemas ===")
    schema_token = tokens[next(iter(tokens))]
    r_status, reaction_schema_id, r_body = register_schema(base, schema_token, REACTION_SCHEMA)
    c_status, comment_schema_id, c_body = register_schema(base, schema_token, COMMENT_SCHEMA)
    print(f"  Reaction: /schemas/register {r_status} -> {reaction_schema_id or r_body}")
    print(f"  Comment:  /schemas/register {c_status} -> {comment_schema_id or c_body}")
    print()

    # Step 5: Set profiles
    print("=== Step 5: Setting profiles ===")
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

    # Step 6: Cross-follow everyone
    print("=== Step 6: Cross-following ===")
    usernames = [p["username"] for p in PERSONAS if p["username"] in tokens]
    follow_ok = 0
    for uname in usernames:
        for target in usernames:
            if target != uname:
                s1, _ = add_contact(base, uname, tokens[uname], target, provider)
                s2, _ = follow_user(base, uname, tokens[uname], target, provider)
                if s1 == 200 and s2 == 200:
                    follow_ok += 1
        print(f"  {uname}: following {len(usernames) - 1} personas")
    print(f"  ({follow_ok} follow+contact pairs 200)")
    print()

    # Step 7: Create posts (in public_posts) + fan-out to follower inboxes
    print("=== Step 7: Creating posts ===")
    post_ids = {}
    post_ok = 0
    for uname, posts in POSTS.items():
        if uname not in tokens:
            continue
        post_ids[uname] = []
        for post_data in posts:
            status, body = create_post(base, uname, tokens[uname], post_data)
            pid = body.get("_id", "") if isinstance(body, dict) else ""
            post_ids[uname].append(pid)
            if status == 200 and pid:
                post_ok += 1
            else:
                print(f"    ! {uname} post {status}: {body}")
            for follower in usernames:
                if follower != uname and follower in tokens:
                    deliver_to_inbox(base, follower, tokens[follower], uname, pid, post_data, provider)
            time.sleep(0.15)
        got = sum(1 for x in post_ids[uname] if x)
        print(f"  {uname}: {got}/{len(posts)} posts created (public_posts)")
    print(f"  ({post_ok} posts returned 200 + _id)")
    print()

    # Step 8: Reactions -> public ledger
    print("=== Step 8: Adding reactions (public ledger) ===")
    reaction_ok = 0
    if reaction_schema_id:
        for reactor, poster, post_idx, rtype in REACTIONS:
            if reactor in tokens and poster in post_ids and post_idx < len(post_ids[poster]):
                target_id = post_ids[poster][post_idx]
                if target_id:
                    status, body = add_reaction(
                        base, reactor, tokens[reactor], reaction_schema_id, poster, target_id, rtype, provider
                    )
                    if status == 200:
                        reaction_ok += 1
                    else:
                        print(f"    ! reaction {status}: {body}")
        print(f"  {reaction_ok}/{len(REACTIONS)} reactions posted (200)")
    else:
        print("  SKIPPED: Reaction schema not registered")
    print()

    # Step 9: Comments -> public ledger
    print("=== Step 9: Adding comments (public ledger) ===")
    comment_total = sum(len(v) for v in COMMENTS.values())
    comment_ok = 0
    if comment_schema_id:
        for poster, comments in COMMENTS.items():
            if poster not in post_ids or not post_ids[poster] or not post_ids[poster][0]:
                continue
            target_post_id = post_ids[poster][0]  # comment on the first post
            for commenter, text in comments:
                if commenter in tokens:
                    status, body = add_comment(
                        base, commenter, tokens[commenter], comment_schema_id, poster, target_post_id, text, provider
                    )
                    if status == 200:
                        comment_ok += 1
                    else:
                        print(f"    ! comment {status}: {body}")
        print(f"  {comment_ok}/{comment_total} comments posted (200)")
    else:
        print("  SKIPPED: Comment schema not registered")
    print()

    # Step 10: DMs
    print("=== Step 10: Sending DMs ===")
    dm_ok = 0
    for dm in DMS:
        frm = dm["from"]
        if frm in tokens:
            status, _ = send_dm(base, frm, dm["to"], tokens[frm], dm["message"], provider)
            if status == 200:
                dm_ok += 1
    print(f"  {dm_ok}/{len(DMS)} DMs sent (200)")
    print()

    # Summary
    print("=" * 50)
    print("SEED COMPLETE!")
    print("=" * 50)
    print(f"\nAll personas use password: {PASSWORD}")
    print(f"Provider: {provider}  |  Site: {site}")
    print("\nResults:")
    print(f"  Posts (public_posts): {post_ok} created with _id")
    print(f"  Reactions (ledger):   {reaction_ok}/{len(REACTIONS)}")
    print(f"  Comments (ledger):    {comment_ok}/{comment_total}")
    print(f"  DMs:                  {dm_ok}/{len(DMS)}")
    print(f"  Cross-follows:        {follow_ok}/{len(usernames) * (len(usernames) - 1)}")
    print(
        "\nNote: if the discovery feed (PATCH /discover/posts) is empty right\n"
        "after seeding, confirm the node's discovery read path is healthy — the\n"
        "writes above are what this seeder guarantees."
    )


if __name__ == "__main__":
    main()