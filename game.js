// Игровая логика «Детский доктор».
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } },
};

const SHIFT_SIZE = 5;
const SLOTS = 3;
const RANKS = [
  [0, 'Интерн'], [1000, 'Ординатор'], [3000, 'Участковый педиатр'],
  [6000, 'Педиатр I категории'], [10000, 'Педиатр высшей категории'], [15000, 'Заведующий отделением'],
];
// Вероятность уровня сложности случая для каждой должности (индекс = должность).
const LEVEL_WEIGHTS = [
  { 1: 0.75, 2: 0.25 },
  { 1: 0.35, 2: 0.5, 3: 0.15 },
  { 2: 0.4, 3: 0.45, 4: 0.15 },
  { 3: 0.45, 4: 0.4, 5: 0.15 },
  { 3: 0.2, 4: 0.45, 5: 0.35 },
  { 4: 0.4, 5: 0.6 },
];
const levelMult = lvl => 1 + 0.25 * (lvl - 1);
const CODE_MULT = 1.5;
const CODE_PENALTY_SEC = 15;
const CAT_NAMES = { a: 'анамнез', e: 'осмотр', t: 'обследование' };

// ---------- профили ----------
function newStats() {
  return { patients: 0, correct: 0, points: 0, shifts: 0, seen: {}, codeBag: [], codesSeen: {} };
}
let profiles = store.get('ped_profiles', null);
if (!profiles) {
  // перенос профиля из первой версии игры
  profiles = { slots: [null, null, null], active: 0 };
  const old = store.get('ped_profile', null);
  if (old) {
    const st = Object.assign(newStats(), store.get('ped_stats', {}));
    const seen = {};
    for (const id in (st.seen || {})) seen[id] = 0;
    st.seen = seen;
    profiles.slots[0] = { name: old.name, seed: old.seed, avatar: old.avatar, stats: st };
  }
  store.set('ped_profiles', profiles);
}
const prof = () => profiles.slots[profiles.active];
const saveProfiles = () => store.set('ped_profiles', profiles);

let soundOn = store.get('ped_sound', true);
let shift = null;
let cur = null;
let code = null;
let frame = 0;

// ---------- звук ----------
let actx = null;
function beep(freq, dur, type, vol) {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.value = vol || 0.04;
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (dur || 0.08));
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + (dur || 0.08));
  } catch (e) { /* без звука */ }
}
const sfx = {
  click: () => beep(660, 0.05),
  talk: () => beep(300 + Math.random() * 200, 0.03, 'square', 0.02),
  door: () => { beep(392, 0.1); setTimeout(() => beep(523, 0.12), 110); },
  good: () => { beep(523, 0.1); setTimeout(() => beep(659, 0.1), 100); setTimeout(() => beep(784, 0.18), 200); },
  bad: () => { beep(220, 0.2, 'sawtooth', 0.03); setTimeout(() => beep(165, 0.3, 'sawtooth', 0.03), 180); },
  siren: () => { for (let i = 0; i < 6; i++) setTimeout(() => beep(i % 2 ? 660 : 880, 0.22, 'triangle', 0.05), i * 240); },
};

// ---------- утилиты ----------
function rankIndex(points) {
  let r = 0;
  RANKS.forEach(([p], i) => { if (points >= p) r = i; });
  return r;
}
const rankOf = points => RANKS[rankIndex(points)][1];
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function show(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

function paintAvatar(canvas, p) {
  p = p || prof();
  if (p && p.avatar) {
    const img = new Image();
    img.onload = () => { canvas.width = img.width; canvas.height = img.height; canvas.getContext('2d').drawImage(img, 0, 0); };
    img.src = p.avatar;
  } else {
    PX.drawDoctorAvatar(canvas, (p && p.seed) || 1);
  }
}

// ---------- главное меню ----------
function refreshTitle() {
  const p = prof();
  if (p) {
    $('#title-doctor').classList.remove('hidden');
    $('#title-name').textContent = 'Д-р ' + p.name;
    $('#title-rank').textContent = `${rankOf(p.stats.points)} · принято пациентов: ${p.stats.patients}`;
    paintAvatar($('#title-avatar'));
  } else {
    $('#title-doctor').classList.add('hidden');
  }
  $('#btn-sound').textContent = 'Звук: ' + (soundOn ? 'вкл' : 'выкл');
}

const titleLooks = [
  PX.makeLook(11, 'adult', 'f', {}), PX.makeLook(29, 'child', 'm', { sick: ['fever'] }),
  PX.makeLook(77, 'adult', 'm', {}), PX.makeLook(5, 'toddler', 'f', {}),
];
function drawTitle() {
  const ctx = $('#title-scene').getContext('2d');
  PX.drawRoom(ctx, frame);
  PX.drawPerson(ctx, 60, 120, titleLooks[0], frame, false);
  PX.drawPerson(ctx, 88, 120, titleLooks[1], frame + 3, false);
  PX.drawPerson(ctx, 150, 120, titleLooks[2], frame + 7, false);
  PX.drawPerson(ctx, 172, 120, titleLooks[3], frame + 1, false);
}

$('#btn-start').onclick = () => { sfx.click(); prof() ? startShift() : openSlots(); };
$('#btn-profile').onclick = () => { sfx.click(); openSlots(); };
$('#btn-help').onclick = () => { sfx.click(); $('#help-modal').classList.remove('hidden'); };
$('#help-ok').onclick = () => { sfx.click(); $('#help-modal').classList.add('hidden'); };
$('#btn-sound').onclick = () => { soundOn = !soundOn; store.set('ped_sound', soundOn); refreshTitle(); sfx.click(); };

// ---------- выбор врача (слоты) ----------
let pendingDelete = -1;
function openSlots() {
  pendingDelete = -1;
  renderSlots();
  show('#scr-slots');
}
function renderSlots() {
  const box = $('#slots');
  box.innerHTML = '';
  profiles.slots.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'slot panel' + (i === profiles.active && p ? ' current' : '');
    if (p) {
      const st = p.stats;
      card.innerHTML = `<canvas class="pix avatar-md"></canvas>
        <b>Д-р ${esc(p.name)}</b>
        <span class="muted">${esc(rankOf(st.points))}</span>
        <span class="small-text">Очки: ${st.points} · пациентов: ${st.patients}<br>Пройдено случаев: ${Object.keys(st.seen).length} из ${CASES.length}</span>
        <div class="row center">
          <button class="btn small primary" data-act="pick">${i === profiles.active ? 'Выбран' : 'Выбрать'}</button>
          <button class="btn small" data-act="edit">Изменить</button>
          <button class="btn small danger" data-act="del">${pendingDelete === i ? 'Точно удалить?' : 'Удалить'}</button>
        </div>`;
      paintAvatar(card.querySelector('canvas'), p);
    } else {
      card.classList.add('empty');
      card.innerHTML = `<div class="slot-plus">+</div><b>Свободный слот</b>
        <button class="btn small primary" data-act="new">Создать врача</button>`;
    }
    card.querySelectorAll('button').forEach(b => b.onclick = () => slotAction(i, b.dataset.act));
    box.appendChild(card);
  });
}
function slotAction(i, act) {
  sfx.click();
  if (act === 'pick') { profiles.active = i; saveProfiles(); refreshTitle(); show('#scr-title'); return; }
  if (act === 'edit' || act === 'new') { openProfile(i); return; }
  if (act === 'del') {
    if (pendingDelete !== i) { pendingDelete = i; renderSlots(); return; }
    profiles.slots[i] = null;
    if (profiles.active === i) profiles.active = Math.max(0, profiles.slots.findIndex(Boolean));
    pendingDelete = -1;
    saveProfiles();
    renderSlots();
  }
}
$('#btn-slots-back').onclick = () => { sfx.click(); refreshTitle(); show('#scr-title'); };

// ---------- редактирование профиля ----------
let draft = null, draftSlot = 0, lastPhoto = null;

function openProfile(slot) {
  draftSlot = slot;
  const p = profiles.slots[slot];
  draft = p ? { name: p.name, seed: p.seed, avatar: p.avatar } : { name: '', seed: Math.floor(Math.random() * 1e9), avatar: null };
  lastPhoto = null;
  $('#doc-name').value = draft.name;
  renderDraftAvatar();
  show('#scr-profile');
}
function renderDraftAvatar() {
  const c = $('#avatar-preview');
  if (draft.avatar) {
    const img = new Image();
    img.onload = () => { c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); };
    img.src = draft.avatar;
  } else PX.drawDoctorAvatar(c, draft.seed);
}
function pixelizePhoto() {
  if (!lastPhoto) return;
  const c = document.createElement('canvas');
  PX.photoToPixel(lastPhoto, c, 32, +$('#photo-k').value);
  draft.avatar = c.toDataURL('image/png');
  renderDraftAvatar();
}
$('#btn-random').onclick = () => { sfx.click(); draft.avatar = null; draft.seed = Math.floor(Math.random() * 1e9); renderDraftAvatar(); };
$('#btn-photo').onclick = () => { sfx.click(); $('#photo-input').click(); };
$('#photo-input').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => { lastPhoto = img; pixelizePhoto(); };
  img.src = URL.createObjectURL(f);
  e.target.value = '';
};
$('#photo-k').oninput = () => { $('#photo-k-val').textContent = $('#photo-k').value; pixelizePhoto(); };
$('#btn-save-profile').onclick = () => {
  const name = $('#doc-name').value.trim();
  if (!name) { $('#doc-name').focus(); $('#doc-name').placeholder = 'Введите имя!'; sfx.bad(); return; }
  const old = profiles.slots[draftSlot];
  profiles.slots[draftSlot] = { name, seed: draft.seed, avatar: draft.avatar, stats: old ? old.stats : newStats() };
  profiles.active = draftSlot;
  saveProfiles();
  sfx.good();
  refreshTitle();
  show('#scr-title');
};
$('#btn-back-profile').onclick = () => { sfx.click(); openSlots(); };

// ---------- подбор случаев ----------
function pickLevel(weights) {
  let r = Math.random(), acc = 0;
  for (const l in weights) { acc += weights[l]; if (r <= acc) return +l; }
  return +Object.keys(weights).pop();
}
function pickCases(n) {
  const st = prof().stats;
  const weights = LEVEL_WEIGHTS[rankIndex(st.points)];
  let pool = shuffle(CASES.filter(c => !(c.id in st.seen)));
  const out = [];
  // новых случаев не хватает — берём все оставшиеся новые, остальное добирает переаттестация (сначала худшие результаты)
  if (pool.length < n) {
    out.push(...pool);
    const again = shuffle(CASES.filter(c => c.id in st.seen)).sort((a, b) => st.seen[a.id] - st.seen[b.id]);
    pool = again.slice(0, Math.max(n * 3, 10));
    n -= out.length;
  }
  for (let k = 0; k < n && pool.length; k++) {
    const target = pickLevel(weights);
    let best = Infinity;
    pool.forEach(c => { best = Math.min(best, Math.abs(c.level - target)); });
    const cands = pool.filter(c => Math.abs(c.level - target) === best);
    const c = cands[Math.floor(Math.random() * cands.length)];
    out.push(c);
    pool.splice(pool.indexOf(c), 1);
  }
  return out;
}
function nextCodeFlag(st) {
  if (!st.codeBag || !st.codeBag.length) st.codeBag = shuffle([true, false]);
  return st.codeBag.pop();
}
function pickCode(st) {
  let pool = CODES.filter(c => !st.codesSeen[c.id]);
  if (!pool.length) { st.codesSeen = {}; pool = CODES.slice(); }
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- смена ----------
function startShift() {
  const st = prof().stats;
  const hasCode = nextCodeFlag(st);
  saveProfiles();
  shift = {
    cases: pickCases(SHIFT_SIZE), idx: 0, results: [], points: 0,
    rankBefore: rankOf(st.points),
    code: hasCode, codeAfter: 1 + Math.floor(Math.random() * (SHIFT_SIZE - 1)), codeDone: false, codeResult: null,
  };
  $('#hud-name').textContent = 'Д-р ' + prof().name;
  $('#hud-rank').textContent = rankOf(st.points);
  paintAvatar($('#hud-avatar'));
  startCase();
}

function patientCounter() {
  const total = shift.cases.length + (shift.codeDone ? 1 : 0);
  return `${shift.idx + 1 + (shift.codeDone ? 1 : 0)}/${total}`;
}

function startCase() {
  const cs = shift.cases[shift.idx];
  const p = cs.patient;
  const st = prof().stats;
  const veteran = rankIndex(st.points) >= 3;
  cur = {
    cs, asked: new Set(), time: 0, limit: cs.urgent ? 8 : 15, cat: 'a', impatient: false,
    talking: null, typer: null, recert: cs.id in st.seen,
    look: PX.makeLook(PX.hash(cs.id + 'p'), p.kind === 'baby' ? 'toddler' : p.kind, p.sex, { sick: p.sick }),
    comp: cs.companion ? PX.makeLook(PX.hash(cs.id + 'c'), 'adult', cs.companion.sex, { old: cs.companion.old }) : null,
  };
  $('#log').innerHTML = '';
  $('#patient-card').innerHTML =
    `<b>${esc(p.name)}</b>, ${esc(p.age)}<br>` +
    (cs.companion ? `${p.sex === 'f' ? 'с ней' : 'с ним'}: ${esc(cs.companion.role.toLowerCase())}` : (p.sex === 'f' ? 'пришла одна' : 'пришёл один')) +
    `<br><span class="stars" title="Сложность">${stars(cs.level)}</span>` +
    (cur.recert ? '<br><span class="recert">ПЕРЕАТТЕСТАЦИЯ</span>' : '') +
    (cs.urgent && !veteran ? '<br><span class="urgent">ТЯЖЁЛОЕ СОСТОЯНИЕ</span>' : '');
  setTab('a');
  updateHud();
  show('#scr-room');
  sfx.door();
  setTimeout(() => say(cs.companion ? 'c' : 'p', cs.complaint, true), 350);
}

function updateHud() {
  $('#hud-patient').textContent = patientCounter();
  const t = $('#hud-time');
  t.textContent = `${cur.time} / ${cur.limit} мин`;
  t.classList.toggle('over', cur.time > cur.limit);
  $('#hud-score').textContent = shift.points;
}

function speakerName(who) {
  const cs = cur.cs;
  if (who === 'c') return cs.companion ? cs.companion.role : cs.patient.name;
  if (who === 'p') return cs.patient.name;
  if (who === 'x') return 'Осмотр';
  if (who === 'l') return 'Результат обследования';
  return 'Врач';
}

function say(who, text, toLog) {
  const whoEl = $('#speech-who');
  whoEl.textContent = speakerName(who);
  whoEl.className = 'speech-who' + (who === 'x' ? ' exam' : who === 'l' ? ' lab' : '');
  const el = $('#speech-text');
  const quoted = (who === 'c' || who === 'p') ? `«${text}»` : text;
  clearInterval(cur.typer);
  cur.talking = (who === 'c' || who === 'p') ? who : null;
  let i = 0;
  el.textContent = '';
  cur.typer = setInterval(() => {
    i += 2;
    el.textContent = quoted.slice(0, i);
    if (cur.talking && i % 6 === 0) sfx.talk();
    if (i >= quoted.length) { clearInterval(cur.typer); cur.talking = null; }
  }, 22);
  cur.finishTyping = () => { clearInterval(cur.typer); el.textContent = quoted; cur.talking = null; };
  if (toLog) addLog(who, text);
}
$('#speech').onclick = () => cur && cur.finishTyping && cur.finishTyping();

function addLog(who, text, q) {
  const log = $('#log');
  if (q) log.insertAdjacentHTML('beforeend', `<p class="q">Врач: ${esc(q)}</p>`);
  const cls = who === 'x' ? 'x' : who === 'l' ? 'l' : '';
  log.insertAdjacentHTML('beforeend', `<p class="${cls}"><b>${esc(speakerName(who))}:</b> ${esc(text)}</p>`);
  log.scrollTop = log.scrollHeight;
}

function setTab(cat) {
  cur.cat = cat;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  renderQuestions();
}
$$('.tab').forEach(t => t.onclick = () => { sfx.click(); setTab(t.dataset.cat); });

function renderQuestions() {
  const box = $('#qlist');
  box.innerHTML = '';
  cur.cs.questions.forEach((q, i) => {
    if (q.c !== cur.cat) return;
    const b = document.createElement('button');
    const asked = cur.asked.has(i);
    b.className = 'q-btn' + (asked ? ' asked' : '');
    b.disabled = asked;
    b.innerHTML = `<span>${esc(q.q)}</span><span class="cost">${q.t} мин</span>`;
    b.onclick = () => ask(i);
    box.appendChild(b);
  });
}

function ask(i) {
  const q = cur.cs.questions[i];
  sfx.click();
  cur.asked.add(i);
  cur.time += q.t;
  addLog(q.who, q.a, q.c === 'a' ? q.q : null);
  if (q.c !== 'a') $('#log').lastElementChild.insertAdjacentHTML('afterbegin', `<i>${esc(q.q)}.</i> `);
  say(q.who, q.a, false);
  renderQuestions();
  updateHud();
  if (!cur.impatient && cur.time > cur.limit) {
    cur.impatient = true;
    setTimeout(() => {
      const text = cur.cs.urgent ? 'Доктор, ребёнку становится хуже! Сделайте что-нибудь!' : 'Доктор, мы уже очень долго здесь... В коридоре ещё очередь.';
      say(cur.cs.companion ? 'c' : 'p', text, true);
    }, 2200);
  }
}

// ---------- диагноз ----------
let dxStep = 0, dxChoice = null, tacChoice = null, dxOrder = [], tacOrder = [];
$('#btn-diagnose').onclick = () => {
  sfx.click();
  dxStep = 0; dxChoice = null; tacChoice = null;
  dxOrder = shuffle(cur.cs.diagnoses);
  tacOrder = shuffle(cur.cs.tactics);
  renderDx();
  $('#dx-modal').classList.remove('hidden');
};
$('#dx-cancel').onclick = () => {
  sfx.click();
  if (dxStep === 1) { dxStep = 0; renderDx(); } else $('#dx-modal').classList.add('hidden');
};
$('#dx-ok').onclick = () => {
  sfx.click();
  if (dxStep === 0) { dxStep = 1; renderDx(); }
  else { $('#dx-modal').classList.add('hidden'); finishCase(); }
};
function renderDx() {
  const box = $('#dx-options');
  box.innerHTML = '';
  const isDx = dxStep === 0;
  $('#dx-title').textContent = isDx ? 'Шаг 1. Диагноз (МКБ-10)' : 'Шаг 2. Тактика ведения';
  $('#dx-hint').textContent = isDx ? 'Выберите наиболее вероятный диагноз.' : 'Что вы делаете дальше?';
  $('#dx-cancel').textContent = isDx ? 'Ещё спросить' : 'Назад';
  $('#dx-ok').textContent = isDx ? 'Далее' : 'Завершить приём';
  const list = isDx ? dxOrder : tacOrder;
  const sel = isDx ? dxChoice : tacChoice;
  list.forEach(o => {
    const b = document.createElement('button');
    b.className = 'opt' + (sel === o ? ' sel' : '');
    b.innerHTML = esc(o.n) + (o.icd ? `<span class="icd">${esc(o.icd)}</span>` : '');
    b.onclick = () => { sfx.click(); if (isDx) dxChoice = o; else tacChoice = o; renderDx(); };
    box.appendChild(b);
  });
  $('#dx-ok').disabled = !sel;
}

function gradeOf(score) { return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D'; }
function setGrade(grade) { const g = $('#res-grade'); g.textContent = grade; g.className = 'grade g-' + grade; }
function addCareerPoints(points) {
  const st = prof().stats;
  st.points += points;
  shift.points += points;
}

function finishCase() {
  const cs = cur.cs;
  const st = prof().stats;
  const qs = cs.questions;
  const keys = qs.map((q, i) => [q, i]).filter(([q]) => q.w === 2);
  const keyAsked = keys.filter(([, i]) => cur.asked.has(i)).length;
  const useless = qs.filter((q, i) => q.w === 0 && cur.asked.has(i));
  const over = Math.max(0, cur.time - cur.limit);
  const dxOk = !!dxChoice.ok, tacOk = !!tacChoice.ok;

  let score = (dxOk ? 45 : 0) + (tacOk ? 25 : 0) + Math.round(30 * keyAsked / keys.length);
  const penUseless = useless.length * 3;
  const penTime = over * (cs.urgent ? 5 : 2);
  score = Math.max(0, Math.min(100, score - penUseless - penTime));
  const grade = gradeOf(score);
  const earned = Math.round(score * levelMult(cs.level) * (cur.recert ? 0.5 : 1));

  addCareerPoints(earned);
  shift.results.push({ cs, score, grade, dxOk, tacOk, earned });
  st.patients++;
  if (dxOk) st.correct++;
  st.seen[cs.id] = Math.max(st.seen[cs.id] || 0, score);
  saveProfiles();

  (dxOk && tacOk) ? sfx.good() : sfx.bad();

  setGrade(grade);
  $('#res-title').textContent = `${cs.patient.name}, ${cs.patient.age}`;
  $('#res-score').innerHTML = `Оценка приёма: ${score} из 100 · время: ${cur.time} мин из ${cur.limit}<br>` +
    `Сложность ${stars(cs.level)} · в карьеру: <b>+${earned}</b>${cur.recert ? ' (переаттестация ×0,5)' : ''}`;

  const correctDx = cs.diagnoses.find(d => d.ok);
  const correctTac = cs.tactics.find(t => t.ok);
  const missed = keys.filter(([, i]) => !cur.asked.has(i)).map(([q]) => q);
  let html = '';
  html += `<div class="res-sec ${dxOk ? 'ok' : 'bad'}"><h3>${dxOk ? '✔ Диагноз верный' : '✘ Диагноз неверный'}</h3>
    ${dxOk ? '' : `Ваш вариант: ${esc(dxChoice.n)} (${esc(dxChoice.icd)})<br>`}
    <b>Правильно:</b> ${esc(correctDx.n)} — <b>${esc(correctDx.icd)}</b></div>`;
  html += `<div class="res-sec ${tacOk ? 'ok' : 'bad'}"><h3>${tacOk ? '✔ Тактика верная' : '✘ Тактика неверная'}</h3>
    ${tacOk ? '' : `Ваш вариант: ${esc(tacChoice.n)}<br>`}
    <b>Правильно:</b> ${esc(correctTac.n)}</div>`;
  html += `<div class="res-sec"><h3>Сбор информации</h3>
    ${missed.length ? `<span class="tag-key">Упущено ключевое (${missed.length}):</span><ul class="missed">${missed.map(q => {
      const why = q.why || (WHY[cs.id] || {})[q.q];
      return `<li><b>${esc(q.q)}</b> <span class="cat-tag">${CAT_NAMES[q.c]}</span>
        <div class="would">Вы бы узнали: <i>${esc(q.a)}</i></div>
        ${why ? `<div class="why">Зачем: ${esc(why)}</div>` : ''}</li>`;
    }).join('')}</ul>` : '✔ Все ключевые вопросы заданы.'}
    ${useless.length ? `<div style="margin-top:8px">Лишние действия (−3 за каждое): ${useless.map(q => esc(q.q)).join('; ')}</div>` : ''}
    ${over ? `<div style="margin-top:8px">Превышено время приёма на ${over} мин (−${penTime}).</div>` : ''}
  </div>`;
  html += `<div class="res-sec"><h3>Разбор случая</h3>${esc(cs.explain)}<p class="source">Источник: ${esc(cs.source)}</p></div>`;
  $('#res-body').innerHTML = html;
  setNextButton();
  show('#scr-result');
}

function setNextButton() {
  const more = shift.idx + 1 < shift.cases.length;
  $('#btn-next').textContent = more ? 'Следующий пациент' : 'Итоги смены';
}

$('#btn-next').onclick = () => {
  sfx.click();
  if (code && code.finished) { code = null; }
  else shift.idx++;
  if (shift.code && !shift.codeDone && shift.idx === shift.codeAfter) startCode();
  else if (shift.idx < shift.cases.length) startCase();
  else endShift();
};

// ---------- голубой код ----------
function startCode() {
  const st = prof().stats;
  const sc = pickCode(st);
  shift.codeDone = true;
  code = {
    sc, step: 0, t: 0, errors: 0, mistakes: [], finished: false, flash: 0,
    look: PX.makeLook(PX.hash(sc.id + 'p'), sc.patient.kind === 'baby' ? 'toddler' : sc.patient.kind, sc.patient.sex, { sick: sc.patient.sick }),
    comp: PX.makeLook(PX.hash(sc.id + 'c'), 'adult', sc.companion.sex, {}),
  };
  $('#code-title').textContent = 'ГОЛУБОЙ КОД: ' + sc.title.toUpperCase();
  $('#code-patient').textContent = `${sc.patient.name}, ${sc.patient.age}`;
  $('#code-narr').innerHTML = `<p class="alarm">${esc(sc.alarm)}</p>`;
  $('#code-fb').classList.add('hidden');
  $('#code-counter').textContent = patientCounter();
  show('#scr-code');
  sfx.siren();
  renderCodeStep();
  clearInterval(code.timer);
  code.timer = setInterval(() => { code.t++; renderCodeTimer(); }, 1000);
  renderCodeTimer();
}

function renderCodeTimer() {
  const el = $('#code-timer');
  const m = Math.floor(code.t / 60), s = code.t % 60;
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('over', code.t > code.sc.limit);
}

function renderCodeStep() {
  const step = code.sc.steps[code.step];
  $('#code-prompt').textContent = step.prompt;
  $('#code-vitals').innerHTML = Object.entries(step.vitals)
    .map(([k, v]) => `<div class="vital"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  $('#code-step').textContent = `Шаг ${code.step + 1} из ${code.sc.steps.length}`;
  const box = $('#code-options');
  box.innerHTML = '';
  shuffle(step.options).forEach(o => {
    const b = document.createElement('button');
    b.className = 'opt';
    b.textContent = o.t;
    b.onclick = () => codeChoose(o, b);
    box.appendChild(b);
  });
}

function codeChoose(o, btn) {
  const step = code.sc.steps[code.step];
  if (o.ok) {
    sfx.good();
    $('#code-fb').classList.add('hidden');
    $('#code-narr').insertAdjacentHTML('beforeend', `<p class="done">✔ ${esc(o.t)}</p><p>${esc(step.after)}</p>`);
    $('#code-narr').scrollTop = $('#code-narr').scrollHeight;
    code.step++;
    if (code.step >= code.sc.steps.length) finishCode();
    else renderCodeStep();
  } else {
    sfx.bad();
    code.errors++;
    code.t += CODE_PENALTY_SEC;
    code.flash = 6;
    code.mistakes.push({ step: code.step, t: o.t, fb: o.fb });
    btn.disabled = true;
    btn.classList.add('wrong');
    const fb = $('#code-fb');
    fb.innerHTML = `✘ ${esc(o.fb)} <b>(+${CODE_PENALTY_SEC} с)</b>`;
    fb.classList.remove('hidden');
    renderCodeTimer();
  }
}

function finishCode() {
  clearInterval(code.timer);
  code.finished = true;
  const sc = code.sc;
  const st = prof().stats;
  const over = Math.max(0, code.t - sc.limit);
  const outcome = code.errors === 0 && over === 0 ? 'good'
    : (code.errors <= 2 && code.t <= sc.limit * 1.5 ? 'mid' : 'bad');
  let score = 100 - code.errors * 15 - over;
  // оценка согласуется с исходом: A — только без ошибок и в срок
  if (outcome === 'good') score = Math.max(score, 85);
  else if (outcome === 'mid') score = Math.min(score, 79);
  else score = Math.min(score, 49);
  score = Math.max(0, Math.min(100, score));
  const grade = gradeOf(score);
  const earned = Math.round(score * CODE_MULT);
  addCareerPoints(earned);
  st.codesSeen[sc.id] = true;
  shift.codeResult = { sc, score, grade, outcome, earned };
  saveProfiles();
  outcome === 'bad' ? sfx.bad() : sfx.good();

  setGrade(grade);
  $('#res-title').textContent = `Голубой код: ${sc.title}`;
  $('#res-score').innerHTML = `Оценка: ${score} из 100 · время: ${code.t} с (норматив ${sc.limit} с) · ошибок: ${code.errors}<br>В карьеру: <b>+${earned}</b> (экстренная помощь ×${String(CODE_MULT).replace('.', ',')})`;
  let html = `<div class="res-sec ${outcome === 'bad' ? 'bad' : 'ok'}"><h3>Исход</h3>${esc(sc.outcome[outcome])}</div>`;
  html += `<div class="res-sec"><h3>Правильная последовательность</h3><ol>${sc.steps.map((s, i) => {
    const ok = s.options.find(o => o.ok);
    const errs = code.mistakes.filter(m => m.step === i);
    return `<li>${esc(ok.t)}${errs.map(m => `<div class="mistake">✘ Вы выбрали: «${esc(m.t)}» — ${esc(m.fb)}</div>`).join('')}</li>`;
  }).join('')}</ol></div>`;
  html += `<div class="res-sec"><h3>Разбор</h3>${esc(sc.explain)}<p class="source">Источник: ${esc(sc.source)}</p></div>`;
  $('#res-body').innerHTML = html;
  $('#btn-next').textContent = shift.idx < shift.cases.length ? 'Вернуться к приёму' : 'Итоги смены';
  show('#scr-result');
}

// ---------- конец смены ----------
function endShift() {
  const st = prof().stats;
  st.shifts++;
  saveProfiles();
  const rows = shift.results.map(r =>
    `<tr><td>${esc(r.cs.patient.name)}, ${esc(r.cs.patient.age)}</td><td>${esc(r.cs.diagnoses.find(d => d.ok).n)}</td><td>${stars(r.cs.level)}</td><td><b>${r.grade}</b> · +${r.earned}</td></tr>`);
  if (shift.codeResult) {
    const c = shift.codeResult;
    rows.splice(shift.codeAfter, 0, `<tr class="code-row"><td>🚨 ${esc(c.sc.patient.name)}, ${esc(c.sc.patient.age)}</td><td>Голубой код: ${esc(c.sc.title)}</td><td>—</td><td><b>${c.grade}</b> · +${c.earned}</td></tr>`);
  }
  const rankNow = rankOf(st.points);
  $('#shift-body').innerHTML =
    `<p>Очки за смену: <b>${shift.points}</b></p>
     <table class="shift-table"><tr><th>Пациент</th><th>Диагноз</th><th>Сложность</th><th>Оценка</th></tr>${rows.join('')}</table>
     ${rankNow !== shift.rankBefore ? `<div class="rank-up">★ Повышение! Новая должность: ${esc(rankNow)}<br><span class="small-text">Пациенты станут сложнее.</span></div>` : ''}
     <p class="muted">Всего принято: ${st.patients} · точность диагнозов: ${Math.round(100 * st.correct / Math.max(1, st.patients))}% · пройдено случаев: ${Object.keys(st.seen).length} из ${CASES.length}<br>
     Должность: ${esc(rankNow)} · до следующей: ${nextRankText(st.points)}</p>`;
  if (rankNow !== shift.rankBefore) sfx.good();
  show('#scr-shift');
}
function nextRankText(p) {
  const next = RANKS.find(([pts]) => pts > p);
  return next ? `${next[0] - p} очков (${next[1]})` : 'вы достигли вершины карьеры!';
}
$('#btn-new-shift').onclick = () => { sfx.click(); startShift(); };
$('#btn-menu').onclick = () => { sfx.click(); refreshTitle(); show('#scr-title'); };
$('#btn-quit').onclick = () => {
  sfx.click();
  if (cur && cur.typer) clearInterval(cur.typer);
  refreshTitle();
  show('#scr-title');
};

// ---------- отрисовка сцен ----------
function drawScene() {
  if (!cur) return;
  const ctx = $('#scene').getContext('2d');
  PX.drawRoom(ctx, frame);
  const p = cur.cs.patient;
  const tp = cur.talking === 'p', tc = cur.talking === 'c';
  if (p.kind === 'baby') {
    PX.drawPerson(ctx, 112, 122, cur.comp, frame, tc, cur.look);
  } else if (cur.comp) {
    PX.drawPerson(ctx, 96, 122, cur.comp, frame, tc);
    PX.drawPerson(ctx, 128, 124, cur.look, frame + 2, tp);
  } else {
    PX.drawPerson(ctx, 112, 122, cur.look, frame, tp);
  }
}

const lyingBuf = document.createElement('canvas');
function drawLying(ctx, x, floorY, look) {
  lyingBuf.width = 32; lyingBuf.height = 52;
  const b = lyingBuf.getContext('2d');
  b.clearRect(0, 0, 32, 52);
  PX.drawPerson(b, 16, 50, look, 0, false);
  ctx.save();
  ctx.translate(x, floorY);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(lyingBuf, -16, -26);
  ctx.restore();
}

function drawCodeScene() {
  if (!code) return;
  const ctx = $('#code-scene').getContext('2d');
  PX.drawRoom(ctx, frame);
  const sc = code.sc;
  const lying = sc.lyingFrom !== undefined && code.step >= sc.lyingFrom;
  if (sc.patient.kind === 'baby') PX.drawPerson(ctx, 112, 122, code.comp, frame, false, code.look);
  else if (lying) { PX.drawPerson(ctx, 80, 122, code.comp, frame, false); drawLying(ctx, 112, 120, code.look); }
  else { PX.drawPerson(ctx, 96, 122, code.comp, frame, false); PX.drawPerson(ctx, 128, 124, code.look, frame + 2, false); }
  // тревожная подсветка
  const pulse = (Math.sin(frame / 2) + 1) / 2;
  ctx.fillStyle = code.flash > 0 ? 'rgba(220,30,30,0.35)' : `rgba(40,90,220,${0.08 + pulse * 0.12})`;
  ctx.fillRect(0, 0, 240, 135);
  if (code.flash > 0) code.flash--;
}

setInterval(() => {
  frame++;
  if ($('#scr-room').classList.contains('active')) drawScene();
  else if ($('#scr-code').classList.contains('active')) drawCodeScene();
  else if ($('#scr-title').classList.contains('active')) drawTitle();
}, 140);

refreshTitle();
drawTitle();

// офлайн-режим (работает только при открытии по https, не из файла)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
