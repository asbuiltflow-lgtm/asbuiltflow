# AsBuiltFlow 1.3 — Controlled Pilot Setup

This build separates the public sample demo from the secure Supabase workspace:

- `/` — company website
- `/demo` — browser-only sample-data demo
- `/app` — authenticated pilot workspace using Supabase

## What is real in `/app`

- Authentication, logout, session persistence, password reset and protected routing
- Organization and profile identity
- Role-scoped project visibility through Row Level Security
- Projects, contractor companies, assignments, statuses and checklists
- Issues, assignments, comments and resolution statuses
- Private PDF/photo storage with signed file links
- Mobile camera/gallery photo input
- Revisions that preserve prior files
- Activity history, in-app notifications, search, reports and CSV export
- Admin access management and invite flow through a Supabase Edge Function

## Step 1 — Copy environment settings

Create `.env.local` beside `package.json`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Never place a Supabase secret/service-role key in this Vite project.

## Step 2 — Apply the pilot migration

You already ran `supabase/schema.sql`. Now open:

```text
supabase/pilot_migration.sql
```

Copy the entire file into **Supabase → SQL Editor → New query**, then run it once.

This migration:

- Adds profile email support
- Applies required table grants
- strengthens organization/project RLS
- secures the private `project-files` bucket
- enables realtime updates
- adds basic project and issue notifications
- sets the Free-plan bucket limit to 50 MB per file

## Step 3 — Configure Auth URLs

In **Supabase → Authentication → URL Configuration**:

- Site URL while testing locally: `http://localhost:5173`
- Add redirect URL: `http://localhost:5173/app`
- Before production, change Site URL to `https://www.asbuiltflow.com`
- Add production redirect URL: `https://www.asbuiltflow.com/app`
- A Vercel preview wildcard can be added separately while testing previews.

## Step 4 — Deploy the invite-user function

The function source is:

```text
supabase/functions/invite-user/index.ts
```

You may deploy it from the Supabase Dashboard or CLI.

### Dashboard method

1. Open **Edge Functions** in Supabase.
2. Create a function named `invite-user`.
3. Replace its code with the included `index.ts` contents.
4. Deploy it.
5. Keep JWT verification enabled.

### CLI method

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy invite-user
```

The function uses Supabase-provided server secrets and never exposes the service-role key to the browser.

## Step 5 — Run locally

```bash
npm install
npm run dev
```

Open:

- `http://localhost:5173/demo`
- `http://localhost:5173/app`

## Step 6 — First pilot setup

Sign in as the organization admin, then:

1. Open **Team & Access**.
2. Add each contractor company.
3. Invite a Coordinator, Inspector and Contractor user.
4. Create one test project.
5. Assign the contractor, coordinator and inspector.
6. Upload a non-confidential test PDF and mobile photo.
7. Create an issue, comment on it, upload a revision and approve the project.

## Step 7 — Required isolation test

Before accepting customer documents, create a second test organization in a separate Supabase project or controlled test setup and verify:

- Contractor users see only projects for their contractor company.
- Inspectors see only projects assigned to them.
- A user cannot retrieve another organization’s rows through the browser or API.
- Signed file URLs fail for users without project access.
- Deactivated users can no longer enter the workspace.

## Step 8 — Deploy to Vercel preview first

Add these Vercel environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Deploy a preview, test `/`, `/demo`, `/app`, password reset, invitations and mobile uploads, then promote that deployment to production.

## File-size note

The Supabase Free plan allows a maximum configured limit of 50 MB per file. For large plan sets, upgrade the project and raise both the global Storage limit and bucket limit. For production PDFs over roughly 6 MB or unstable field connections, resumable uploads should be the next infrastructure upgrade.

## Controlled-pilot boundary

This build is intended for a small, closely supported early-access pilot after the setup and isolation tests above. It has not received an independent security audit, formal penetration test, SOC 2 review or enterprise compliance certification. Do not represent it as audited enterprise software.
