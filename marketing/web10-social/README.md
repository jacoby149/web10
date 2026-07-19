# web10-social

The killer app: an all-in-one social lens (instagram-shaped, video +
streaming) built on the web10 data layer. Feed, profile, DMs — a creator
owns every byte, on a screen that holds up next to Kick and Twitch (see
`/design.md` at the repo root — the binding UI/brand standard).

## Stack

Vite + React 19 + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`),
Radix UI primitives + `class-variance-authority` (the shadcn/ui idiom —
see `src/components/ui/`), Lucide icons, self-hosted variable fonts
(`@fontsource-variable/*` — never a Google Fonts / CDN font). The frontend
talks to a user's node over `web10-npm` (`wapi`); see `src/data/` for the
conventions-schema data layer (posts, feed, profile, contacts, dms,
comments, reactions).

## Scripts

```
bun install       # or npm install
bun run dev       # vite dev server, :3000
bun run build     # tsc -b && vite build
bun run preview   # serve the production build
bun run test:run  # vitest, single run
```

## Structure

- `src/components/Social/Layout.tsx` — the app shell: desktop sidebar +
  mobile bottom-nav (design.md §9).
- `src/components/Feed/`, `src/components/Bio/`, `src/components/Chat/` —
  feed/composer, profile, DMs.
- `src/components/ui/` — the shadcn-style primitive kit. Extend this idiom;
  don't fork a parallel one.
- `src/data/` — the data layer (one file per service), typed against
  `marketing/marketing-ui/public/docs/schemas/`.
- `src/interfaces/` — legacy pre-D4 interface layer (`Interface.ts`,
  `MockInterface.ts`, `PostInterface.ts`) kept alive by its own tests;
  `Web10SocialAdapter.ts` is the real auth/session adapter `App.tsx` uses.

## Design tokens

`src/index.css`'s `@theme` block is a verbatim copy of `/design.md` §13 —
sync it from there, don't fork local values. Colors, fonts, and radii
come through tokens; a hardcoded hex or `font-family` in a component is a
design review rejection.
