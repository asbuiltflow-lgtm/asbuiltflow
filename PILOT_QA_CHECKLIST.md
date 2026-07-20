# AsBuiltFlow Controlled Pilot QA Checklist

## Website and routing
- [ ] Homepage loads at `/`
- [ ] Explore Demo opens `/demo`
- [ ] Sign In opens `/app`
- [ ] `/app` redirects unauthenticated visitors to sign in

## Authentication
- [ ] Admin can sign in and sign out
- [ ] Logout icon shows pointer/hover/title and works by keyboard
- [ ] Password reset email arrives
- [ ] Recovery link allows a new password to be saved
- [ ] Deactivated account is blocked

## Team and permissions
- [ ] Admin can add contractor companies
- [ ] Admin can send a user invitation
- [ ] Invited user can set a password and sign in
- [ ] Admin can change a user role
- [ ] Admin can deactivate a user
- [ ] Contractor sees only its company’s projects
- [ ] Inspector sees only assigned projects
- [ ] Viewer cannot create or change records

## Project workflow
- [ ] Admin/Coordinator can create a project
- [ ] Project number uniqueness is handled clearly
- [ ] Contractor, Coordinator and Inspector assignments save
- [ ] Only role-permitted workflow transitions are clickable
- [ ] Checklist items persist
- [ ] Project dashboard and reports update from real data

## Issues
- [ ] Issue can be created and assigned
- [ ] Issue status persists
- [ ] Comments persist and display author/time
- [ ] Issue appears in project and All Issues views

## Files and mobile
- [ ] PDF upload saves to private Storage
- [ ] Mobile photo control opens camera/gallery
- [ ] Upload progress and error message appear
- [ ] Signed Open link works for authorized user
- [ ] Unauthorized user cannot open the same file
- [ ] Revision creates a preserved file and revision record
- [ ] File type/50 MB limits are enforced

## Audit and notifications
- [ ] Project/issue actions appear in Activity
- [ ] Assigned users receive in-app notifications
- [ ] Notification count clears when marked read
- [ ] Realtime updates appear across two logged-in browsers

## Production preview
- [ ] Vercel preview has environment variables
- [ ] Supabase production and preview redirect URLs are configured
- [ ] No `.env.local` or secret key is committed
- [ ] Browser console shows no unexpected errors
- [ ] Test data is removed before the first real pilot
