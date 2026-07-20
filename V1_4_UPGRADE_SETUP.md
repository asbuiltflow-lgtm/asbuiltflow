# AsBuiltFlow v1.4 Upgrade Setup

This version preserves the existing AsBuiltFlow interface and adds the missing invitation password setup plus a consolidated backend upgrade.

## What changed

- Preserved the existing marketing site, demo, and workspace UI.
- Added `/app/setup-password` for invited users.
- Updated invitations to redirect to the password setup screen.
- Hardened the invite Edge Function, including empty UUID handling.
- Added a safe v1.4 SQL upgrade for indexes, RLS, storage, notifications, realtime, and service-role grants.
- Cleaned invitation errors and contractor-role validation.
- Verified `npm run build` and `npm run lint` successfully.

## 1. Local environment

Copy `.env.example` to `.env.local` and enter:

```env
VITE_SUPABASE_URL=https://nkkbqvwmgryqpavoljfi.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Do not place an `sb_secret_` key in the frontend environment file.

Install and test:

```powershell
npm install
npm run dev
```

## 2. Run the Supabase upgrade

In Supabase, open **SQL Editor → New query**.

Copy and run:

`supabase/ASBUILTFLOW_V1_4_UPGRADE.sql`

This is the upgrade file for your existing project. Do not rerun `schema.sql` unless rebuilding a completely empty Supabase project.

## 3. Deploy the invitation function

Open:

`supabase/functions/invite-user/index.ts`

Replace the entire existing `invite-user` Edge Function with this file and deploy it.

Confirm the function secret exists:

- Name: `ASBUILTFLOW_SECRET_KEY`
- Value: the server-side Supabase key beginning with `sb_secret_`

Never put this secret in Vite or browser code.

## 4. Authentication URLs

In **Authentication → URL Configuration** set:

Site URL:

`https://www.asbuiltflow.com`

Allowed Redirect URLs:

- `https://www.asbuiltflow.com/app/setup-password`
- `http://localhost:5173/app/setup-password`

Also keep any existing production preview URLs that you actively use.

## 5. Test the invitation flow

1. Sign in as an admin.
2. Open **Team & Access**.
3. Invite a new email address.
4. Open the invitation email.
5. Accept the invitation.
6. Confirm the user lands on `/app/setup-password`.
7. Create a password.
8. Confirm the user enters `/app`.
9. Sign out and verify the new password works.

## 6. Pilot feature test

Test each item with an admin and then the applicable lower-privilege role:

- Create a project.
- Assign a coordinator, inspector, and contractor.
- Upload an as-built PDF.
- Upload field photos.
- Create and update an issue.
- Add an issue comment.
- Upload a revision.
- Change project workflow status.
- Complete checklist items.
- Open private files through signed URLs.
- Confirm activity records appear.
- Confirm notifications appear and can be marked read.
- Export the project CSV report.
- Confirm contractor users cannot access another contractor company's projects.

## Deployment

Build with:

```powershell
npm run build
```

Deploy the generated `dist` folder or push the repository to the hosting provider already connected to the site.

The included `vercel.json` supports client-side routes such as `/app/setup-password`.
