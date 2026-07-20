# YAAFU CRM setup

Supabase project: **Yaafu Enterprises CRM**  
Region: **ap-south-1**

## Main administrator

The application has one permanent main administrator account:

```text
admin@yaafu.com
```

The administrator password is managed by Supabase Auth and is never displayed inside the CRM. The public first-installation/setup flow has been removed.

## Deployment order

1. Apply the SQL migrations in `supabase/migrations`.
2. Deploy all folders in `supabase/functions`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the frontend environment.
4. Build with `npm run build` and deploy the generated application.

## Vercel frontend settings

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Node.js: `22.x`

Required environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

After adding or changing either value in Vercel, redeploy the latest production deployment so Vite can include the variables in the new browser bundle.
