begin;

-- The first account is permanently reserved for the YAAFU main administrator.
-- Create it once from Supabase Dashboard > Authentication > Users using
-- the exact email admin@yaafu.com. All later users must be provisioned by
-- the authenticated create-user Edge Function and are always employees.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provisioned boolean := coalesce(new.raw_app_meta_data ->> 'yaafu_provisioned', 'false') = 'true';
  requested_role text := coalesce(new.raw_app_meta_data ->> 'yaafu_role', 'employee');
  assigned_role text;
begin
  perform pg_advisory_xact_lock(2026071901);

  if not exists (select 1 from public.profiles) then
    if lower(coalesce(new.email, '')) <> 'admin@yaafu.com' then
      raise exception 'The first account must be admin@yaafu.com';
    end if;
    assigned_role := 'admin';
  else
    if not provisioned then
      raise exception 'Accounts must be created by the YAAFU administrator';
    end if;
    if requested_role = 'main_admin' then
      raise exception 'Main administrator already exists';
    end if;
    if not exists (
      select 1 from public.profiles
      where role = 'admin' and active = true
    ) then
      raise exception 'Main administrator must exist';
    end if;
    assigned_role := 'employee';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'User'), '@', 1)
    ),
    lower(new.email),
    assigned_role
  );

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

commit;
