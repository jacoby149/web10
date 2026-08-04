# Manifesto: The Internet Is Too Permanent

The internet is a graveyard. Everything you post, say, share — it lives forever. Screenshots. Archives. Wayback machines. The web remembers everything.

This is not a feature. This is a bug.

## The Problem

The current internet is built on copying. When you post something, it gets mirrored, cached, archived, screenshotted. You lose control the moment you hit publish. The platform owns it. The network owns it. You don't.

This is why people are afraid to speak. Why mistakes become careers. Why the past is a weapon.

## The web10 Difference

web10 v3 makes it hard to save. Not by accident. By design.

**Content lives in the author's collection.** When the author deletes it, it's gone. Not cached. Not mirrored. Not archived. Gone.

**Groups define discovery, not ownership.** You see a post because you're in a group. When the author removes it from the group, you can't see it. When the author deletes it entirely, it's gone from every group.

**No mirrors. No copies. No permanent storage.** The protocol doesn't encourage saving. There's no "download" button. No "archive" endpoint. No "export" that makes sense. The dev has to work hard to build permanence. We want them to work hard.

**Sender deletion is the feature.** When Bob sends Alice mail, Bob owns that mail. Bob can delete it. Alice can't keep a copy because she never owned it. The mail was delivered through a group, not copied into her collection.

## What This Means

**For users:** You can speak without fear. Your words are yours. You can take them back. The past doesn't own you.

**For developers:** You can't build a "save everything" feature without fighting the protocol. The data model resists permanence. You have to explicitly opt into copies, and even then, the source can vanish.

**For the platform:** No archives. No backups of user content. No "we'll keep it forever" policies. When the author deletes, it's gone. Period.

## The Trade-off

This means you can't rely on the internet to remember things. Your posts aren't a permanent record. Your messages aren't archival. If you want permanence, you have to build it yourself, and even then, the source can disappear.

This is intentional. The internet should be a conversation, not a museum.

## The Positive: App Certification

This limitation creates a natural distinction. Someone could build an app that saves mail to your inbox — creating permanent copies. That app would fight the protocol. It wouldn't be web10 verified.

**web10 verified apps** — respect sender deletion, no permanent copies, ephemeral by design
**Unverified apps** — save everything, archive content, fight the protocol

The certification isn't a feature you build. It's a consequence of the design. Apps that respect the protocol get verified. Apps that don't, don't.

The user can choose: "do I trust this app with my data?" The verified badge says "this app respects sender deletion."

## Groups Are Hard on the Internet

Groups are hard on the current internet. Every platform reinvents them: Instagram Close Friends, Twitter Lists, Facebook Groups, Discord Servers. None of them talk to each other. You rebuild your circles in every app. Your "close friends" on Instagram are strangers on Twitter. Your Discord guild doesn't know your Facebook group.

web10 makes groups easy. One group. Infinite apps. The group is a platform primitive, not an app feature.

**Your groups follow you everywhere:**
```
alice.close-friends → social app sees posts, music app sees playlists, doc app sees files
jazz-collectors → music app, social app, podcast app — same circle
web10-dev → teams, communities, collaboration — same membership
```

The group is managed once, at the platform level. Every app can scope content to it. No rebuilding. No silos. No "close friends" trapped in one app.

This is the difference between Instagram Close Friends (trapped in Instagram) and web10 groups (platform-wide). An app developer doesn't build groups — they query the platform's groups endpoint and scope their feature to them.

## Groups Protect Individual Data

Groups don't just organize content — they protect it. The individual controls everything about how their data is seen. Not the platform. Not the group admin. You.

- You decide which groups your content attaches to
- You decide the permission level (read/write)
- You can block sharing with a group without leaving
- You can remove all your content from a group in one click
- You can make everything private in one click
- You can turn off all app access in one click

The group admin manages membership. You manage your data. The group can moderate (remove from discover), but they can't edit your content or escalate permissions.

## Blocking

Conventional social media has blocking — but it's all-or-nothing. You block someone, they disappear entirely. web10 has two levels:

**User-wide blacklist** — block someone entirely. They can't see any of your content, anywhere.

```
user-wide blacklist:
  blocked: bob, charlie
```

**Per-group blacklist** — block someone from seeing your content in a specific group. They're still in the group. They still see everyone else's content. Just not yours.

```
jazz-collectors → per-group blacklist: dave
  dave is still a member
  dave sees alice's posts from other groups
  dave does NOT see alice's posts in jazz-collectors
```

The per-group blacklist is the nuance. You can be in a group with someone you don't want seeing your content. You don't have to leave the group. You don't have to kick them out. You just block them from your content in that group.

## Summary

The internet is too permanent. web10 v3 makes it hard to save. Content lives in the author's collection. Groups define discovery. When the author deletes, it's gone. No mirrors. No copies. No archives. Sender deletion is the feature. The past doesn't own you.

Groups are hard on the internet. web10 makes them easy. One group. Infinite apps. Your circles follow you everywhere. Groups protect individual data — you control everything about how your content is seen.

Two levels of blocking: user-wide blacklist (block someone entirely) and per-group blacklist (block someone from your content in one group). You don't have to leave the group. You just block them from your posts.

This limitation is a positive. It creates natural app certification — verified apps respect the protocol, unverified apps fight it. The user chooses.