-- English study app: one row per user holding the whole learning state as JSON.
-- Shares the planner's Supabase project and accounts; the app merges local and server copies.
create table if not exists public.eng_state (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.eng_state enable row level security;

drop policy if exists "eng_state own select" on public.eng_state;
drop policy if exists "eng_state own insert" on public.eng_state;
drop policy if exists "eng_state own update" on public.eng_state;
drop policy if exists "eng_state own delete" on public.eng_state;
create policy "eng_state own select" on public.eng_state for select using (user_id = auth.uid());
create policy "eng_state own insert" on public.eng_state for insert with check (user_id = auth.uid());
create policy "eng_state own update" on public.eng_state for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "eng_state own delete" on public.eng_state for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.eng_state to authenticated;
