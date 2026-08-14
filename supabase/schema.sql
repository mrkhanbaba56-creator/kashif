-- kashu.ecomauto free multi-user backend
-- Run this entire file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default 'Seller',
  role text not null default 'seller' check (role in ('seller', 'agent', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_assignments (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references public.profiles(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint seller_and_agent_are_different check (seller_id <> agent_id)
);

create table if not exists public.support_tasks (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  assigned_agent uuid references public.profiles(id) on delete set null,
  platform text not null,
  title text not null check (char_length(title) between 3 and 180),
  details text not null check (char_length(details) between 3 and 3000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tasks_seller_idx on public.support_tasks(seller_id);
create index if not exists support_tasks_agent_idx on public.support_tasks(assigned_agent);
create index if not exists support_tasks_status_idx on public.support_tasks(status);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Seller'), '@', 1)),
    'seller'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles if Auth users existed before this schema was installed.
insert into public.profiles (id, email, full_name, role)
select
  id,
  coalesce(email, ''),
  coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(email, 'Seller'), '@', 1)),
  'seller'
from auth.users
on conflict (id) do nothing;

create or replace function public.current_role()
returns text
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.can_view_profile(target_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select
    target_id = auth.uid()
    or public.current_role() = 'admin'
    or exists (
      select 1 from public.agent_assignments
      where agent_id = auth.uid() and seller_id = target_id and active = true
    )
    or exists (
      select 1 from public.agent_assignments
      where seller_id = auth.uid() and agent_id = target_id and active = true
    );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_support_tasks_updated_at on public.support_tasks;
create trigger set_support_tasks_updated_at
  before update on public.support_tasks
  for each row execute procedure public.set_updated_at();

create or replace function public.set_default_agent()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.assigned_agent is null then
    select agent_id into new.assigned_agent
    from public.agent_assignments
    where seller_id = new.seller_id and active = true
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists set_support_task_agent on public.support_tasks;
create trigger set_support_task_agent
  before insert on public.support_tasks
  for each row execute procedure public.set_default_agent();

alter table public.profiles enable row level security;
alter table public.agent_assignments enable row level security;
alter table public.support_tasks enable row level security;

drop policy if exists "profiles_select_allowed" on public.profiles;
create policy "profiles_select_allowed" on public.profiles
  for select to authenticated
  using (public.can_view_profile(id));

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "assignments_select_allowed" on public.agent_assignments;
create policy "assignments_select_allowed" on public.agent_assignments
  for select to authenticated
  using (public.current_role() = 'admin' or seller_id = auth.uid() or agent_id = auth.uid());

drop policy if exists "assignments_admin_insert" on public.agent_assignments;
create policy "assignments_admin_insert" on public.agent_assignments
  for insert to authenticated
  with check (public.current_role() = 'admin');

drop policy if exists "assignments_admin_update" on public.agent_assignments;
create policy "assignments_admin_update" on public.agent_assignments
  for update to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "assignments_admin_delete" on public.agent_assignments;
create policy "assignments_admin_delete" on public.agent_assignments
  for delete to authenticated
  using (public.current_role() = 'admin');

drop policy if exists "tasks_select_allowed" on public.support_tasks;
create policy "tasks_select_allowed" on public.support_tasks
  for select to authenticated
  using (
    public.current_role() = 'admin'
    or seller_id = auth.uid()
    or assigned_agent = auth.uid()
  );

drop policy if exists "tasks_seller_insert" on public.support_tasks;
create policy "tasks_seller_insert" on public.support_tasks
  for insert to authenticated
  with check (
    (seller_id = auth.uid() and public.current_role() = 'seller')
    or public.current_role() = 'admin'
  );

drop policy if exists "tasks_agent_admin_update" on public.support_tasks;
create policy "tasks_agent_admin_update" on public.support_tasks
  for update to authenticated
  using (public.current_role() = 'admin' or assigned_agent = auth.uid())
  with check (public.current_role() = 'admin' or assigned_agent = auth.uid());

drop policy if exists "tasks_admin_delete" on public.support_tasks;
create policy "tasks_admin_delete" on public.support_tasks
  for delete to authenticated
  using (public.current_role() = 'admin');

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.agent_assignments to authenticated;
grant select, insert, update, delete on public.support_tasks to authenticated;

-- IMPORTANT: after you create your own account, make yourself Admin once:
-- update public.profiles set role = 'admin' where email = 'YOUR_EMAIL@example.com';
