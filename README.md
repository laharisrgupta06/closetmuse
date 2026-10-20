# ClosetMuse

An AI-powered digital wardrobe. Photograph your clothes, let AI catalogue them,
build and save outfits, get styling suggestions from the clothes you actually own,
and share chosen pieces with friends and family in private Rooms.

## Features

- **Closet** – upload single photos or batches (drag-and-drop or camera). Gemini
  identifies each item (category, colour, material, occasion…) and the background
  is removed in the browser to give a transparent PNG.
- **Outfit Builder & Saved Outfits** – combine items by category slot and save looks.
- **AI Stylist** – outfit recommendations generated only from your own wardrobe.
- **Rooms** – private groups joined with an invite code. Members see only the items
  each person explicitly shares into that Room; everything else stays private.

## Tech stack

React 19 · TypeScript · Vite · Supabase (Auth, Postgres with Row Level Security,
Storage, Edge Functions) · Gemini API · `@imgly/background-removal` (ISNet, in-browser).

```
src/                React app (pages, components, services)
supabase/functions  Edge Functions: analyze-garment, ai-stylist (+ _shared helpers)
supabase/migrations SQL migrations 001–005 (run in order)
supabase/checks     Read-only pre/post-migration verification queries
tests/              Unit tests (Node test runner)
```

## Local setup

1. `npm install`
2. Create `.env.local`:
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable key>
   ```
   The browser never needs a Gemini key; Gemini is only called from Edge Functions.
3. `npm run dev`

## Supabase setup

**Database** – in the SQL Editor:

1. Run `supabase/checks/preflight.sql` (read-only) and keep the output.
2. Run `supabase/migrations/001` → `005` in order. Each file is safe to re-run.
3. Run `supabase/checks/postflight.sql` and compare the counts with the pre-flight.

**Edge Functions** – with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```sh
supabase login
supabase link --project-ref <project-ref>
supabase secrets set GEMINI_API_KEY=<your Gemini API key>
supabase functions deploy analyze-garment
supabase functions deploy ai-stylist
```

Both functions verify the caller's Supabase session themselves
(`supabase/functions/_shared/auth.ts`); `supabase/config.toml` records this.

**Auth** – add your local and production URLs (including `/auth/callback`) to
Authentication → URL Configuration. Enable the Google provider if you want
Google sign-in.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Lint with oxlint |
| `npm test` | Unit tests (category normalization) |
| `deno test supabase/functions/` | Edge Function unit tests (needs Deno) |

## Known limitations

- Background removal keeps every prominent subject, so photos of garments being
  worn keep the wearer, and busy scenes (display cases, white on white) can come out
  semi-transparent. These results are flagged as unreliable and the original photo
  is saved unless you choose the cut-out.
- The first background removal downloads the segmentation model (≈84 MB) from
  IMG.LY's CDN; later runs use the browser cache (about 6 s per photo in testing).
