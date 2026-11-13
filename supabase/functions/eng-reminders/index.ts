// Daily study reminder for 4WON'S ENGLISH, run every 10 minutes by pg_cron.
// Each learner picks a time (eng_state.data.prefs.remindTime, Seoul time, default 21:00). From that time
// until three hours later, a learner who has not studied today (no data.days[today]) gets one push on
// every device in eng_push_subscriptions. eng_remind_log keeps it to one per day.
// A signed-in user can POST { test: true } to get a test push on their own devices right away.
// Deploy: npx -y supabase functions deploy eng-reminders --project-ref <ref> --no-verify-jwt
// Uses the planner's project secrets: CRON_SECRET, VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const DEFAULT_TIME = '21:00';
const LATE = 180; // minutes after the chosen time during which a missed reminder still goes out
const TABLE = 'eng_push_subscriptions';

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string };
type Doc = { days?: Record<string, number>; prefs?: { remindTime?: string } };

// Seoul wall clock: today's date string and minutes since midnight.
function seoulNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}
const toMinutes = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? +t.slice(0, 2) * 60 + +t.slice(3) : toMinutes(DEFAULT_TIME));
function streak(days: Record<string, number>, today: string) {
  let n = 0;
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1); // today not studied yet: count up to yesterday
  while (days[d.toISOString().slice(0, 10)]) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}

let vapidReady = false;
async function send(admin: SupabaseClient, subs: Sub[], payload: Record<string, unknown>) {
  if (!vapidReady) { webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!); vapidReady = true; }
  let sent = 0;
  const failures: string[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 3, urgency: 'normal' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from(TABLE).delete().eq('endpoint', s.endpoint); // device unsubscribed
      else failures.push(`${code ?? ''} ${(e as Error).message}`.trim());
    }
  }
  return { sent, failures };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const secret = Deno.env.get('CRON_SECRET');
  const isCron = !!secret && req.headers.get('x-cron-secret') === secret;
  if (!isCron) {
    // Test push for the signed-in user.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    if (!u?.user) return json({ error: 'unauthorized' }, 401);
    const { data: subs } = await admin.from(TABLE).select('endpoint,user_id,p256dh,auth').eq('user_id', u.user.id);
    const r = await send(admin, (subs ?? []) as Sub[], { title: '알림이 잘 도착했어요', body: '매일 정한 시간에 오늘의 공부를 알려 드릴게요.', url: './#home', tag: 'eng-test' });
    return json(r);
  }

  const now = seoulNow();
  const { data: subs, error } = await admin.from(TABLE).select('endpoint,user_id,p256dh,auth');
  if (error) return json({ error: error.message }, 500);
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  if (!byUser.size) return json({ users: 0, sent: 0 });

  const { data: states } = await admin.from('eng_state').select('user_id,data').in('user_id', [...byUser.keys()]);
  const docs = new Map((states ?? []).map(r => [r.user_id as string, (r.data ?? {}) as Doc]));
  let sent = 0, due = 0;
  const failures: string[] = [];
  for (const [uid, mine] of byUser) {
    const doc = docs.get(uid) ?? {};
    const days = doc.days ?? {};
    const at = toMinutes(doc.prefs?.remindTime ?? DEFAULT_TIME);
    if (now.minutes < at || now.minutes >= at + LATE) continue;
    if (days[now.day]) continue; // already studied today
    due++;
    // Claim today's reminder first so overlapping runs can't both send it.
    const { data: claimed, error: claimErr } = await admin.from('eng_remind_log')
      .upsert({ user_id: uid, day: now.day }, { onConflict: 'user_id,day', ignoreDuplicates: true }).select('user_id');
    if (claimErr) { failures.push(claimErr.message); continue; }
    if (!claimed?.length) continue;
    const n = streak(days, now.day);
    const r = await send(admin, mine, {
      title: n ? `${n}일 연속 학습 중이에요` : '오늘의 영어, 아직 시작 전이에요',
      body: n ? '오늘도 이어가면 연속 기록이 하루 늘어나요. 한 챕터면 충분해요.' : '단어 한 챕터나 말하기 한 회차, 10분이면 끝나요.',
      url: './#home',
      tag: 'eng-daily',
    });
    sent += r.sent; failures.push(...r.failures);
  }
  return json({ users: byUser.size, due, sent, failures });
});
