begin;

-- Only one main administrator can exist.
create unique index if not exists profiles_single_admin_idx
  on public.profiles (role)
  where role = 'admin';

-- Auth users must be provisioned by the approved server-side functions.
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
  if not provisioned then
    raise exception 'Accounts must be created by the YAAFU administrator';
  end if;

  perform pg_advisory_xact_lock(2026071901);

  if requested_role = 'main_admin' then
    if lower(coalesce(new.email, '')) <> 'admin@yaafu.com' then
      raise exception 'Invalid main administrator email';
    end if;
    if exists (select 1 from public.profiles) then
      raise exception 'Main administrator already exists';
    end if;
    assigned_role := 'admin';
  else
    if not exists (select 1 from public.profiles where role = 'admin' and active = true) then
      raise exception 'Main administrator must be created first';
    end if;
    assigned_role := 'employee';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, 'User'), '@', 1)),
    lower(new.email),
    assigned_role
  );

  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public;

-- Attendance writes are handled only by the attendance-action Edge Function.
drop policy if exists attendance_insert_own on public.attendance;
drop policy if exists attendance_update_own_or_admin on public.attendance;
revoke insert, update, delete on public.attendance from authenticated;
grant select on public.attendance to authenticated;

-- Profile changes are handled only by server-side account functions.
drop policy if exists profiles_admin_update on public.profiles;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- Block past leave dates at submission time in Pakistan Standard Time.
create or replace function private.validate_leave_request_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  pakistan_today date := (now() at time zone 'Asia/Karachi')::date;
begin
  if new.from_date < pakistan_today then
    raise exception 'Leave start date cannot be in the past';
  end if;
  if new.to_date < new.from_date then
    raise exception 'Leave end date cannot be before start date';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_leave_request_dates() from public;

drop trigger if exists leave_requests_validate_dates on public.leave_requests;
create trigger leave_requests_validate_dates
before insert or update of from_date, to_date on public.leave_requests
for each row execute function private.validate_leave_request_dates();

-- Employee deletion now uses auth.admin.deleteUser in a protected Edge Function.
drop function if exists public.remove_employee(uuid);
drop function if exists private.remove_employee_internal(uuid);

commit;
