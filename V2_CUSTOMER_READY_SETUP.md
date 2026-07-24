# AsBuiltFlow Customer-Ready UI Update

This package keeps the existing backend, invitations, and permanent-user-removal function while polishing the demo and workspace layout.

## Included

- Cleaner spacing, typography, cards, tables, and dashboard hierarchy
- Demo layout aligned with the authenticated workspace
- Fixed sticky demo banner/header overlap
- Responsive navigation drawer and mobile overlay
- Improved mobile dashboard, tables, workflow, and action cards
- Customer-safe fallback screen when production environment variables are missing
- Fresh public npm lockfile suitable for Vercel

## Deploy

Copy these files into the Git repository that contains `.git`, excluding `node_modules`, `dist`, and any local `.env` file. Then run:

```powershell
npm install
npm run build
git add .
git commit -m "Polish AsBuiltFlow customer demo and workspace"
git push
```

In Vercel, make sure Production contains:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

After saving variables, redeploy the latest commit.
