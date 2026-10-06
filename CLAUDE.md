# Brokrbase — Claude Code Project Guide

## What This Is

**Brokrbase is a multi-user CRE broker CRM**, forked from Chriskott's personal RE-CRM on April 8, 2026. It is a separate product, not a branch — different repo, different database, different Railway project, different domain. The two codebases have diverged.

**Tagline:** "The CRM that updates itself."

**Pitch:** Voice memo a call, draft an email, finish a meeting — Brokrbase logs the activity, builds the tasks, files everything where it belongs. No more "I'll update the CRM later." No more dropped leads.

## Status

- **Live** at brokrbase.com. Railway auto-deploys from the `main` branch on GitHub — pushing to `main` ships to production.
- **First user:** Blake (NAI Select broker, Boise) has been testing since April 2026.
- The original strip (Phase 2) and multi-user prompt work (Phase 3) are **done**. There are no Idaho/MHC/Chriskott-specific prompts left; per-user identity is injected at call time from the user profile.

## Brand Identity

- **Name:** Brokrbase
- **Primary color:** `#d03238` (NAI red)
- **Text color:** `#313131` (near-black charcoal)
- **Background:** white
- **Palette:** red + gray only, no rainbow colors
- **Header font:** Domine (serif)
- **Logo:** B-skyline mark (PWA icon + favicon)

## Features (current)

Pages (routes in `client/src/App.tsx`):

| Route | What it does |
|---|---|
| `/dashboard` | Overdue tasks, recent activity, counts |
| `/contacts`, `/contacts/:id` | Contact CRUD, detail page, duplicate warnings + suggestions |
| `/properties`, `/properties/:id` | Spreadsheet-style list, detail page, type-specific fields (lease fields for office/retail/industrial, units for apartment/MHC) |
| `/tasks` | Create, list, complete (completing a task auto-logs an activity) |
| `/activities` | Activity timeline with detail/edit |
| `/email-studio` | Compose + edit with per-user voice from Settings; shows pending tasks for the contact |
| `/map` | Google Maps view: search, draggable pins, custom boundary drawing |
| `/import` | CSV/Excel contacts + properties, Google My Maps KML/KMZ |
| `/settings` | Profile, signature, voice notes, team management (admin creates users) |
| Onboarding | Self-service signup + 3-step onboarding |

Also:
- **Contact ↔ property links** with roles (owner, tenant, seller, buyer, etc.) — `contact_property_links` table.
- **Voice memo** (the killer feature) — see below.

## Voice Memo

- Transcription: Gemini inline audio (`server/_core/voiceTranscription.ts`), with thinking disabled and a model fallback chain.
- Extraction + commands: `server/routers/voiceMemo.ts`. Detects activity type (call, meeting, voicemail, email, text, note) and spoken commands ("new contact", "make a task", "log a call").
- Contact matching: `server/_core/entityResolution.ts`, with recency scoring so the most recently contacted match wins.
- Review UI: `VoiceMemoReviewPanel.tsx` + `ActionCard.tsx` / `ActionCardStack.tsx` / `lib/actionTypes.ts`. Big tappable Accept/Skip cards built for iPhone.
- **Rule: the review panel is never skipped.** Commands only pre-populate cards; the user always confirms.

## Database Safety

- MySQL on Railway (separate instance from RE-CRM), Drizzle ORM. Schema in `drizzle/schema.ts`.
- **Never run `drizzle-kit push --force` on column type changes.** It truncated the properties table once (float → double for lat/lng). Use a manual `ALTER TABLE ... MODIFY COLUMN` instead.
- Ask before any schema change that could lose data.

## Relationship to RE-CRM (the parent project)

- **Parent project location:** `/Users/chriskotttodd/dev/chriskottcrm/re-crm (1)/`
- **Parent project repo:** `chriskottmtodd-cloud/re-crm`
- **Parent project deploy:** chriskottcrm.com

The two projects share **zero infrastructure**. Never touch the parent project while working on Brokrbase. If you're editing files in `re-crm (1)`, stop — you're in the wrong folder. Fixes needed in both must be made twice. RE-CRM is a good source of proven patterns to port (the ActionCard UI came from there).

## Tech Stack

- **Frontend:** React 19 + wouter (routing) + TanStack Query + Tailwind CSS + Radix UI (shadcn/ui)
- **Backend:** Express + tRPC + Drizzle ORM
- **Database:** MySQL (Railway)
- **AI:** Gemini 2.5 Flash via OpenAI-compatible endpoint (`server/_core/llm.ts`); prompts in `server/_core/prompts.ts`
- **Transcription:** Gemini inline audio
- **Maps:** Google Maps (map view + address autocomplete)
- **Storage:** Not wired up. `server/storage.ts` is a leftover Forge proxy helper with no credentials configured.
- **Auth:** Email/password via `server/passwordAuth.ts` (includes `/api/auth/register` for self-signup)
- **Package Manager:** pnpm

## Commands

- `pnpm dev` — Start dev server (tsx watch)
- `pnpm build` — Vite frontend build + esbuild server bundle
- `pnpm check` — TypeScript type check (`tsc --noEmit`). Run after every change.
- `pnpm test` — Run tests with vitest
- `pnpm db:push` — Generate + run Drizzle migrations (see Database Safety first)

## What This Project Is NOT

- Not a billed SaaS yet (no payments, no email verification, no landing page)
- Not where Chriskott's personal data lives — that's in `re-crm (1)`
- Not a place to rebuild Chriskott's personal tools (deal narratives, listings/buyer matching, owner research, market intel)

## Style & Conventions

TypeScript strict, functional React components, tRPC end-to-end, Drizzle ORM, shadcn/ui primitives. **No emojis in code unless explicitly requested.** UI must work well one-handed on iPhone. Blake and Chriskott both test on phones.
