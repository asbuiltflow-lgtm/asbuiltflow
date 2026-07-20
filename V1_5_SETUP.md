# AsBuiltFlow v1.5 setup

## New secure user removal function
Deploy `supabase/functions/remove-user/index.ts` as an Edge Function named `remove-user`.
Use the same `ASBUILTFLOW_SECRET_KEY` secret already configured for `invite-user`.

The function permits only active administrators, blocks self-removal, and refuses permanent removal when the user has project or audit history. Deactivation remains available for those users.

## Demo parity
The `/demo` route now uses the same workspace shell, navigation, cards, tables, workflow, issue, files, reports, and activity styling as `/app`. It uses sample data and clearly identifies Demo Mode.
