-- Daily study reminders for 4WON'S ENGLISH. Push subscriptions live in their own table, apart from the
-- planner's push_subscriptions, so the planner's event alerts never reach the English app and vice versa.
create table if not exists public.eng_push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists eng_push_user_idx on public.eng_push_subscriptions (user_id);
alter table public.eng_push_subscriptions enable row level security;
drop policy if exists "own eng push subscriptions" on public.eng_push_subscriptions;
create policy "own eng push subscriptions" on public.eng_push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- One reminder per person per Seoul day. Written only by the eng-reminders function (service role).
create table if not exists public.eng_remind_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.eng_remind_log enable row level security;
