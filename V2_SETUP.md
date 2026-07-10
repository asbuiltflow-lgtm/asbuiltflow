# AsBuiltFlow Pilot Workspace v2

## What is working now
- Separate role-based navigation and dashboards for Admin, Coordinator, Inspector, and Contractor.
- Contractor project filtering.
- Inspector assignment filtering.
- Project assignment controls for coordinators/admins.
- Mobile camera/gallery photo input (`accept=image/*` and `capture=environment`).
- PDF, field-photo, and revision upload demonstrations.
- Project closeout checklist, workflow transitions, issue tracking, comments, revisions, notifications, reports, files, and audit history.
- Browser persistence through localStorage.

## Important limitation
Selected files are represented by metadata in the demo. The browser-only build does not upload file bytes to secure cloud storage. Do not use confidential customer documents until Supabase is connected and security policies are tested.

## Run locally
```bat
npm install
npm run dev
```
Open `http://localhost:5173/app`.

## Next production steps
1. Create a Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Add Supabase URL and anon key to `.env` using `.env.example`.
4. Replace localStorage actions with authenticated Supabase queries and Storage uploads.
5. Test every role with separate accounts and confirm contractors cannot retrieve other contractors' data.
6. Configure transactional email notifications.
7. Add error monitoring, backups, rate limits, file scanning, and a pilot agreement before accepting confidential documents.
