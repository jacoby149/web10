#!/usr/bin/env python3
"""
outreach_sourcer.py — YouTube Data API v3 prospect sourcer

Searches YouTube for creators who publicly complained about demonetization,
shadowbanning, algorithm suppression, etc. Filters to the 100k-500k
subscriber band per outreach.md §1 qualification gate.

Usage:
    export YOUTUBE_API_KEY="your_key_here"
    python3 outreach_sourcer.py              # all queries, default limits
    python3 outreach_sourcer.py --query "I got demonetized" --max-channels 50
    python3 outreach_sourcer.py --output prospects.jsonl

Free tier: 10,000 quota units/day. Each search ~100u, each channel lookup ~1u.
"""

import argparse
import json
import os
import ssl
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = None

API_BASE = "https://www.googleapis.com/youtube/v3"

# outreach.md §1 sourcing queries — conservative set to preserve quota
# Each search ≈ 100u, each channel lookup ≈ 1u, each video stats ≈ 1u
# Free tier: 10,000u/day. Target: ~2k-3k for a focused run.
DEFAULT_QUERIES = [
    "I got demonetized",
    "youtube demonetized me",
    "my channel is dying",
    "why i left youtube",
    "youtube terminated my channel",
    "youtube monetization revoked",
    "youtube strike",
]

# M0 fit assessment: M0 serves photo/text/community-first creators.
# YES = content that naturally lives as photo/text/community
# POOR = pure-video formats with no text equivalent
# PARTIAL = mixed; some content translates, some doesn't
M0_YES_SIGNALS = [
    "recipe", "cooking", "food", "diet", "keto", "carnivore", "meal",
    "craft", "diy", "homemade", "homemaking", "knit", "sew", "paint",
    "fashion", "style", "thrif", "outfit", "wardrobe",
    "tutorial", "how to", "learn", "education", "analytics", "data",
    "tableau", "excel", "sql", "programming", "code",
    "photography", "photo", "illustration", "drawing", "art",
    "lifestyle", "home decor", "interior", "garden", "plant",
    "travel", "guide", "tips", "review",
    "podcast", "show notes", "interview",
    "book", "reading", "literature", "essay", "writing",
    "fitness", "workout", "yoga", "health", "nutrition",
    "finance", "investing", "crypto", "business", "economics",
    "newsletter", "blog", "text", "community", "forum",
    "substack", "patreon", "skool", "whop",
]
M0_POOR_SIGNALS = [
    "gaming", "gameplay", "warzone", "roblox", "minecraft", "fortnite",
    "reaction", "react to", "reacting",
    "music video", "cover song", "remix", "dj",
    "sports highlight", "esports",
    "prank", "challenge", "stunt",
    "vlog", "daily vlog", "day in my life",  # pure video diary
    "animation", "animated",  # video-only medium
    "cinematic", "film", "movie",
    "ai-generated visuals", "ai video",
]


def assess_m0_fit(title: str, description: str) -> str:
    """Assess whether a creator's content format fits M0 (photo/text/community-first)."""
    text = (title + " " + description).lower()
    yes_score = sum(1 for s in M0_YES_SIGNALS if s in text)
    poor_score = sum(1 for s in M0_POOR_SIGNALS if s in text)

    if yes_score >= 2:
        return "YES"
    if yes_score >= 1 and poor_score == 0:
        return "YES"
    if poor_score >= 2:
        return "POOR"
    if poor_score >= 1 and yes_score == 0:
        return "POOR"
    return "PARTIAL"
BURN_PATTERNS = [
    "i got", "i've got", "my channel", "my video", "my content",
    "i was banned", "i got banned", "they banned", "got demonetized",
    "got terminated", "got suspended", "got struck", "lost monetization",
    "lost my channel", "lost revenue", "youtube killed", "youtube banned me",
    "youtube terminated", "youtube suspended", "youtube struck",
    "why i left", "why i'm leaving", "leaving youtube",
    "channel dying", "channel is dying", "channel died",
    "adpocalypse", "age restricted my", "shadowbanned",
    "revoked my", "removed my",
]

# Patterns that indicate FALSE POSITIVES (discussing someone else's burn, news, reaction, or NOT YouTube-related)
FALSE_POSITIVE_PATTERNS = [
    "reaction", "explained", "why youtube", "how youtube",
    "what happened to", "the story of", "documentary", "investigated",
    "celebrities", "news update", "breaking news", "top 10",
    "are reaction channels", "is youtube", "why are channels",
    "support of", "in support",
    # Not YouTube burns: gaming, other platforms
    "shadowbanned in", "shadowbanned on", "got me shadowbanned",
    "try this", "how to fix", "how to get", "tips", "guide",
    "your favorite animator",  # third-party reference
]

# Quota tracking
quota_used = 0

# Qualification band from outreach.md §1
MIN_SUBS = 100_000
MAX_SUBS = 500_000

# Only recent videos (last 6 months) so the burn is fresh
DAYS_BACK = 180


def api_call(endpoint: str, params: dict) -> dict:
    """Make a single YouTube API call with retry on rate-limit and quota tracking."""
    global quota_used
    params["key"] = os.environ["YOUTUBE_API_KEY"]
    url = f"{API_BASE}/{endpoint}?{urlencode(params)}"

    # Estimate quota cost: search=100u, others=1u per item
    if endpoint == "search":
        quota_used += 100
    else:
        quota_used += 1  # base cost

    for attempt in range(3):
        try:
            req = Request(url, headers={"User-Agent": "web10-outreach-sourcer/1.0"})
            with urlopen(req, timeout=30, context=SSL_CTX) as resp:
                data = json.loads(resp.read())
                if "error" in data:
                    err = data["error"]["message"]
                    if "quota" in err.lower():
                        print(f"  ❌ QUOTA EXCEEDED ({quota_used}u used). Stop to avoid overage.", file=sys.stderr)
                        return {}
                    print(f"  ❌ API error: {err}", file=sys.stderr)
                    return {}
                # Track actual items returned for accurate quota
                if "items" in data:
                    quota_used += len(data["items"])  # 1u per item for non-search
                return data
        except HTTPError as e:
            if e.code == 429 and attempt < 2:
                wait = 60 * (attempt + 1)
                print(f"  ⚠ rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            print(f"  ❌ HTTP {e.code}: {e.reason}", file=sys.stderr)
            return {}
        except URLError as e:
            print(f"  ❌ URL error: {e.reason}", file=sys.stderr)
            return {}
        except Exception as e:
            print(f"  ❌ Unexpected: {e}", file=sys.stderr)
            return {}
    return {}


def search_videos(query: str, max_results: int = 50, days_back: int = DAYS_BACK) -> list[dict]:
    """Search YouTube for videos matching a query (recent, uploaded order)."""
    results = []
    after_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00Z")

    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "order": "relevance",
        "publishedAfter": after_date,
        "maxResults": min(max_results, 50),
        "safeSearch": "none",
    }

    print(f"  searching: \"{query}\" (since {after_date[:10]})")
    data = api_call("search", params)
    if not data:
        return results

    for item in data.get("items", []):
        vid = item["id"].get("videoId")
        results.append({
            "videoId": vid,
            "title": item["snippet"]["title"],
            "publishedAt": item["snippet"]["publishedAt"],
            "channelId": item["snippet"]["channelId"],
            "channelTitle": item["snippet"]["channelTitle"],
        })

    # Paginate if needed
    while len(results) < max_results and "nextPageToken" in data:
        params["pageToken"] = data["nextPageToken"]
        data = api_call("search", params)
        if not data:
            break
        for item in data.get("items", []):
            vid = item["id"].get("videoId")
            results.append({
                "videoId": vid,
                "title": item["snippet"]["title"],
                "publishedAt": item["snippet"]["publishedAt"],
                "channelId": item["snippet"]["channelId"],
                "channelTitle": item["snippet"]["channelTitle"],
            })
        if len(results) >= max_results:
            break

    return results


def get_channel_stats(channel_ids: list[str]) -> dict[str, dict]:
    """Fetch subscriber count, view count, and description for channels."""
    stats = {}
    batch_size = 50

    for i in range(0, len(channel_ids), batch_size):
        batch = channel_ids[i:i + batch_size]
        data = api_call("channels", {
            "part": "snippet,statistics,brandingSettings",
            "id": ",".join(batch),
        })
        if not data:
            continue
        for ch in data.get("items", []):
            cid = ch["id"]
            stats[cid] = {
                "channelId": cid,
                "title": ch["snippet"]["title"],
                "customUrl": ch["snippet"].get("customUrl", ""),
                "description": (ch["snippet"].get("description", "") or "")[:500],
                "subscriberCount": int(ch["statistics"].get("subscriberCount", 0)),
                "viewCount": int(ch["statistics"].get("viewCount", 0)),
                "videoCount": int(ch["statistics"].get("videoCount", 0)),
                "publishedAt": ch["snippet"].get("publishedAt", ""),
                "thumbnails": ch["snippet"].get("thumbnails", {}).get("default", {}).get("url", ""),
            }
    return stats


def get_video_stats(video_ids: list[str]) -> dict[str, dict]:
    """Fetch view count, like count for specific videos."""
    stats = {}
    batch_size = 50

    for i in range(0, len(video_ids), batch_size):
        batch = video_ids[i:i + batch_size]
        data = api_call("videos", {
            "part": "statistics,snippet,contentDetails",
            "id": ",".join(batch),
        })
        if not data:
            continue
        for v in data.get("items", []):
            stats[v["id"]] = {
                "videoId": v["id"],
                "title": v["snippet"]["title"],
                "publishedAt": v["snippet"]["publishedAt"],
                "viewCount": int(v["statistics"].get("viewCount", 0)),
                "likeCount": int(v["statistics"].get("likeCount", 0)),
                "commentCount": int(v["statistics"].get("commentCount", 0)),
                "duration": v["contentDetails"].get("duration", ""),
                "tags": v["snippet"].get("tags", []),
            }
    return stats


def infer_segment(title: str, description: str) -> str:
    """Rough segment guess from video title + channel description. Very heuristic."""
    text = (title + " " + description).lower()

    right_signals = [
        "conservative", "right", "woke", "censorship", "cancel culture",
        "msm", "mainstream media", "leftist", "socialist", "marxist",
        "degenerate", "gender ideology", "critical race",
    ]
    left_signals = [
        "lgbtq", "trans", "feminist", "social justice", "racism",
        "misogyny", "conservative", "trump", "maga", "far right",
        "misinformation", "hate speech", "activism", "protest",
    ]
    wildcard_signals = [
        "fitness", "gaming", "art", "music", "cooking", "food",
        "finance", "crypto", "investing", "skool", "whop", "patreon",
        "substack", "community", "course", "membership", "education",
        "travel", "diy", "craft", "photography", "tech", "programming",
    ]

    right_score = sum(1 for s in right_signals if s in text)
    left_score = sum(1 for s in left_signals if s in text)
    wildcard_score = sum(1 for s in wildcard_signals if s in text)

    scores = {"right-coded": right_score, "left-coded": left_score, "wildcard": wildcard_score}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "uncertain"


def is_real_burn(title: str) -> bool:
    """Check if a video title indicates the creator's OWN burn event (not just discussing it)."""
    t = title.lower()

    # Hard reject: clearly not about the creator's own experience
    for fp in FALSE_POSITIVE_PATTERNS:
        if fp in t:
            return False

    # Must match at least one burn pattern
    return any(bp in t for bp in BURN_PATTERNS)


def main():
    parser = argparse.ArgumentParser(description="YouTube outreach prospect sourcer")
    parser.add_argument("--query", "-q", nargs="+", default=None,
                        help="Search queries (default: all built-in queries)")
    parser.add_argument("--max-channels", "-n", type=int, default=100,
                        help="Max unique channels to collect per query (default: 100)")
    parser.add_argument("--min-subs", type=int, default=MIN_SUBS,
                        help=f"Min subscribers (default: {MIN_SUBS:,})")
    parser.add_argument("--max-subs", type=int, default=MAX_SUBS,
                        help=f"Max subscribers (default: {MAX_SUBS:,})")
    parser.add_argument("--output", "-o", type=str, default=None,
                        help="Output JSONL file (default: stdout)")
    parser.add_argument("--json", action="store_true",
                        help="Output raw JSON array instead of formatted text")
    parser.add_argument("--max-target", "-t", type=int, default=20,
                        help="Stop once we have N qualified prospects (default: 20)")
    parser.add_argument("--max-quota", type=int, default=5000,
                        help="Stop at N quota units used (default: 5000, free tier is 10000/day)")
    parser.add_argument("--days-back", type=int, default=DAYS_BACK,
                        help=f"Only videos from last N days (default: {DAYS_BACK})")
    args = parser.parse_args()

    if not os.environ.get("YOUTUBE_API_KEY"):
        print("❌ Set YOUTUBE_API_KEY environment variable.", file=sys.stderr)
        print("   Get a free key: https://console.cloud.google.com/apis/credentials", file=sys.stderr)
        sys.exit(1)

    queries = args.query or DEFAULT_QUERIES

    print(f"🔍 YouTube Outreach Sourcer")
    print(f"   Queries: {len(queries)}")
    print(f"   Sub band: {args.min_subs:,} – {args.max_subs:,}")
    print(f"   Target: {args.max_target} qualified prospects")
    print(f"   Quota limit: {args.max_quota:,}u (free tier: 10,000u/day)")
    print(f"   Videos since: {(datetime.now(timezone.utc) - timedelta(days=args.days_back)).strftime('%Y-%m-%d')}")
    print()

    # Phase 1: search videos for each query
    all_videos = []
    seen_vids = set()
    for q in queries:
        if quota_used >= args.max_quota:
            print(f"\n⚠ Quota limit reached ({quota_used}u). Stopping searches.")
            break
        vids = search_videos(q, max_results=min(args.max_channels, 25), days_back=args.days_back)
        for v in vids:
            if v["videoId"] not in seen_vids:
                seen_vids.add(v["videoId"])
                v["_query"] = q
                all_videos.append(v)

    print(f"\n📹 Found {len(all_videos)} unique videos across {len(queries)} queries")

    if not all_videos:
        print("No results. Check API key and try broader queries.")
        sys.exit(0)

    # Phase 2: get channel stats for unique channels
    unique_channels = list(set(v["channelId"] for v in all_videos))
    print(f"📊 Fetching stats for {len(unique_channels)} unique channels...")
    channel_stats = get_channel_stats(unique_channels)

    # Phase 2b: filter to in-band channels first (avoid fetching video stats for out-of-band)
    in_band_channels = {
        cid for cid, ch in channel_stats.items()
        if args.min_subs <= ch["subscriberCount"] <= args.max_subs
    }
    print(f"   {len(in_band_channels)} channels in {args.min_subs:,}-{args.max_subs:,} band")

    # Only fetch video stats for in-band channels
    in_band_vids = [v for v in all_videos if v["channelId"] in in_band_channels]
    if quota_used >= args.max_quota:
        print(f"\n⚠ Quota limit reached ({quota_used}u). Skipping video stats.")
        video_stats = {}
    else:
        print(f"📈 Fetching video stats for {len(in_band_vids)} in-band videos...")
        video_stats = get_video_stats([v["videoId"] for v in in_band_vids])

    # Phase 3: filter + validate burn + enrich
    prospects = []
    filtered_burn = 0
    filtered_gap = 0
    for v in in_band_vids:
        # Burn validation: must be the creator's own experience
        if not is_real_burn(v["title"]):
            filtered_burn += 1
            continue

        ch = channel_stats.get(v["channelId"])
        vs = video_stats.get(v["videoId"])
        if not ch or not vs:
            continue

        subs = ch["subscriberCount"]
        views = vs["viewCount"]
        gap_pct = round((1 - views / subs) * 100, 1) if subs > 0 else 0

        # Skip if gap is negative (video outperformed subs — likely a short/viral, not a burn signal)
        if gap_pct < 0:
            filtered_gap += 1
            continue
        segment = infer_segment(v["title"], ch.get("description", ""))

        # Extract potential contact info from channel description
        desc = ch.get("description", "").lower()
        contact_hints = []
        import re
        emails = re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', ch.get("description", ""))
        if emails:
            contact_hints.extend(emails)
        if "business" in desc or "biz" in desc or "inquiry" in desc or "contact" in desc:
            contact_hints.append("biz keywords in description")
        if "management" in desc or "manager" in desc or "agency" in desc:
            contact_hints.append("has manager/agency")

        prospects.append({
            "name": ch["title"],
            "handle": ch.get("customUrl", ""),
            "channelId": v["channelId"],
            "channelUrl": f"https://youtube.com/@{ch.get('customUrl', ch['channelId'])}",
            "platform": "YouTube",
            "subscribers": subs,
            "totalViews": ch["viewCount"],
            "videoCount": ch["videoCount"],
            "burnVideo": {
                "videoId": v["videoId"],
                "title": v["title"],
                "url": f"https://youtube.com/watch?v={v['videoId']}",
                "publishedAt": v["publishedAt"],
                "views": views,
                "likes": vs.get("likeCount", 0),
                "comments": vs.get("commentCount", 0),
            },
            "gapPercent": gap_pct,
            "segment": segment,
            "contactHints": contact_hints,
            "description": ch.get("description", "")[:200],
            "sourceQuery": v["_query"],
            "m0Fit": assess_m0_fit(v["title"], ch.get("description", "")),
        })

    # Deduplicate by channel (keep the video with highest views as the burn signal)
    by_channel: dict[str, dict] = {}
    for p in prospects:
        cid = p["channelId"]
        if cid not in by_channel or p["burnVideo"]["views"] > by_channel[cid]["burnVideo"]["views"]:
            by_channel[cid] = p

    final = sorted(by_channel.values(), key=lambda x: x["subscribers"], reverse=True)

    # Output
    if args.json:
        output = json.dumps(final, indent=2)
    else:
        lines = []
        lines.append(f"# YouTube Outreach Prospects — {len(final)} in band")
        lines.append(f"# Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
        lines.append(f"# Sub band: {args.min_subs:,} – {args.max_subs:,}")
        lines.append("")

        # Segment summary
        seg_counts = {}
        for p in final:
            seg_counts[p["segment"]] = seg_counts.get(p["segment"], 0) + 1
        lines.append("## Segment breakdown")
        for seg, cnt in sorted(seg_counts.items(), key=lambda x: -x[1]):
            lines.append(f"- **{seg}:** {cnt}")
        lines.append("")
        lines.append("---")
        lines.append("")

        for i, p in enumerate(final, 1):
            lines.append(f"### #{i} — {p['name']} ({p['segment']})")
            lines.append(f"- **name/handle:** {p['name']} / @{p['handle'] or p['channelId']}")
            lines.append(f"- **platform:** YouTube")
            lines.append(f"- **audience:** {p['subscribers']:,} subs")
            lines.append(f"- **burn video:** [{p['burnVideo']['title']}]({p['burnVideo']['url']})")
            lines.append(f"  - published: {p['burnVideo']['publishedAt'][:10]}")
            lines.append(f"  - views: {p['burnVideo']['views']:,} | likes: {p['burnVideo']['likes']:,} | comments: {p['burnVideo']['comments']:,}")
            lines.append(f"- **gap %:** {p['gapPercent']}% ({p['burnVideo']['views']:,} views vs {p['subscribers']:,} subs)")
            lines.append(f"- **m0 fit:** {p['m0Fit']}")
            lines.append(f"- **contact hints:** {', '.join(p['contactHints']) if p['contactHints'] else 'none in description — check About page / DM'}")
            lines.append(f"- **niche:** auto-infer from [{p['channelUrl']}]({p['channelUrl']})")
            lines.append(f"- **description:** {p['description'][:150]}")
            lines.append("")

        output = "\n".join(lines)

    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"\n✅ Wrote {len(final)} prospects to {args.output}")
    else:
        print()
        print(output)

    print(f"\n📊 Summary: {len(final)} qualified prospects in {args.min_subs:,}-{args.max_subs:,} band")
    print(f"   Segment split: {dict(seg_counts)}")
    print(f"   Filters: {filtered_burn} false-positive burns rejected, {filtered_gap} negative-gap rejected")
    print(f"   Quota used: ~{quota_used:,}u / {args.max_quota:,}u ({quota_used/args.max_quota*100:.0f}%)")


if __name__ == "__main__":
    main()