begin;

-- Keep every same-day work period as its own session so breaks can be derived
-- from the gap between one check-out and the next check-in.
alter table public.attendance
  drop constraint if exists attendance_one_record_per_day;

-- A user may have many completed sessions, but never two open sessions.
create unique index if not exists attendance_one_open_session_idx
  on public.attendance (user_id)
  where check_out is null;

comment on table public.attendance is
  'Employee attendance sessions. Multiple rows per user/work_date represent work periods separated by breaks.';

commit;
