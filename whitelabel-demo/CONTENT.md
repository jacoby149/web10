# Stock the TorahAnytime demo

Give Shimon something real to browse: a few recognizable speaker pages, a
populated Torah feed and shiurim that actually play. Use TorahAnytime's
supported downloads, as confirmed by the operator. No full-library importer.

## Before downloading

- Agree the speaker/shiur URLs, number of items and total byte/duration limit.
- Record who permits rehosting this selection for the private partner demo.
  A download feature is the supported acquisition path, not by itself a
  redistribution license. No paywall or download-restriction bypasses.
- Obtain partner-provided light/dark logos; preserve speaker names, titles,
  source links and any required attribution. Mark managed speaker pages as
  demo representations, not accounts the rabbis personally registered.
- Confirm the isolated target API is `https://api.torah.web10.app`, its UI is
  `https://torah.web10.app`, and the gate protects actual media bytes first.

## Download → seed → check

1. Download only the approved selection through the site's offered download
   flow. Keep media, temporary URLs and private manifests under gitignored
   `whitelabel-demo/state/`, not tracked files. No mass crawl.
2. Maintain a private source ledger: stable source ID/page URL, speaker,
   title, permission reference, original format/size/SHA-256, demo account/page
   identifier, created post/media IDs and result. Strip signed download query
   strings and credentials from any receipt published to git/chat.
3. Use normal app-owned account/profile/post/upload flows on the demo. The
   existing Instagram scripts are not a TorahAnytime connector; do not run
   their production-targeted flow. Any new driver needs its own reviewed exact
   origin fence and dry-run plan before it is used.
4. Skip already seeded source IDs after confirming the demo record exists;
   persist progress after each successful item. Do not blindly repost an
   ambiguous/failed upload—reconcile it first. No bulk real-user accounts,
   borrowed speaker credentials or automatic consent.
5. Play actual uploaded audio/video, check title/speaker/artwork, pause/seek,
   feed/profile and copied share-link behavior, and desktop/375px rendering.
   Cross-check seeded counts with the ledger. Log failures rather than hide
   them behind screenshots of placeholder cards.

Demo content should stay in the isolated demo's existing app groups. Do not
connect public web10 Discover or foreign source mixers. A manually curated
selection is not proof that future arbitrary uploads will be Torah-only.

## Cleanup and handoff

Record non-secret totals, revision, tested journeys and receipt locations in
[OPS-LOG.md](OPS-LOG.md). Retain the private source→demo ledger so updates,
takedowns and cleanup target only these records. Delete only explicitly
approved demo objects through normal authority; never wipe a bucket or volume.
Do not commit downloaded media, personal data or login/browser state.
