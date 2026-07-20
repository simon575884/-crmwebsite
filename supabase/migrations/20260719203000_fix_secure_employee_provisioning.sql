begin;

create schema if not exists private;

create table if not exists private.user_creation_permits (
  email text primary key,
  full_name text not null,
  token_hash text not null,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

revoke all on table private.user_creation_permits from public, anon, authenticated;

create or replace function public.reserve_employee_creation(
  p_email text,
  p_full_name text,
  p_token text,
  p_requested_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(p_email));
  normalized_name text := trim(p_full_name);
begin
  if normalized_email = '' or normalized_email = 'admin@yaafu.com' then
    raise exception 'A valid employee email is required';
  end if;
  if length(normalized_name) < 2 then
    raise exception 'A valid employee name is required';
  end if;
  if length(coalesce(p_token, '')) < 20 then
    raise exception 'Invalid provisioning token';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = p_requested_by
      and role = 'admin'
      and active = true
  ) then
    raise exception 'An active administrator is required';
  end if;

  delete from private.user_creation_permits
  where expires_at <= now();

  insert into private.user_creation_permits (
    email,
    full_name,
    token_hash,
    requested_by,
    expires_at
  )
  values (
    normalized_email,
    normalized_name,
    encode(extensions.digest(p_token, 'sha256'), 'hex'),
    p_requested_by,
    now() + interval '5 minutes'
  )
  on conflict (email) do update
  set
    full_name = excluded.full_name,
    token_hash = excluded.token_hash,
    requested_by = excluded.requested_by,
    expires_at = excluded.expires_at,
    created_at = now();
end;
$$;

revoke all on function public.reserve_employee_creation(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_employee_creation(text, text, text, uuid) to service_role;

create or replace function public.clear_employee_creation_permit(
  p_email text,
  p_token text,
  p_requested_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.user_creation_permits
  where email = lower(trim(p_email))
    and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and requested_by = p_requested_by;
end;
$$;

revoke all on function public.clear_employee_creation_permit(text, text, uuid) from public, anon, authenticated;
grant execute on function public.clear_employee_creation_permit(text, text, uuid) to service_role;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role text;
  assigned_name text;
  permit_requested_by uuid;
  invite_token text := coalesce(new.raw_user_meta_data ->> 'yaafu_invite_token', '');
begin
  perform pg_advisory_xact_lock(2026071901);

  if not exists (select 1 from public.profiles) then
    if lower(coalesce(new.email, '')) <> 'admin@yaafu.com' then
      raise exception 'The first account must be admin@yaafu.com';
    end if;
    assigned_role := 'admin';
    assigned_name := coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      'Main Admin'
    );
  else
    delete from private.user_creation_permits
    where email = lower(coalesce(new.email, ''))
      and token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
      and expires_at > now()
    returning full_name, requested_by
      into assigned_name, permit_requested_by;

    if not found then
      raise exception 'Accounts must be created by the YAAFU administrator';
    end if;

    if not exists (
      select 1
      from public.profiles
      where id = permit_requested_by
        and role = 'admin'
        and active = true
    ) then
      raise exception 'The provisioning administrator is not active';
    end if;

    assigned_role := 'employee';
  end if;

  insert into public.profiles (id, full_name, email, role, active)
  values (
    new.id,
    assigned_name,
    lower(new.email),
    assigned_role,
    true
  );

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

commit;
