// Text-to-speech, speech recognition and answer matching — all built into the browser, no cost.
import { prefs } from './state.js';

// ---------- speaking aloud ----------
const synth = window.speechSynthesis;
export const canSpeak = !!synth;
let voice = null;
function pickVoice() {
  if (!synth) return;
  const vs = synth.getVoices().filter(v => /^en[-_]/i.test(v.lang));
  const pref = [/Samantha/i, /Google US English/i, /Aria|Jenny|Guy/i, /Natural/i, /en[-_]US/i];
  voice = null;
  for (const re of pref) { voice = vs.find(v => re.test(v.name) || re.test(v.lang)); if (voice) break; }
  if (!voice) voice = vs[0] || null;
}
if (synth) { pickVoice(); synth.addEventListener && synth.addEventListener('voiceschanged', pickVoice); }

export function say(text, { rate } = {}) {
  if (!synth || !text) return Promise.resolve();
  return new Promise(resolve => {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    if (voice) u.voice = voice;
    u.rate = rate || prefs().rate || 0.9;
    u.onend = u.onerror = () => resolve();
    synth.speak(u);
    setTimeout(resolve, 8000 + text.length * 120); // some browsers never fire onend
  });
}
export const stopSaying = () => synth && synth.cancel();

// ---------- listening ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!SR;
let active = null;

// Resolves with { alts: [transcripts…] } or rejects with an Error whose .code is the recognizer's error.
// Phones often end the second and later sessions at once with nothing heard, especially right after the
// app has spoken (the audio is still switching from playback to the mic). So: stop any speech first, and
// if a session ends empty without the learner pressing stop, start a fresh one until LISTEN_MS is up.
const LISTEN_MS = 15000;
let userStopped = false;
let emptyStreak = 0; // listens in a row that heard nothing

// Shown when a listen comes back empty; from the second miss in a row it also names the usual cause.
export function emptyText() {
  if (emptyStreak < 2) return '목소리가 들리지 않았어요. 다시 눌러 말해 보세요.';
  return '계속 목소리가 들리지 않아요. 블루투스(차량·이어폰)에 연결되어 있으면 끊거나 소리 출력을 휴대폰으로 바꿔 보세요. "입력하기"로 답해도 돼요.';
}
export function listen({ onInterim } = {}) {
  stopListening();
  userStopped = false;
  return new Promise((resolve, reject) => {
    if (!SR) { const e = new Error('unsupported'); e.code = 'unsupported'; reject(e); return; }
    const deadline = Date.now() + LISTEN_MS;
    // lastHeard keeps the longest text shown so far: iPhone Safari sometimes sends a last, empty result
    // event (or none at all) when the learner taps stop, which used to throw away what was on screen.
    let alts = [], lastHeard = '', settled = false, rec = null, tries = 0;
    const timer = setTimeout(() => { userStopped = true; if (rec) try { rec.stop(); } catch (e) {} }, LISTEN_MS);
    const finish = (err) => {
      if (settled) return; settled = true; clearTimeout(timer); active = null;
      if (err) { reject(err); return; }
      const out = alts.length ? alts : (lastHeard ? [lastHeard] : []);
      emptyStreak = out.length ? 0 : emptyStreak + 1;
      resolve({ alts: out });
    };
    const heardSomething = () => alts.length || lastHeard;
    const start = () => {
      tries++;
      rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.maxAlternatives = 5;
      rec.continuous = false;
      rec.onresult = ev => {
        // Rebuild the whole sentence from every result each time (resultIndex is unreliable on iPhone).
        const res = [...ev.results];
        const text = res.map(r => (r[0] && r[0].transcript) || '').join(' ').replace(/\s+/g, ' ').trim();
        if (res.length === 1 && res[0].isFinal) {
          const a = [...res[0]].map(x => x.transcript.trim()).filter(Boolean);
          if (a.length) alts = a;
        } else if (res.length && res.every(r => r.isFinal) && text) alts = [text];
        if (text) lastHeard = text;
        if (onInterim) onInterim(alts[0] || lastHeard);
      };
      let failed = null;
      rec.onerror = ev => {
        if (ev.error === 'no-speech' || ev.error === 'aborted') return; // handled in onend
        const e = new Error(ev.error); e.code = ev.error; failed = e;
      };
      rec.onend = () => {
        if (failed) return finish(failed);
        if (heardSomething() || userStopped || Date.now() > deadline - 1500 || tries >= 20) return finish();
        setTimeout(() => { if (!settled && !userStopped) start(); else finish(); }, 250); // ended empty: listen again
      };
      active = rec;
      try { rec.start(); }
      catch (e) { if (tries > 1) finish(); else { e.code = 'start'; finish(e); } }
    };
    // Let any spoken answer finish switching off before the mic opens.
    if (synth && (synth.speaking || synth.pending)) { synth.cancel(); setTimeout(() => (userStopped ? finish() : start()), 350); }
    else start();
  });
}
export function stopListening() { userStopped = true; if (active) { try { active.stop(); } catch (e) {} } }

export function listenErrorText(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return '마이크 권한이 꺼져 있습니다. 브라우저 설정에서 마이크를 허용하거나, "입력하기"로 답하세요.';
  if (code === 'network') return '음성 인식 서버에 연결하지 못했습니다. 인터넷 연결을 확인하거나 "입력하기"로 답하세요.';
  if (code === 'audio-capture') return '마이크를 찾지 못했습니다. "입력하기"로 답하세요.';
  if (code === 'unsupported') return '이 브라우저는 음성 인식을 지원하지 않습니다. "입력하기"로 답하세요.';
  return '음성을 인식하지 못했습니다. 다시 말하거나 "입력하기"로 답하세요.';
}

// ---------- matching ----------
const CONTRACTIONS = {
  "i'm": 'i am', "i'd": 'i would', "i've": 'i have', "i'll": 'i will', "you're": 'you are', "you'd": 'you would', "you've": 'you have', "you'll": 'you will',
  "he's": 'he is', "she's": 'she is', "it's": 'it is', "we're": 'we are', "they're": 'they are', "that's": 'that is', "there's": 'there is', "here's": 'here is',
  "what's": 'what is', "where's": 'where is', "who's": 'who is', "how's": 'how is', "let's": 'let us',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', cannot: 'can not', "won't": 'will not', "isn't": 'is not', "aren't": 'are not',
  "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not', "hasn't": 'has not', "couldn't": 'could not', "wouldn't": 'would not', "shouldn't": 'should not',
  gonna: 'going to', wanna: 'want to', gotta: 'got to',
};
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
// Words that may be left out or added without failing the answer.
const OPTIONAL = new Set(['please', 'some', 'a', 'an', 'the', 'um', 'uh', 'oh', 'okay', 'ok', 'hmm', 'er']);

export function tokens(s) {
  let t = ' ' + String(s || '').toLowerCase().replace(/[’‘`]/g, "'") + ' ';
  t = t.replace(/(\d+):00/g, "$1 o'clock").replace(/(\d+)\s*(am|pm|a\.m\.|p\.m\.)/g, '$1');
  t = t.replace(/-/g, '');                                   // wi-fi → wifi
  t = t.replace(/[^a-z0-9' ]+/g, ' ');
  t = t.replace(/[a-z']+/g, w => CONTRACTIONS[w] || w);
  t = t.replace(/\b\d+\b/g, d => NUM[+d] || d);
  t = t.replace(/'/g, '');                                   // o'clock → oclock
  return t.split(/\s+/).filter(w => w && !OPTIONAL.has(w));
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// Same words in the same order; one slightly misheard word (≤2 letters off) is forgiven in longer sentences.
function sameSentence(said, target) {
  if (said.length !== target.length) return false;
  let off = 0;
  for (let i = 0; i < target.length; i++) {
    if (said[i] === target[i]) continue;
    if (target.length >= 4 && editDistance(said[i], target[i]) <= 2) { off++; continue; }
    return false;
  }
  return off <= 1;
}

// item: { en, alt: [] }; heard: array of transcripts. Returns the matched transcript or null.
export function matches(item, heard) {
  const targets = [item.en, ...(item.alt || [])].map(tokens);
  for (const h of heard) {
    const t = tokens(h);
    if (t.length && targets.some(g => sameSentence(t, g))) return h;
  }
  return null;
}

// Typing quiz: exact word, ignoring case and outer spaces.
const plain = s => String(s || '').trim().toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ');
export const sameWord = (typed, en) => plain(typed) === plain(en);
