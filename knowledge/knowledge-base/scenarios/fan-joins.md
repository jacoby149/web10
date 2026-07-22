# Fan Joins a Node

A follower clicks a creator's link. They sign up. They get their own space — not just a row in the crowd. Every account is creator-shaped from day one: own page, own followers, own data.

## Signup Flow

```mermaid
sequenceDiagram
    participant Fan
    participant Social as Social App
    participant Auth as Auth Console
    participant API as Node API
    participant DB as Database

    Fan->>Social: Clicks creator's join link
    Social->>Auth: Redirects to signup
    Fan->>Auth: Enters username, password, email
    Auth->>API: POST /signup
    API->>DB: Creates collection (username)
    API->>DB: Writes star record (account)
    API->>DB: Writes default terms (services)
    API->>DB: Writes default profile
    API-->>Auth: Account created, JWT issued
    Auth->>Social: Posts token to opener
    Social->>API: PATCH /profile (read own)
    API-->>Social: Profile loaded
    Social->>Fan: Welcome screen — your space is ready
```

## What the Fan Gets

In the same breath as joining, the fan gets their own page. Not a hidden profile — a real space. The aspirant identity is honored at signup:

```mermaid
graph TB
    subgraph FanSpace["Fan's Space (day one)"]
        Profile["Profile page<br/>(banner, bio, stats)"]
        Posts["Posts collection<br/>(empty, ready)"]
        Feed["Feed<br/>(creator's posts + follows)"]
        DMs["Direct messages"]
        Contacts["Contacts"]
    end

    FanSpace -.->|"This is YOUR place,<br/>not just the crowd"| Fan["Fan"]

    style FanSpace fill:#18181b,stroke:#8b5cf6
```

## The First Post

The fan posts. Their followers (maybe zero, maybe five) all see it. The number is real — 100% delivery, no throttle. The throttle hits small accounts hardest on legacy platforms. Here, 5K followers means 5K people actually see you.

```mermaid
sequenceDiagram
    participant Fan
    participant Social as Social App
    participant API as Node API
    participant DB as Database
    participant Followers as Followers' Inboxes

    Fan->>Social: Writes post, taps publish
    Social->>API: POST /fan/posts
    API->>API: certify() + is_permitted()
    API->>DB: Writes record to fan's collection
    API->>DB: Fan-out: writes to each follower's inbox
    DB-->>Followers: Post delivered (100%)
    API-->>Social: Post created
    Social->>Fan: Post live
```

## The Flywheel

Every account is already creator-shaped. Today's 5K wannabe is next year's 100K creator who is already home. The WordPress flywheel: nobodies start blogs. The ones who get big never migrate.