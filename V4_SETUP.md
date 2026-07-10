# AsBuiltFlow V4 — Sales Demo Workspace

V4 is designed to look and behave like a polished pilot product during sales calls and prospect reviews.

## Included

- Role-specific Admin, Coordinator, Inspector, and Contractor experiences
- Project dashboards, closeout workflow controls, issue management, comments, revisions, file history, reports, and audit trail
- Mobile camera/gallery photo selection
- Mobile PDF selection
- Guided demo path for each role
- CSV portfolio export
- Responsive navigation and mobile project workspace
- Professional demo disclosures instead of developer-facing warnings
- Improved visual hierarchy, cards, tables, project health, workflow summaries, and login presentation

## Important limitation

This build still uses browser storage and records selected file metadata only. It must not be used for confidential or production documents until Supabase authentication, database storage, private object storage, and row-level security are connected and tested.

## Run locally

```bash
npm install
npm run dev
```

Open `/app`.

## Sales demo flow

1. Start as Coordinator and show project routing.
2. Open Bedford Fiber Expansion and show issue pins, files, revisions, checklist, and audit history.
3. Sign out and switch to Contractor to show restricted project access and mobile photo/revision upload controls.
4. Switch to Inspector to show review and approval actions.
5. Switch to Admin to show portfolio reports, team roles, and CSV export.

## Before a real pilot

Connect Supabase using the included `supabase/schema.sql`, replace browser persistence with database calls, store uploads in private buckets, verify role policies, add password recovery, and configure transactional email.
