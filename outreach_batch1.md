# outreach batch 1 — 20 prospects (API-verified, batch 1 pitch-iteration lab)

batch 1 = pitch-iteration lab. all prospects sourced via YouTube Data API v3
(outreach_sourcer.py), burn events verified by video title + timestamp,
subscriber counts from channel statistics endpoint.

**sourcing:** `outreach_sourcer.py` — YouTube API, 7 queries, 180-day window,
~2,100 quota units used across two runs (21% of free daily tier).

**M0 fit correction:** the first pass misclassified every prospect as PARTIAL
because the fit logic only checked for "video" in descriptions. fixed with
signal-based scoring: YES for recipe/craft/tutorial/education/fashion/lifestyle
creators; POOR for gaming/reaction/pure-animation; PARTIAL for mixed.

---

## segment 1: platform-burned, right-coded (3 slots)

### #1 — Freedom Worx — M0 FIT: YES
- name/handle: Freedom Worx / @@freedomworx
- platform(s): YouTube
- audience: 215,000 subs
- recent avg views: 106,565 (burn video)
- gap %: 50.4% (106,565 views vs 215,000 subs)
- burn event + source + date: "Why I Left Youtube in 2026...Not What You Think" —
  May 2, 2026 — https://youtube.com/watch?v=jRwloM6jotg
- content format: gearhead lifestyle, DIY, tutorials
- m0 fit: YES (learning stuff, gear reviews = text/photo/community content)
- contact route: YouTube About page / DM
- niche: American gearhead, free-range lifestyle
- opener: "Your 'Why I Left Youtube in 2026' video pulled 106K views from a
  215K audience — but that means 108K of your subs never saw it. You already
  distribute across platforms; what if one of them was yours, on your domain,
  where every post reaches 100% of your followers by design?"

### #2 — TSO_Sage — M0 FIT: YES
- name/handle: TSO_Sage / @@tso_sage
- platform(s): YouTube / X (@TSO_Sage) / IG (@tso_sage23) / TikTok
- audience: 198,000 subs
- recent avg views: 87,892 (burn video)
- gap %: 55.6% (87,892 views vs 198,000 subs)
- burn event + source + date: "YOUTUBE COMPLETELY DEMONETIZED MY CHANNEL!!" —
  Jun 17, 2026 — https://youtube.com/watch?v=pztkXiJgY_c
- content format: self-improvement, fitness, lifestyle
- m0 fit: YES (fitness, health, self-improvement = text/photo/community)
- contact route: tso.sage23@gmail.com (in description)
- niche: masculinity, self-improvement, fitness
- opener: "YouTube completely demonetized your channel in June and 110K of your
  198K subs never even saw the video about it. You already post to X, IG, and
  TikTok — what if you added a sixth surface you actually own, on your domain,
  where nobody can throttle or demonetize you?"

### #3 — Steven Song — M0 FIT: PARTIAL
- name/handle: Steven Song / @@stevensongirl
- platform(s): YouTube
- audience: 184,000 subs
- recent avg views: 171,963 (burn video)
- gap %: 6.5% (171,963 views vs 184,000 subs)
- burn event + source + date: "I Got Demonetized. This Is The End." —
  Apr 16, 2026 — https://youtube.com/watch?v=Kq7UmKzogTs
- content format: UNVERIFIED — minimal description ("You're early")
- m0 fit: PARTIAL (niche unknown, needs founder verification)
- contact route: YouTube About page / DM
- niche: UNVERIFIED — check channel content
- opener: "You got demonetized in April and your video about it reached 172K —
  but 12K of your own subs never saw it. That gap is YouTube's decision, not
  your content. What if you had a surface where every post reaches 100% of
  your followers, on a domain you own?"

---

## segment 2: platform-burned, left-coded (2 slots)

### #4 — Spooky Scary Socialist — M0 FIT: POOR
- name/handle: Spooky Scary Socialist / @@spookyscarysocialist
- platform(s): YouTube
- audience: 114,000 subs
- recent avg views: 38,748 (burn video)
- gap %: 66.0% (38,748 views vs 114,000 subs)
- burn event + source + date: "So...YouTube banned my channels" —
  Jan 28, 2026 — https://youtube.com/watch?v=u3-xCSIbF_g
- content format: animated political commentary
- m0 fit: POOR (pure animation — video-only medium)
- contact route: partnerships@velureinfluence.com (manager/agency)
- niche: left-leaning political animation
- opener: "YouTube banned your channels in January and 75K of your 114K subs
  never saw the video about it. You make content that challenges the status quo
  — exactly the kind that platforms can throttle or delete. What if you owned
  the building instead of renting shelf space?"

### #5 — Lucie Villeneuve (Edukale) — M0 FIT: YES
- name/handle: Lucie Villeneuve / @@lucie.villeneuve
- platform(s): YouTube
- audience: 96,100 subs (slightly below 100k band — include for segment diversity)
- recent avg views: 10,740 (burn video)
- gap %: 88.8% (10,740 views vs 96,100 subs)
- burn event + source + date: "My channel is dying. | Edukale" —
  Feb 6, 2026 — https://youtube.com/watch?v=Z9qeEMc8oRs
- content format: nutrition education, health, recipes
- m0 fit: YES (nutrition, health, recipes = text/photo/community)
- contact route: YouTube About page / DM
- niche: nutrition, health, sustainable living
- opener: "Your 'My channel is dying' video reached only 10.7K views from 96K
  subs — 89% of your audience never saw it. You put effort into nutrition
  education that deserves to reach everyone who opted in. What if you had a
  surface where posts reach 100% of your followers, on a domain you own?"

---

## segment 3: wildcard niches — M0 YES FITS (10 slots, highest priority)

### #6 — Shijo p Abraham — M0 FIT: YES
- name/handle: Shijo p Abraham / @@shijopabraham
- platform(s): YouTube
- audience: 405,000 subs
- recent avg views: 6,592 (burn video)
- gap %: 98.4% (6,592 views vs 405,000 subs)
- burn event + source + date: "YouTube Monetization Policy 2026... YouTube
  Suspended Due To Related Channel?" — Jun 5, 2026 —
  https://youtube.com/watch?v=Hq_dPsJPOw8
- content format: social media growth tutorials, education
- m0 fit: YES (tutorials, education, social media = text/community)
- contact route: -textmessage303@gmail.com (in description)
- niche: social media growth, creator education
- opener: "YouTube suspended your channel and only 6.5K of your 405K subs saw
  the video — 98% never got the message. You teach creators about growing on
  social platforms; what if you had a surface you actually owned, where nobody
  can suspend or throttle your content?"

### #7 — JeffMara Podcast — M0 FIT: YES
- name/handle: JeffMara Podcast / @@jeffmarapodcast
- platform(s): YouTube
- audience: 271,000 subs
- recent avg views: 193,407 (burn video)
- gap %: 28.6% (193,407 views vs 271,000 subs)
- burn event + source + date: "I Got Demonitized. This May Be The End After
  20 Years On YouTube." — Jun 26, 2026 —
  https://youtube.com/watch?v=lhc4Cw8xxp4
- content format: podcast (audio + video)
- m0 fit: YES (podcast = audio + text show notes + community)
- contact route: YouTube About page / DM
- niche: spiritual, supernatural, unexplained
- opener: "After 20 years on YouTube you got demonetized in June and 78K of
  your 271K subs never saw the video. Two decades of building an audience on
  rented land — what if you had a surface you owned, on your domain, where
  nobody can demonetize or delete your podcast?"

### #8 — Just Tim — M0 FIT: YES
- name/handle: Just Tim / @@tableautim
- platform(s): YouTube
- audience: 241,000 subs
- recent avg views: 1,368 (burn video)
- gap %: 99.4% (1,368 views vs 241,000 subs)
- burn event + source + date: "600 Vidoes! - Find out why the channel is dying" —
  Jan 30, 2026 — https://youtube.com/watch?v=S5wSc_X09ko
- content format: Tableau tutorials, data analytics
- m0 fit: YES (tutorials, data analytics = text/screenshot/community)
- contact route: YouTube About page / DM
- niche: data analytics, Tableau, business intelligence
- opener: "You've posted 600 videos and your channel is dying — only 1.3K of
  your 241K subs saw the video about it (99% gap). Tutorial content like yours
  is exactly what thrives on an owned platform. What if you had a surface where
  every post reaches 100% of your followers, on your domain?"

### #9 — CraftyGirl — M0 FIT: YES
- name/handle: CraftyGirl / @@cheapcraftygirl
- platform(s): YouTube
- audience: 239,000 subs
- recent avg views: 47,043 (burn video)
- gap %: 80.3% (47,043 views vs 239,000 subs)
- burn event + source + date: "Why I left YouTube" —
  Apr 15, 2026 — https://youtube.com/watch?v=udIufyfZy2A
- content format: homemaking, crafts, lifestyle
- m0 fit: YES (crafts, homemaking, lifestyle = photo/text/community)
- contact route: YouTube About page / DM
- niche: homemaking, crafts, cozy lifestyle
- opener: "You left YouTube in April and 192K of your 239K subs never saw the
  video about it. Homemaking and craft content is exactly what thrives on an
  owned platform — photos, text, community. What if you had your own surface,
  on your domain, where every post reaches 100% of your followers?"

### #10 — Monkey Economics — M0 FIT: YES
- name/handle: Monkey Economics / @@monkeyeconomic
- platform(s): YouTube
- audience: 225,000 subs
- recent avg views: 92,994 (burn video)
- gap %: 58.7% (92,994 views vs 225,000 subs)
- burn event + source + date: "We Got Demonetized... This Is The End." —
  May 2, 2026 — https://youtube.com/watch?v=x9hd0Z2CqNs
- content format: economics/finance education
- m0 fit: YES (finance, economics, business = text/community)
- contact route: monkeyeconomicsyt@gmail.com (in description)
- niche: economics, finance education
- opener: "You got demonetized in May and 132K of your 225K subs never saw the
  video about it. Finance education is exactly the kind of content platforms
  flag inconsistently. What if you had a surface you owned — your domain, your
  brand — where nobody can demonetize your content?"

### #11 — CarnivorousChef — M0 FIT: YES
- name/handle: CarnivorousChef / @@carnivorouschef
- platform(s): YouTube
- audience: 112,000 subs
- recent avg views: 7,363 (burn video)
- gap %: 93.4% (7,363 views vs 112,000 subs)
- burn event + source + date: "My Youtube Channel Is Dying..." —
  Apr 9, 2026 — https://youtube.com/watch?v=jx1uKxKuJBQ
- content format: cooking, carnivore diet recipes
- m0 fit: YES (recipes, cooking, diet, food = photo/text/community)
- contact route: YouTube About page / DM
- niche: carnivore diet, keto, animal-based cooking
- opener: "Your channel is dying — only 7.3K of your 112K subs saw the video
  about it (93% gap). Recipe content is exactly what thrives on an owned
  platform — photos, text, community. What if you had your own surface, on
  your domain, where every post reaches 100% of your followers?"

### #12 — Leilani Rika — M0 FIT: YES
- name/handle: Leilani Rika / @@leilanirika
- platform(s): YouTube
- audience: 87,900 subs (slightly below 100k band — include for M0 fit quality)
- recent avg views: 3,192 (burn video)
- gap %: 96.4% (3,192 views vs 87,900 subs)
- burn event + source + date: "Why I left Youtube" —
  Jun 19, 2026 — https://youtube.com/watch?v=kg6Dcf1enXY
- content format: fashion, lifestyle, home decor, thrifting
- m0 fit: YES (fashion, lifestyle, home decor, thrifting = photo/text/community)
- contact route: YouTube About page / DM
- niche: fashion, lifestyle, home decor, thrifting
- opener: "You left YouTube in June and 84K of your 88K subs never saw the
  video about it. Fashion and lifestyle content is exactly what thrives on an
  owned platform — photos, text, community. What if you had your own surface,
  on your domain, where every post reaches 100% of your followers?"

### #13 — I Wonder Why? — M0 FIT: PARTIAL
- name/handle: I Wonder Why? / @@iwonderwhy-tv
- platform(s): YouTube
- audience: 497,000 subs
- recent avg views: 13,966 (burn video)
- gap %: 97.2% (13,966 views vs 497,000 subs)
- burn event + source + date: "We Got Demonetized... PLEASE HELP!" —
  Apr 21, 2026 — https://youtube.com/watch?v=iBdItsEcq30
- content format: random knowledge, educational
- m0 fit: PARTIAL (educational but format unclear — check if text-friendly)
- contact route: YouTube About page / DM
- niche: random knowledge, educational
- opener: "You got demonetized and only 14K of your 497K subs saw the video —
  97% never got the message. That's not a content problem, that's a platform
  problem. What if you had a surface where every post reaches 100% of your
  followers, on a domain you own?"

### #14 — Freedom Worx (duplicate removed, replaced) — [FILL: founder browser search]
- name/handle:
- platform(s):
- audience:
- recent avg views:
- gap %:
- burn event + source + date:
- content format:
- m0 fit: [YES / POOR / PARTIAL]
- contact route:
- niche:
- opener:

### #15 — [FILL: founder browser search — right-coded, M0 YES fit]
- sourcing: X/Twitter "shadowbanned" + creator with text/photo niche
  (commentary, newsletter, blog-style)
- target: 100k-500k, recently demonetized/suppressed
- m0 fit goal: YES (text-first creator)

---

## segment 3: wildcard — M0 PARTIAL/POOR FITS (5 slots, lower priority)

### #16 — CocoaCrack — M0 FIT: POOR
- name/handle: CocoaCrack / @@cocoacrack
- platform(s): YouTube
- audience: 487,000 subs
- recent avg views: 73,977 (burn video)
- gap %: 84.8% (73,977 views vs 487,000 subs)
- burn event + source + date: "UPDATES | My Channel's Been Demonetized" —
  Mar 23, 2026 — https://youtube.com/watch?v=Fs1Yzs2hRDg
- content format: horror comedy animations
- m0 fit: POOR (pure animation — video-only medium)
- contact route: YouTube About page / DM
- niche: horror comedy animation
- opener: "Your channel got demonetized in March and 413K of your 487K subs
  never saw the update about it. Horror comedy is exactly the kind of niche
  that platforms flag inconsistently. What if you had a surface you owned —
  your domain, your brand — where nobody can demonetize or throttle your content?"

### #17 — AlternatePerception — M0 FIT: POOR
- name/handle: AlternatePerception / @@alternateperception
- platform(s): YouTube
- audience: 289,000 subs
- recent avg views: 2,693 (burn video)
- gap %: 99.1% (2,693 views vs 289,000 subs)
- burn event + source + date: "I Got Demonetized for 'Inauthentic Content'…
  This Is Why" — Mar 22, 2026 —
  https://youtube.com/watch?v=EwAZ1FBFsd0
- content format: cinematic stories, AI visuals
- m0 fit: POOR (cinematic, film, AI visuals — video-only medium)
- contact route: YouTube About page / DM
- niche: mysteries, legends, unexplained events
- opener: "YouTube demonetized you for 'inauthentic content' — a label that
  gets applied to creative work with no appeal — and 286K of your 289K subs
  never saw your video about it. What if you had a surface where your creative
  work can't be flagged or demonetized by anyone?"

### #18 — Fahad Bhai Official — M0 FIT: POOR
- name/handle: Fahad Bhai Official / @@fahadbhaiofficial1
- platform(s): YouTube
- audience: 169,000 subs
- recent avg views: 31,239 (burn video)
- gap %: 81.5% (31,239 views vs 169,000 subs)
- burn event + source + date: "Why i left YouTube" —
  Jul 16, 2026 — https://youtube.com/watch?v=PC4VbygVINE
- content format: daily vlogs
- m0 fit: POOR (daily vlog — pure video diary format)
- contact route: YouTube About page / DM
- niche: daily lifestyle vlogs
- opener: "You left YouTube in July and 138K of your 169K subs never saw the
  video about it. You already distribute across platforms; what if one of them
  was yours, on your domain, where every post reaches 100% of your followers
  and nobody can throttle your reach?"

### #19 — xDemon Movies — M0 FIT: PARTIAL
- name/handle: xDemon Movies / @@xdemonmoviesrblx
- platform(s): YouTube
- audience: 556,000 subs (slightly above 500k band)
- recent avg views: 10,030 (burn video)
- gap %: 98.2% (10,030 views vs 556,000 subs)
- burn event + source + date: "why i left youtube..." —
  May 21, 2026 — https://youtube.com/watch?v=L7tkJJ3PLbs
- content format: Roblox horror animations
- m0 fit: PARTIAL (animation but has merch/community component)
- contact route: YouTube About page / DM
- niche: Roblox horror animation
- opener: "You left YouTube in May and 546K of your 556K subs never saw the
  video about it. Animation content on rented land means one policy change can
  erase your reach overnight. What if you had a surface you owned — your domain,
  your brand — where every post reaches 100% of your followers?"

### #20 — Ayesha universe — M0 FIT: PARTIAL
- name/handle: Ayesha universe / @@ayeshauniverse145
- platform(s): YouTube
- audience: 546,000 subs (slightly above 500k band)
- recent avg views: 163,709 (burn video)
- gap %: 70.0% (163,709 views vs 546,000 subs)
- burn event + source + date: "Why I Left YouTube." —
  Mar 27, 2026 — https://youtube.com/watch?v=bWQa5hi7oEs
- content format: village lifestyle, random vlogs
- m0 fit: PARTIAL (lifestyle has photo potential but vlog-heavy)
- contact route: YouTube About page / DM
- niche: rural lifestyle, village life (Punjab)
- opener: "You left YouTube in March and 382K of your 546K subs never saw the
  video about it. Village life and lifestyle content has a natural home on an
  owned platform — photos, stories, community. What if you had your own surface,
  on your domain, where every post reaches 100% of your followers?"

---

## contact summary (prospects with verified emails)

these 5 have emails in their channel descriptions — highest priority for outreach:

| # | Name | Email | M0 Fit | Gap % |
|---|------|-------|--------|-------|
| 2 | TSO_Sage | tso.sage23@gmail.com | YES | 55.6% |
| 6 | Shijo p Abraham | -textmessage303@gmail.com | YES | 98.4% |
| 10 | Monkey Economics | monkeyeconomicsyt@gmail.com | YES | 58.7% |
| 4 | Spooky Scary Socialist | partnerships@velureinfluence.com | POOR | 66.0% |

---

## m0 fit summary

- **YES (10)** — ideal for M0, photo/text/community-first:
  #1 Freedom Worx, #2 TSO_Sage, #5 Lucie Villeneuve, #6 Shijo p Abraham,
  #7 JeffMara Podcast, #8 Just Tim, #9 CraftyGirl, #10 Monkey Economics,
  #11 CarnivorousChef, #12 Leilani Rika
- **PARTIAL (4)** — mixed video + text potential:
  #3 Steven Song, #13 I Wonder Why?, #19 xDemon Movies, #20 Ayesha universe
- **POOR (4)** — pure-video, low M0 fit:
  #4 Spooky Scary Socialist, #16 CocoaCrack, #17 AlternatePerception, #18 Fahad Bhai Official
- **FILL (2)** — slots #14-15 need founder browser search for right-coded YES fits

---

## excluded prospects (verified, out of band or false positive)

- **Genuine Data** — 283K subs. "My Channel Got Demonetized" (Apr 2026).
  Excluded: geography/history educational but no clear M0 fit signal.
- **MONUMENTAL** — 165K subs. "YouTube Demonetized My Channel" (Apr 2026).
  Excluded: AI-generated visuals, POOR M0 fit.
- **8sxope** — 383K subs. "I Got Demonetized 10 years ago" (May 2026).
  Excluded: gaming/lifestyle, low engagement on burn video (1.4K views).
- **Metaphor** — 455K subs. "got me shadowbanned in Warzone" —
  gaming shadowban, not YouTube burn. False positive.
- **BigE** — 109K subs. "If You Think You're Shadowbanned… Try This" —
  advice video, not personal burn. False positive.
- **Kcraft3D** — 255K subs. "Your favorite animator Got Demonetized" —
  third-party reference, not own burn. False positive.

---

## segment gap analysis

The YouTube demonetization pool in the 100k-500k band is dominated by wildcard
niche creators (education, lifestyle, food, finance). Political creators
(right/left) in this band either:
(a) are macro-tier (500k+), (b) already migrated to Rumble/Odysee, or
(c) haven't publicly complained yet.

Slots #14-15 remain open for the founder to find right-coded, M0-YES-fit
prospects from X/Twitter search ("shadowbanned" + text-first creators like
commentary, newsletters, blog-style accounts).

---

## sourcing script

`outreach_sourcer.py` — YouTube Data API v3, run with:

```bash
export YOUTUBE_API_KEY="your_key"
python3 outreach_sourcer.py -t 30 --max-quota 6000 --output prospects.md
```

M0 fit now uses signal-based scoring (YES/POOR/PARTIAL) instead of the
broken binary check. Reusable for batches 2-5.