# Mobile Transcoding

## The Strategy

React Native for iOS/Android. Shares SDK, logic, and types with the web app. Native modules for platform-specific features: camera, file picker, video encoding.

## The Encoding Advantage

Mobile apps use **hardware encoders**, not WASM. 1080p in seconds, not minutes.

| Platform | Encoder | 1080p encode time | Hardware accel |
|---|---|---|---|
| Browser (ffmpeg.wasm) | CPU only | 20-40 min | No |
| iOS (React Native) | AVAssetExportSession | 5-15 sec | Yes |
| Android (React Native) | MediaCodec | 5-15 sec | Yes |

The mobile app is where client-side transcoding becomes practical at high quality. 1080p H.264, fast, low battery impact.

## The Two Apps

**Encryptor app** — security-critical. Keys, authenticator, wallet. Minimal UI, maximum security. Required for desktop auth (like WhatsApp Web).

**Social app** — consumer-facing. Feeds, posts, video, groups. Rich UI, frequent updates. Uses the Encryptor app for auth.

Two apps, two codebases. Clean separation. Encryptor is infrastructure. Social is the product.

## The Shared Stack

```
web10-npm (shared SDK)
  ↓
React/TS logic (shared: auth, state, API layer, types)
  ↓
Platform modules (native: camera, file picker, video encoder)
  → iOS: AVAssetExportSession
  → Android: MediaCodec
```

**What's shared:** SDK, business logic, TypeScript types, API layer, state management.

**What's native:** camera, file picker, video encoding, notifications, background tasks.

## The Upload Flow (Mobile)

```
1. User selects video (4K from camera, 2GB)
2. Native encoder transcodes → 1080p H.264 @ 5Mbps (~300MB)
3. Upload optimized file to MinIO
4. Document created:
   {"media": [{"type": "minio", "value": "alice/video/upload.mp4"}]}
5. Server segments to HLS (pro feature) or range requests (free)
```

No transcoding queue. No server-side ffmpeg. The hardware encoder does the work in seconds.

## The Rewrite

React Native is different from React web. `<div>` → `<View>`. `<button>` → `<TouchableOpacity>`. CSS → StyleSheet. But it's a **port**, not from scratch. Same logic, same SDK, same types. Different primitives.

```
React web → desktop + mobile browser
React Native → iOS + Android native
Shared → SDK, logic, types, API layer
```

## Summary

React Native for mobile. Hardware encoders (AVAssetExportSession, MediaCodec) make 1080p transcoding practical — seconds, not minutes. Two apps: Encryptor (security, auth) and Social (consumer, feeds). Shared SDK and logic. Native modules for encoding, camera, file picker. The mobile app is where client-side transcoding shines.