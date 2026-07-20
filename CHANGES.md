# Implemented improvements

- Added permanent employee deletion with a protected Supabase Edge Function.
- Restricted the CRM to one main administrator (`admin@yaafu.com`).
- Removed the ability to create additional admin-role accounts from the UI.
- Kept all password fields masked; passwords are never listed in the database profile table or admin UI.
- Switched check-in/check-out to the secure `attendance-action` function.
- Enforced one attendance record per user per Pakistan calendar day.
- Prevented a second check-in after the same day has been completed.
- Added check-in and check-out confirmation dialogs.
- Added live active-time display and calculated attendance hours.
- Fixed the “This month” card to count unique attendance days.
- Disabled past leave dates and added database-side leave date validation.
- Redesigned reports so the administrator selects one user before viewing their monthly activity.
- Improved responsive navigation, cards, forms, tables, empty states and user-management UI.

## 2026-07-19 — Employee creation and password visibility
- Fixed the Supabase `Database error creating new user` failure.
- Added short-lived, server-only employee provisioning permits so public signups remain blocked.
- Deployed `create-user` Edge Function version 4 and verified successful HTTP 201 employee creation.
- Added show/hide password controls to the login and employee creation forms.
- Rebuilt the Vite application and redeployed production at https://yaafu.vercel.app.
