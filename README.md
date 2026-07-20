# YAAFU Enterprises CRM

React + Vite workforce CRM connected to Supabase Auth, Postgres and Edge Functions.

## Included improvements

- Exactly one main administrator: `admin@yaafu.com`.
- Admin-created employees are stored in Supabase Auth and `public.profiles`.
- Employee passwords are never returned or displayed by the CRM.
- Employees can be activated, deactivated or permanently deleted by the main admin.
- One attendance record per user per Pakistan calendar day.
- Live active-duration display and calculated hours per attendance record.
- Check-in and check-out confirmation dialogs.
- Leave start dates cannot be in the past, in both the UI and database validation.
- Reports are opened per user instead of mixing every employee in one table.

## Local run

1. Run `npm install`.
2. Copy `.env.example` to `.env` and add the Supabase project URL and publishable key.
3. Run `npm run dev`.
4. Sign in with the permanent main administrator account.
5. Create employee accounts from **Users** in the admin panel.

## Vercel deployment

Import the GitHub repository into Vercel. The included `vercel.json` pins the project to Vite, uses `npm run build`, and publishes the `dist` directory.

Add these variables in **Vercel → Project Settings → Environment Variables** before deploying:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Enable them for Production and Preview, then redeploy the latest commit. A variable added after a deployment does not affect that existing deployment.

Only use a Supabase publishable key in the frontend. Never add a secret or service-role key to Vercel's `VITE_` variables.

If the variables are missing or invalid, the application shows a deployment setup screen instead of failing with a blank page.

## Supabase components

Tables:

- `profiles`
- `attendance`
- `leave_requests`

Edge Functions:

- `create-user`
- `attendance-action`
- `set-user-status`
- `delete-user`

All public tables use Row Level Security. Secret/service-role keys are used only inside Edge Functions and must never be exposed in the frontend.
