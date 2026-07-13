# AsBuiltFlow V1.0 Sales Demo

This build is a polished sales-demo environment. It preserves:

- `/` marketing site
- `/demo` legacy demo
- `/app` polished role-based workspace

All customer-facing demo links on the marketing site point to `/app`.

## Local test

```bash
npm install
npm run dev
```

Test `/`, `/app`, and `/demo`, then test Admin, Coordinator, Inspector, and Contractor roles.

## Important

This version uses browser-local sample data. Do not upload confidential or production customer files until Supabase authentication, database, private storage, and row-level security are connected and tested.
