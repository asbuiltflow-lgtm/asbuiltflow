# AsBuiltFlow MVP Setup

## What is working now

Open `/app` to use the pilot MVP. It includes role-based demo login, projects, workflow status changes, issue creation, comments, revision/file metadata uploads, notifications, reports, search, filtering, and responsive screens. Changes persist in this browser with localStorage.

**Important:** localStorage mode is for demonstration and internal testing only. It does not safely store customer files or separate companies on a server.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/app`.

## Connect a real backend next

1. Create a free Supabase project at supabase.com.
2. Open Supabase > SQL Editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local`.
4. Paste your Supabase Project URL and anon key.
5. Install the client:
   ```bash
   npm install @supabase/supabase-js
   ```
6. Replace the localStorage adapter in `src/mvp/storage.js` with Supabase queries.
7. Create Auth users and profile rows for Admin, Coordinator, Inspector, and Contractor.
8. Verify row-level security with two different organizations before accepting confidential data.

## Before a real pilot

- Store uploaded file contents in the private `project-files` bucket.
- Add password reset, invitation emails, and account onboarding.
- Add audit logging and retention/deletion rules.
- Add virus scanning or restrict accepted file types and sizes.
- Test every role and organization boundary.
- Add backups, error monitoring, terms, privacy policy, and a data-processing agreement.
- Do not claim PDF markup is production-grade until annotations are written to database records and tested across browsers.

## Deployment

Commit and push to GitHub. Vercel will build the new `/app` route using the existing rewrite rule.
