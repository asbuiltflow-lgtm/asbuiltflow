# AsBuiltFlow Sales Demo V6

## What changed

- Every customer-facing demo link on the marketing homepage now opens `/app`.
- The legacy `/demo` route remains available as a backup.
- Button wording was updated to present the role-based workspace as the primary interactive product demo.

## Routes

- `/` — marketing website
- `/app` — primary interactive sales workspace
- `/demo` — legacy demo kept as a backup
- `/privacy` — privacy page
- `/terms` — terms page

## Local testing

```bash
npm install
npm run dev
```

Open the homepage and verify that every demo/workspace link opens `/app`.

## Important

This remains a demonstration environment. Do not use confidential production documents until the backend, authentication, private storage, and organization-level permissions are connected and tested.
