# AsBuiltFlow 1.2 — Supabase foundation

This build separates the public demo from the secure application:

- `/` marketing website
- `/demo` interactive sample-data workspace
- `/app` Supabase-authenticated workspace

## 1. Environment variables

Create `.env.local` beside `package.json`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Never put a Supabase secret/service-role key in this Vite project.

## 2. Database and storage

In Supabase, open **SQL Editor**, create a new query, paste the complete contents of `supabase/schema.sql`, and run it.

The script creates:

- organizations and contractor companies
- profiles and fixed roles
- projects and project assignments
- files, revisions, issues, comments, checklists
- activity events and notifications
- private `project-files` storage bucket
- Row Level Security policies
- first-user organization bootstrap

## 3. Create the first account

In Supabase Authentication, create a user using `gage@asbuiltflow.com`, or temporarily enable email signups and create the account through the Auth API. When that user first signs into `/app`, the app calls `bootstrap_organization` and creates the first AsBuiltFlow organization and Admin profile.

For a pilot, keep public sign-up disabled and create/invite users from Supabase until a secure server-side invite function is deployed.

## 4. Run locally

```bash
npm install
npm run dev
```

Open:

- `http://localhost:5173/demo` for the sample workspace
- `http://localhost:5173/app` for real sign-in

## Current boundary

Authentication, session persistence, organization/profile bootstrap, schema, RLS, and private storage configuration are included. The existing workspace UI still uses browser sample project data after authentication. The next implementation step is replacing project/issue/file operations in `MvpApp.jsx` with Supabase queries and resumable uploads.

Do not claim that real projects are cloud-backed until that data-layer conversion is complete.
