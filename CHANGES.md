# Implemented improvements

- Added permanent employee deletion with a protected Supabase Edge Function.
- Restricted the CRM to one main administrator (`admin@yaafu.com`).
- Removed the ability to create additional admin-role accounts from the UI.
- Kept all password fields masked; passwords are never listed in the database profile table or admin UI.
- Switched check-in/check-out to the secure `attendance-action` function.
- Supports multiple check-in/check-out sessions on the same Pakistan calendar day.
- Allows a shift to cross midnight: checkout always closes the active session, regardless of the new calendar date.
- Groups same-day sessions into an admin timeline with calculated break gaps.
- Prevents overlapping open sessions while allowing completed sessions to be followed by a new check-in.
- Added an admin-only action to clear an employee's attendance for a selected day.
- Added check-in and check-out confirmation dialogs.
- Added live active-time display and calculated attendance hours.
- Fixed the “This month” card to count unique attendance days.
- Disabled past leave dates and added database-side leave date validation.
- Redesigned reports so the administrator selects one user before viewing their monthly activity.
- Improved responsive navigation, cards, forms, tables, empty states and user-management UI.
- Added live employee status with exact check-in time and a second-by-second active timer.
- Improved leave date guidance, calendar-day count, reason guidance and client/server validation.
- Updated logo presentation so the complete brand mark is visible instead of cropped.

## 2026-07-19 — Employee creation and password visibility
- Fixed the Supabase `Database error creating new user` failure.
- Added short-lived, server-only employee provisioning permits so public signups remain blocked.
- Deployed `create-user` Edge Function version 4 and verified successful HTTP 201 employee creation.
- Added show/hide password controls to the login and employee creation forms.
- Rebuilt the Vite application and redeployed production at https://yaafu.vercel.app.
