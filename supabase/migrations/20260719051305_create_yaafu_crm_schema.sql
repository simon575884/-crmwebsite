begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) >= 2),
  email text not null unique,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  check_in timestamptz not null,
  check_out timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_checkout_after_checkin check (check_out is null or check_out >= check_in),
  constraint attendance_one_record_per_day unique (user_id, work_date)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  leave_type text not null check (leave_type in ('Annual Leave', 'Sick Leave', 'Casual Leave', 'Unpaid Leave')),
  from_date date not null,
  to_date date not null,
  reason text not null check (char_length(trim(reason)) >= 3),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_valid_date_range check (to_date >= from_date)
);

create index if not exists attendance_user_date_idx on public.attendance (user_id, work_date desc);
create index if not exists attendance_work_date_idx on public.attendance (work_date desc);
create index if not exists leave_requests_user_created_idx on public.leave_requests (user_id, created_at desc);
create index if not exists leave_requests_status_idx on public.leave_requests (status, created_at desc);
create index if not exists leave_requests_reviewed_by_idx on public.leave_requests (reviewed_by);

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
drop trigger if exists attendance_set_updated_at on public.attendance;
create trigger attendance_set_updated_at before update on public.attendance for each row execute function private.set_updated_at();
drop trigger if exists leave_requests_set_updated_at on public.leave_requests;
create trigger leave_requests_set_updated_at before update on public.leave_requests for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare assigned_role text;
begin
  perform pg_advisory_xact_lock(2026071901);
  if not exists (select 1 from public.profiles) then assigned_role := 'admin';
  else assigned_role := 'employee';
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
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_auth_user();

create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active = true);
$$;
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active = true);
$$;
revoke all on function private.is_active_user() from public;
revoke all on function private.is_admin() from public;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_admin() to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, role, active, updated_at) on public.profiles to authenticated;
grant select, insert, update on public.attendance to authenticated;
grant select, insert, update on public.leave_requests to authenticated;

alter table public.profiles enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.profiles force row level security;
alter table public.attendance force row level security;
alter table public.leave_requests force row level security;

create policy profiles_select_self_or_admin on public.profiles for select to authenticated
using ((select auth.uid()) = id or private.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
using (private.is_admin()) with check (role in ('admin', 'employee'));

create policy attendance_select_own_or_admin on public.attendance for select to authenticated
using ((select auth.uid()) = user_id or private.is_admin());
create policy attendance_insert_own on public.attendance for insert to authenticated
with check ((select auth.uid()) = user_id and private.is_active_user());
create policy attendance_update_own_or_admin on public.attendance for update to authenticated
using (((select auth.uid()) = user_id and private.is_active_user()) or private.is_admin())
with check (((select auth.uid()) = user_id and private.is_active_user()) or private.is_admin());

create policy leave_select_own_or_admin on public.leave_requests for select to authenticated
using ((select auth.uid()) = user_id or private.is_admin());
create policy leave_insert_own on public.leave_requests for insert to authenticated
with check ((select auth.uid()) = user_id and status = 'pending' and reviewed_by is null and reviewed_at is null and private.is_active_user());
create policy leave_admin_update on public.leave_requests for update to authenticated
using (private.is_admin()) with check (private.is_admin());

commit;
