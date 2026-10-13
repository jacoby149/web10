# The How Layer

The system doesn't work like the internet you know. It uses different cryptography, encryption, and protocols that talk to each other in non-obvious order. The how layer explains all of it comprehensively so someone can actually understand the machinery.

## The Problem

Most systems are simple HTTP requests to a central server. This one isn't. You have nodes talking to nodes, encrypted payloads, signed tokens, terms records checked mid-flight, presigned URLs for media, cross-node replication with immutable metadata. If you don't understand the order and the mechanics, you can't debug, extend, or trust it.

## The Theory

Technical documentation must be comprehensive. Not a high-level overview. Not a diagram with labels. The actual algorithms, protocols, data flows, and architecture — explained in the order they execute, with enough detail that a competent engineer can trace a request from start to finish.

## How It Works

### 1. Start With the Flow

Before diving into algorithms, show the order of operations. A request doesn't go client → server → done. It might go:

Client → Auth Node (token mint) → Creator Node (terms check) → Creator Node (content serve) → Metering event → Public index update

Map the path first. Then explain each hop.

### 2. Explain the Cryptography

Don't hand-wave it. Name the algorithms, the key sizes, the purpose.

- HKDF for key derivation — why not raw keys?
- Ed25519 for signatures — why not RSA?
- X25519 for key exchange — what does it protect?
- XChaCha20 for encryption — why not AES?

The "why" matters as much as the "what." A reader needs to know this isn't crypto for show — it's the mechanism that makes creator control real.

### 3. Explain the Protocols

How do systems talk? What's on the wire? What's in the payload? What gets signed, what gets encrypted, what stays plaintext?

- Token structure and validation
- Terms record format and enforcement
- Cross-node replication handshake
- Presigned URL flow for media

Include request/response shapes. Show real examples, not pseudocode.

### 4. Explain the Architecture

Where does each piece live? What owns what? What happens when a node goes down?

- The node model: API, UI, RTC, Minio, DB
- How a creator node differs from a consumer node
- How the discovery index stays in sync
- How the marketing layer is separate from the platform layer

### 5. Trace a Real Request

End with a concrete example. Follow one piece of data through the entire system. A post being created, signed, stored, discovered, consumed, and metered. The abstract becomes real.

## When to Write a How

- Onboarding an engineer to the codebase
- Documenting a new protocol or crypto primitive
- Explaining a feature whose implementation is non-obvious
- When someone asks "how does X actually work?" and the answer is more than one sentence

## When Not to

- Simple CRUD endpoints — the code is readable
- UI styling decisions — belongs in design docs
- Business logic without technical complexity — use the why layer instead

## The Test

After reading the how doc, can an engineer draw the data flow from memory? If not, it's too abstract. Can they implement a compatible client? If not, it's missing detail.