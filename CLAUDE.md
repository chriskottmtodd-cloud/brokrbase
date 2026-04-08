# Brokrbase — Claude Code Project Guide

## What This Is

**Brokrbase is a stripped, multi-user CRE broker CRM forked from Chriskott's personal RE-CRM on April 8, 2026.** It is a separate product, not a branch — different repo, different database, different Railway project, different domain. The two codebases will diverge.

**Tagline:** "The CRM that updates itself."

**Pitch:** Voice memo a call, draft an email, finish a meeting — Brokrbase logs the activity, builds the tasks, files everything where it belongs. No more "I'll update the CRM later." No more dropped leads.

## Status (as of the fork)

This is a fresh fork. The codebase is currently a 1:1 copy of `re-crm` and has not yet been stripped. **Phase 2 (the strip) has not happened yet.** Until it does, expect Idaho/MHC/Chriskott references everywhere — those are temporary and will be removed.

## Brand Identity

- **Name:** Brokrbase
- **Primary color:** `#d03238` (NAI red, matching the broker's referrer NAI Select)
- **Text color:** `#313131` (near-black charcoal)
- **Background:** white
- **Header font:** Domine (serif), to match NAI Select
- **Logo:** TBD (text wordmark for v1)

## Relationship to RE-CRM (the parent project)

- **Parent project location:** `/Users/chriskotttodd/Desktop/Manus CRM/re-crm (1)/`
- **Parent project repo:** `chriskottmtodd-cloud/re-crm`
- **Parent project deploy:** chriskottcrm.com
- **Parent project users:** Chriskott Todd (single user)

The two projects share **zero infrastructure**. Different DBs, different env vars, different deploys. The parent project should never be touched while working on Brokrbase. If you're editing files in `re-crm (1)`, stop — you're in the wrong folder.

Code changes in Brokrbase do **not** propagate back to RE-CRM. If a bug fix is needed in both, it has to be made twice.

## v1 Feature Set (post-strip)

These nine features are the v1. Everything else gets stripped.

1. Auth + user profile (multi-user from day one)
2. Contacts (CRUD + detail page)
3. Properties (CRUD + detail page)
4. Activities (log + timeline + detail/edit modal)
5. Tasks (create, list, complete)
6. Voice memo button (the killer feature)
7. Email Studio (compose + edit, with per-user voice from Settings)
8. Dashboard (overdue tasks, recent activity, counts)
9. Settings page (profile, signature, voice notes)

## What Gets Stripped in Phase 2

| Feature | Why |
|---|---|
| Listings + buyer interests + buyer criteria | Mature-broker workflow, advanced |
| Deal narratives, active deal stack | Assumes Chriskott's specific workflow |
| Owner research + Enformion | Idaho-specific, expensive API integration |
| Market intel + markets config | Personal feature |
| Map view | Google Maps cost, optional |
| Follow-up radar | Add later if needed |
| Imports (properties + enriched) | New users start empty |
| Data cleanup | Personal maintenance tools |
| AI Assistant tabs (Quick Log, Deal Match, Outreach, etc.) | Replaced by voice memo as the single AI capture surface |
| Unit mix / rent rolls | Asset-class specific, defer |
| Sale records, deal activities, unsolicited offers | Defer |
| Most of `ai.ts` router | Keep only voice memo extraction |

## Multi-User Requirements (Phase 3)

Every AI prompt that touches user identity must read from the user profile, not from a hardcoded constant. Specifically:

1. **`STYLE_PROMPT` in `client/src/pages/email-studio/index.tsx`** — currently hardcoded with Chriskott's name. Must be moved server-side and parameterized via `buildEmailStylePrompt(user)`.
2. **`EMAIL_STYLE_PROMPT` in `server/_core/prompts.ts`** — same fix.
3. **`CRE_SYSTEM_BASE`** — currently says "specializing in MHC and apartment investment sales in Idaho." Must be genericized.
4. **`SYSTEM_PRICING`, `SYSTEM_OUTREACH`, `SYSTEM_PROCESS_NOTES`** — audit for Idaho/MHC defaults.
5. **Voice memo extraction prompt** — already user-aware (uses each user's contacts/properties for Whisper priming).

## Tech Stack (inherited from parent project, unchanged)

- **Frontend:** React 19 + wouter (routing) + TanStack Query + Tailwind CSS + Radix UI (shadcn/ui)
- **Backend:** Express + tRPC + Drizzle ORM
- **Database:** MySQL (separate Railway instance from RE-CRM)
- **AI:** Gemini 2.5 Flash via OpenAI-compatible endpoint
- **Transcription:** Gemini inline audio (replaced Whisper proxy)
- **Storage:** TBD (Forge proxy was removed; rebuild needed if file uploads required)
- **Maps:** None (stripped in Phase 2)
- **Auth:** Email/password via existing `passwordAuth` (no OAuth in v1)
- **Package Manager:** pnpm

## Commands

- `pnpm dev` — Start dev server (tsx watch)
- `pnpm build` — Vite frontend build + esbuild server bundle
- `pnpm check` — TypeScript type check (`tsc --noEmit`). Run after every change.
- `pnpm test` — Run tests with vitest
- `pnpm db:push` — Generate + run Drizzle migrations (or use `npx drizzle-kit push` for direct apply)

## What This Project Is NOT

- Not a SaaS yet (no billing, no signup wizard, no email verification, no landing page in v1)
- Not the production system for any paying customer
- Not where Chriskott's personal data lives — that's in `re-crm (1)`
- Not a place to add Idaho-specific or MHC-specific features
- Not where Chriskott's deal pipeline / listings / market intel get rebuilt

## Style & Conventions

Same as parent project: TypeScript strict, functional React components, tRPC end-to-end, Drizzle ORM, shadcn/ui primitives. **No emojis in code unless explicitly requested.**

## The First User

Brokrbase is being built specifically so **Blake** (one specific broker friend of Chriskott's) can try it. Blake's user account will be created manually by Chriskott. There is no signup flow in v1.

After Blake validates the value prop (or doesn't), the next steps depend on his feedback.
