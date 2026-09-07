# Import from Other Platforms

**Who this is for:** you — a creator (or user) moving to web10 from YouTube,
Instagram, X, TikTok, or another web10 node.

## Port your YouTube channel

The first platform web10 is built to import from is **YouTube** — because a
YouTuber is the person who has the most to gain from web10.

**The reach gap.** On YouTube, you might have 1M subscribers — and Google's
algorithm decides which 300k of them see your next video. Your audience is
Google's asset. On web10, **100% delivery is architecture**: when you post to
your followers, all of them see it. No algorithm in between.

**The pitch, in one line:** *Port your YouTube channel. Own your audience.*

### What comes over

Your channel is exported from Google Takeout (the steps below) and mapped onto
web10:

| Your YouTube… | Becomes on web10… |
|---|---|
| Videos | Posts with the full record — title, description, publish date, duration, tags, and the thumbnail. **Your export includes the video files themselves**, so the importer brings your catalog over *and* your videos for native playback — not just a link back to YouTube. |
| Channel | Your creator profile — name, bio, and your channel URL. |
| Comments (on your videos) | Comments on the matching posts. |
| **Subscribers** | **Don't come over — and that's the point.** Google keeps your subscriber list; there's no export for it. On web10 your audience is the people who *choose* to follow you — the ones you actually own, who see everything you post. |

The subscriber line is the honest one. On YouTube that list is Google's — you
can't export it as *your* audience, and you can't message those people without
going through Google. On web10 you don't import a list you don't own; you build
an audience that's yours. The fans who migrate are the ones who stay, and
100% delivery means every single one of them sees everything.

(Takeout doesn't export view/like counts — those numbers stay on YouTube.
Everything else about your videos comes with you.)

### How it works

1. **Export** your YouTube data with Google Takeout (steps in the next
   section). The default export is fine — Takeout splits big exports into
   ~2GB parts (`.tar` or `.zip`, your choice), and the importer takes them
   as-is (multiple files are expected, not a problem).
2. **Import** in your authenticator: Settings → **Import from YouTube** →
   choose your Takeout files → Start Import. The node brings over your catalog
   (every video as a post with its full record + thumbnail), your comments,
   your profile, and your video files — staged under your account. Nothing
   publishes until you triage it.
3. **Triage** in the social app's staging area: publish what you want public,
   keep the rest private, or delete. Your catalog keeps its original dates.

**Status:** the YouTube import is live. Export from Takeout, open your
authenticator's Settings, and import.

## Get your data out of the other platforms

Every major platform will give you your data if you ask. The exports land as
archive files you keep (ZIP or TAR, depending on the platform) — then they're
ready to import.

- **YouTube / Google** — [Takeout](https://takeout.google.com): deselect
  all, check YouTube, create the export, download when it's ready. The
  default is a set of ~2GB `.tar` parts — that's fine, the importer takes
  split exports as-is. (You can switch the format to ZIP in the export
  options if you prefer; either works.)
- **Instagram** — Settings → Your Activity → Download your information.
- **X (Twitter)** — Settings → Your Account → Download an archive of your
  data (arrives by email, up to 48 hours).
- **TikTok** — Profile → Settings and Privacy → Account → Download your data.
- **Facebook** — Settings & Privacy → Your Information → Download Your
  Information.

Full step-by-step for each platform: [Export Guidance](/docs/export-guidance).

**Keep the archives.** They're your data, sitting on your machine. Nothing is
lost by holding onto them.

## Moving between web10 nodes

Your data is portable **between nodes too** — no lock-in inside web10
itself. The node export (download your collections as a file) and the
matching import are on the way; your data lives in standard formats on the
node, so a move is a transfer, not a reconstruction. If you run your own
node, this is just moving files you already own.

## What "import" means here

An import is **your data, on your terms**:

- It lands under **your** account on **your** node.
- You decide what's public and what's private — the importer doesn't make
  that call for you.
- Nothing is scraped from the other platform by web10. You export, you keep
  the file, you upload. The other platform never hears about it.
