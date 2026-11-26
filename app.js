/**
 * 상훈이 여행 앱 (정적 PWA) — app.js
 * 데이터는 data/ 아래 JSON. 개인 상태(체크·찜·메모·증권번호)는 localStorage.
 * 서버는 없다. 동기화는 sync.js 가 선택적으로 담당.
 */
'use strict';

const $ = function (id) { return document.getElementById(id); };
const CATS = ['맛집', '마사지', '쇼핑', '카페'];
const CATTAB = { '맛집': '맛집', '마사지': '마사지', '쇼핑': '쇼핑', '카페': '카페' };
const TABS = [['plan', '일정']].concat(CATS.map(function (c) { return [c, CATTAB[c]]; }))
  .concat([['chosen', '찜'], ['bag', '준비물'], ['fly', '항공·숙소'], ['sos', '비상']]);
const COLOR = { '이동': '#7f9cc9', '다이빙': '#6cc3c1', '맛집': '#d9a066', '마사지': '#b79ad3',
  '쇼핑': '#d98a8a', '카페': '#b08b6a', '관광': '#8fbf8a', '휴식': '#8fb3cc', '숙소': '#8a96a3', '자유': '#c9a96e' };
const TZOFF = { ICN: 9, GMP: 9, PUS: 9, CJU: 9, CEB: 8, MNL: 8, TAC: 8, TAG: 8, PPS: 8, USU: 8, DGT: 8, KLO: 8, MPH: 8 };
const CIHOURS = { '7C': 24, 'LJ': 24, 'TW': 24, 'BX': 24, 'RS': 24, 'ZE': 24, 'KE': 48, 'OZ': 48, 'PR': 24, '5J': 48, 'Z2': 48, 'DG': 24 };
const WCODE = { 0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림', 45: '안개', 48: '안개', 51: '이슬비', 53: '이슬비', 55: '이슬비',
  61: '비', 63: '비', 65: '강한 비', 66: '어는 비', 67: '어는 비', 71: '눈', 73: '눈', 75: '많은 눈', 77: '싸락눈',
  80: '소나기', 81: '소나기', 82: '강한 소나기', 85: '눈 소나기', 86: '눈 소나기', 95: '뇌우', 96: '뇌우·우박', 99: '뇌우·우박' };

const S = { idx: null, trip: null, places: null, items: null, ins: null, state: null, tab: 'plan', wx: null, sea: null, err: '' };

/* ── 작은 도구 ─────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function toast(t) {
  const x = $('toast'); x.textContent = t; x.style.display = 'block';
  clearTimeout(x._t); x._t = setTimeout(function () { x.style.display = 'none'; }, 1900);
}
function ymdToDate(s) { const p = String(s || '').split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function todayDate() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function dday(start) { if (!start) return null; return Math.round((ymdToDate(start) - todayDate()) / 86400000); }
function mmdd(s) { const p = String(s || '').split('-'); return p.length === 3 ? (Number(p[1]) + '/' + Number(p[2])) : String(s || ''); }
function weekday(s) {
  const d = ymdToDate(s);
  return isNaN(d.getTime()) ? '' : '일월화수목금토'.charAt(d.getDay());
}
function kstMin(dateStr, hhmm, iata) {
  if (!dateStr || !hhmm) return null;
  const p = dateStr.split('-').map(Number);
  const hm = String(hhmm).split(':').map(Number);
  const off = (TZOFF[iata] != null) ? TZOFF[iata] : 8;
  return Date.UTC(p[0], p[1] - 1, p[2], 0, 0) / 60000 + (hm[0] - off) * 60 + hm[1];
}
function fmtMin(m) {
  if (m == null) return '';
  const d = new Date(m * 60000);
  const p = function (n) { return ('0' + n).slice(-2); };
  return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}
function ciHours(code) {
  const a = String(code || '').replace(/\s/g, '').slice(0, 2).toUpperCase();
  return CIHOURS[a] || 24;
}

/* ── 상태(이 기기에만) ─────────────────────────────────── */
function stateKey(id) { return 'tripstate.' + id; }
function loadState(id) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(stateKey(id)) || 'null'); } catch (e) { s = null; }
  const base = { checks: {}, picks: {}, memo: '', items: null, flight: {}, insurance: {}, updatedAt: 0 };
  if (!s) return base;
  Object.keys(base).forEach(function (k) { if (s[k] == null) s[k] = base[k]; });
  return s;
}
function saveState() {
  if (!S.trip) return;
  S.state.updatedAt = Date.now();
  try { localStorage.setItem(stateKey(S.trip.id), JSON.stringify(S.state)); } catch (e) {}
  scheduleSync();
}

/* ── 데이터 ───────────────────────────────────────────── */
async function loadJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
async function loadTrip(id) {
  const base = 'data/trips/' + id + '/';
  const res = await Promise.all([
    loadJSON(base + 'trip.json'),
    loadJSON(base + 'places.json').catch(function () { return { places: [] }; })
  ]);
  S.trip = res[0];
  S.places = res[1] || { places: [] };
  S.state = loadState(id);
  S.wx = null; S.sea = null;
  localStorage.setItem('lastTrip', id);
  refreshWx();
  Sync.pull(id, S.state).then(function (remote) {
    if (!S.trip || S.trip.id !== id) return;          // 그새 다른 여행으로 옮겼으면 무시
    if (remote && remote.updatedAt > (S.state.updatedAt || 0)) {
      S.state = Object.assign(S.state, remote);
      render(); toast('다른 기기의 체크 상태를 받았습니다');
    }
  }).catch(function () {});
}
function itemsList() { return (S.state.items && S.state.items.length ? S.state.items : (S.items ? S.items.items : [])); }
function pendingList() { return itemsList().filter(function (c) { return !S.state.checks[c[1]]; }).map(function (c) { return c[1]; }); }
function pickedPlaces() { return (S.places.places || []).filter(function (p) { return S.state.picks[p.id]; }); }

/* ── 날씨·바다 (Open-Meteo 직접) ───────────────────────── */
function cached(key, ttl) {
  try {
    const c = JSON.parse(localStorage.getItem(key) || 'null');
    if (c && Date.now() - c.t < ttl) return c.v;
  } catch (e) {}
  return null;
}
async function refreshWx() {
  const ll = S.trip && S.trip.resort && S.trip.resort.ll;
  if (!ll) return;
  const wid = S.trip.id;
  try {
    let wx = cached('wx:' + ll.join(','), 3 * 3600 * 1000);
    if (!wx) {
      const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + ll[0] + '&longitude=' + ll[1] +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&timezone=auto&forecast_days=11';
      wx = await (await fetch(u)).json();
      localStorage.setItem('wx:' + ll.join(','), JSON.stringify({ t: Date.now(), v: wx }));
    }
    if (S.trip && S.trip.id === wid) S.wx = wx;
  } catch (e) {}
  try {
    let sea = cached('sea:' + ll.join(','), 3 * 3600 * 1000);
    if (!sea) {
      const u = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + ll[0] + '&longitude=' + ll[1] +
        '&daily=wave_height_max,wave_period_max&hourly=sea_surface_temperature&timezone=auto&forecast_days=16';
      sea = await (await fetch(u)).json();
      localStorage.setItem('sea:' + ll.join(','), JSON.stringify({ t: Date.now(), v: sea }));
    }
    if (S.trip && S.trip.id === wid) S.sea = sea;
  } catch (e) {}
  if (S.trip && S.trip.id === wid) render();
}
function wxOf(dateStr) {
  if (!S.wx || !S.wx.daily) return null;
  const i = S.wx.daily.time.indexOf(dateStr);
  if (i < 0) return null;
  return {
    code: S.wx.daily.weather_code[i],
    hi: Math.round(S.wx.daily.temperature_2m_max[i]),
    lo: Math.round(S.wx.daily.temperature_2m_min[i]),
    rain: S.wx.daily.precipitation_probability_max[i]
  };
}
function seaOf(dateStr) {
  if (!S.sea || !S.sea.daily) return null;
  const i = S.sea.daily.time.indexOf(dateStr);
  if (i < 0) return null;
  let sst = null;
  const ht = (S.sea.hourly && S.sea.hourly.time) || [];
  const hs = (S.sea.hourly && S.sea.hourly.sea_surface_temperature) || [];
  const vals = [];
  for (let k = 0; k < ht.length; k++) {
    if (String(ht[k]).slice(0, 10) === dateStr && hs[k] != null) vals.push(hs[k]);
  }
  if (vals.length) sst = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  return { wave: S.sea.daily.wave_height_max[i], period: S.sea.daily.wave_period_max[i], sst: sst };
}

/* ── 화면 ─────────────────────────────────────────────── */
function render() {
  if (!S.trip) {
    $('main').innerHTML = '<div class="empty">여행 데이터를 불러오지 못했습니다.<br>' + esc(S.err) + '</div>';
    $('h1').textContent = '불러오지 못했습니다';
    return;
  }
  const t = S.trip;
  document.title = t.name;
  $('h1').textContent = t.name;
  $('sub').textContent = [t.region, t.start ? mmdd(t.start) + ' ~ ' + mmdd(t.end) + ' (' + weekday(t.start) + '~' + weekday(t.end) + ')' : '', t.resort && t.resort.name].filter(Boolean).join(' · ');
  const dd = dday(t.start);
  $('dday').innerHTML = dd == null ? '' : '<small>DEPARTURE</small>' + (dd > 0 ? 'D-' + dd : dd === 0 ? 'D-DAY' : '여행 중 · 완료');

  const done = itemsList().filter(function (c) { return S.state.checks[c[1]]; }).length;
  $('stats').innerHTML = '<span><b>' + done + '<small style="font-size:11px;color:var(--mute)">/' + itemsList().length + '</small></b>준비물</span>' +
    '<span><b>' + pickedPlaces().length + '</b>찜</span>';

  $('trips').innerHTML = (S.idx.trips || []).map(function (x) {
    return '<button data-act="trip" data-id="' + esc(x.id) + '" class="' + (x.id === t.id ? 'on' : '') + '">' + esc(x.name) + '</button>';
  }).join('');

  $('tabs').innerHTML = TABS.filter(function (tab) {
    if (tab[0] === '카페') {
      const n = (S.places.places || []).filter(function (p) { return p.category === '카페'; }).length;
      if (!n) return false;
    }
    return true;
  }).map(function (tab) {
    const n = tabN(tab[0]);
    return '<button data-act="tab" data-tab="' + tab[0] + '" class="' + (S.tab === tab[0] ? 'on' : '') + '">' +
      tab[1] + (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
  }).join('');

  const p = $('main');
  if (S.tab === 'plan') p.innerHTML = panelPlan();
  else if (CATS.indexOf(S.tab) >= 0) p.innerHTML = panelCat(S.tab);
  else if (S.tab === 'chosen') p.innerHTML = panelChosen();
  else if (S.tab === 'bag') p.innerHTML = panelBag();
  else if (S.tab === 'fly') p.innerHTML = panelFly();
  else if (S.tab === 'sos') p.innerHTML = panelSos();
  window.scrollTo(0, 0);
}

function tabN(tab) {
  if (tab === 'chosen') return pickedPlaces().length;
  if (CATS.indexOf(tab) >= 0) return (S.places.places || []).filter(function (p) { return p.category === tab; }).length;
  return 0;
}

/* 일정 */
function panelPlan() {
  const t = S.trip, out = [];
  if ((t.days || []).length && !t.days.some(function (d) { return wxOf(d.date); })) {
    out.push('<p class="hint">🌊 날짜별 날씨·바다 예보는 출발 2주 전부터 여기에 붙습니다.</p>');
  }
  const last = lastDiveMin();
  if (last != null) out.push('<div class="warn"><b>마지막 다이빙 마감</b><br>' + fmtMin(last) + ' (한국 시각) 전에 끝내야 합니다 — 비행 24시간 규칙</div>');
  (t.days || []).forEach(function (d, i) {
    out.push('<div class="card"><div class="daytag">DAY ' + ('0' + (i + 1)).slice(-2) + '</div>' +
      '<div class="dh"><b>' + esc(mmdd(d.date)) + ' (' + weekday(d.date) + ')</b><span>' + esc(d.title || '') + '</span></div>' +
      wxStrip(d.date) + seaStrip(d.date));
    (d.items || []).forEach(function (it) {
      const ty = it.type || '관광';
      out.push('<div class="it"><div class="dot" style="background:' + (COLOR[ty] || '#828282') + '"></div><div style="flex:1">' +
        '<div class="tt"><span class="tm">' + esc(it.time || '') + '</span>' + esc(it.title || '') +
        '<span class="ty">' + esc(ty) + '</span></div>' +
        (it.place ? '<div class="nt"><a href="' + mapsFor(it.place) + '" target="_blank" rel="noopener">' + esc(it.place) + ' ↗</a></div>' : '') +
        (it.note ? '<div class="nt">' + esc(it.note) + '</div>' : '') + '</div></div>');
    });
    out.push('</div>');
  });
  if (!(t.days || []).length) out.push('<div class="empty">일정이 아직 없습니다.<br>상훈이에게 "일정 짜줘"라고 하시면 여기에 들어옵니다.</div>');
  if ((t.tips || []).length) {
    out.push('<div class="card"><h2>팁</h2><div class="rows">' +
      t.tips.map(function (x) { return '<div style="display:block">· ' + esc(x) + '</div>'; }).join('') + '</div></div>');
  }
  return out.join('');
}

function wxStrip(date) {
  const w = wxOf(date);
  if (!w) return '';
  return '<div class="sea"><span>' + (WCODE[w.code] || '') + ' ' + w.hi + '°/' + w.lo + '°</span>' +
    (w.rain != null ? '<span>비 ' + w.rain + '%</span>' : '') + '</div>';
}
function seaStrip(date) {
  const s = seaOf(date);
  if (!s || s.wave == null) return '';
  const lv = s.wave < 1 ? ['좋음', 'g'] : s.wave < 1.5 ? ['보통', 'm'] : ['거침', 'b'];
  const suit = s.sst == null ? '' : s.sst >= 28.5 ? '래시가드·3mm' : s.sst >= 26.5 ? '3mm' : s.sst >= 24 ? '5mm' : '5mm+후드';
  return '<div class="sea"><span class="' + lv[1] + '">파도 ' + Number(s.wave).toFixed(1) + 'm · ' + lv[0] + '</span>' +
    (s.sst != null ? '<span>수온 <b>' + s.sst.toFixed(1) + '°</b></span>' : '') +
    (suit ? '<span>' + suit + '</span>' : '') + '</div>';
}

/* 맛집·마사지·쇼핑·카페 */
function panelCat(cat) {
  const list = (S.places.places || []).filter(function (p) { return p.category === cat; });
  const out = ['<p class="hint">마음에 드는 곳은 <b>☆ 찜</b>. 거리는 숙소 기준, 예약은 카드의 버튼으로.</p>'];
  if (!list.length) out.push('<div class="empty">아직 없습니다.<br>상훈이에게 "' + esc(cat) + ' 추가해줘"라고 하시면 여기에 들어옵니다.</div>');
  list.forEach(function (x) { out.push(card(x)); });
  return out.join('');
}
function card(x) {
  const on = !!S.state.picks[x.id];
  const meta = [];
  if (x.rating) meta.push('★ ' + x.rating + (x.reviews ? ' (' + x.reviews + ')' : ''));
  if (x.area) meta.push(x.area);
  if (x.price) meta.push(x.price);
  const d = x.dist;
  let h = '<div class="pk' + (on ? ' chosen' : '') + '"><div class="top"><div><b>' + esc(x.name) + '</b>' +
    (meta.length ? '<div class="area">' + esc(meta.join(' · ')) + '</div>' : '') +
    (d ? '<div class="area"><span class="dist">숙소에서 ' + (d.mode === 'walk' ? '도보 ' : '차 ') + d.min + '분 · ' + d.km + 'km</span></div>' : '') +
    '</div><button class="star' + (on ? ' on' : '') + '" data-act="pick" data-id="' + esc(x.id) + '">' + (on ? '★ 찜함' : '☆ 찜') + '</button></div>';
  if (x.why) h += '<div class="why">' + esc(x.why) + '</div>';
  const rows = [['영업', x.hours], ['주소', x.address], ['전화', x.phone], ['예약', x.reserve]];
  h += '<div class="rows">' + rows.filter(function (r) { return r[1]; }).map(function (r) {
    return '<div><span>' + r[0] + '</span><span>' + esc(r[1]) + '</span></div>';
  }).join('') + '</div><div class="btns">';
  if (x.phone) h += '<a class="res" href="tel:' + esc(String(x.phone).replace(/[^\d+]/g, '')) + '">전화</a>';
  if (x.maps) h += '<a href="' + esc(x.maps) + '" target="_blank" rel="noopener">지도</a>';
  if (x.appLink) h += '<a href="' + esc(x.appLink) + '" target="_blank" rel="noopener">' + esc(x.app || '예약') + '</a>';
  h += '</div></div>';
  return h;
}
function mapsFor(name) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + (S.trip.region || ''));
}

function panelChosen() {
  const list = pickedPlaces();
  if (!list.length) return '<div class="empty">아직 찜한 곳이 없습니다.<br>맛집·마사지 탭에서 ☆ 찜을 눌러 보세요.</div>';
  const out = [];
  CATS.forEach(function (c) {
    const g = list.filter(function (p) { return p.category === c; });
    if (!g.length) return;
    out.push('<div class="grp">' + c + '</div>');
    g.forEach(function (x) { out.push(card(x)); });
  });
  return out.join('');
}

/* 준비물 */
function panelBag() {
  const items = itemsList();
  const done = items.filter(function (c) { return S.state.checks[c[1]]; }).length;
  const pct = items.length ? Math.round(done * 100 / items.length) : 0;
  const cats = [];
  items.forEach(function (c) { if (cats.indexOf(c[0]) < 0) cats.push(c[0]); });
  const order = (S.items && S.items.categories) || ['서류', '장비', '의류', '생활', '건강', '기타'];
  cats.sort(function (a, b) { const ia = order.indexOf(a); const ib = order.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  let h = '<div class="card"><div class="prog"><div class="bar"><i style="width:' + pct + '%"></i></div><b>' + done + ' / ' + items.length + '</b></div>' +
    '<p class="hint" style="margin:10px 0 0">항목을 누르면 챙김 표시. 체크는 이 기기에 저장되고, 동기화를 켜면 상훈이도 볼 수 있습니다.</p>' +
    '<div class="add"><select id="acat">' + order.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>' +
    '<input id="aname" placeholder="추가할 준비물" maxlength="60"><button data-act="additem">추가</button></div></div>';
  if (!items.length) h += '<div class="empty">준비물 목록이 비었습니다.</div>';
  cats.forEach(function (cat) {
    h += '<div class="grp">' + esc(cat) + '</div>';
    items.filter(function (c) { return c[0] === cat; }).forEach(function (c) {
      const on = !!S.state.checks[c[1]];
      h += '<div class="ck' + (on ? ' done' : '') + '"><div class="box" data-act="check" data-name="' + esc(c[1]) + '">' + (on ? '✓' : '') + '</div>' +
        '<div class="lb" data-act="check" data-name="' + esc(c[1]) + '">' + esc(c[1]) + '</div>' +
        '<button class="x" data-act="delitem" data-name="' + esc(c[1]) + '">✕</button></div>';
    });
  });
  return h;
}

/* 항공·숙소 */
function legMin(which) {
  const f = S.trip.flights && S.trip.flights[which];
  if (!f) return null;
  const local = (S.state.flight || {})[which] || {};
  const dep = local.dep || f.dep;
  return dep ? kstMin(f.date, dep, f.from) : null;
}
function lastDiveMin() {
  const back = legMin('back');
  if (back == null) return null;
  // back 은 '한국 시각' 기준 분. 세부 출발 시각은 현지라 이미 보정됨.
  return back - 24 * 60;
}
function panelFly() {
  const t = S.trip, out = [];
  const sec = function (which, label) {
    const f = t.flights && t.flights[which];
    if (!f) return '';
    const local = (S.state.flight || {})[which] || {};
    const dep = local.dep || f.dep;
    const arr = local.arr || f.arr;
    const pnr = local.pnr || f.pnr;
    let h = '<div class="daytag">' + label + '</div><div class="leg"><div class="lt"><b>' + esc(f.code || '편명 미정') + '</b><span>' + esc(f.airline || '') + '</span></div>' +
      '<div class="route">' + esc(f.from) + ' → ' + esc(f.to) + '</div>' +
      '<div class="lmeta"><span>' + esc(mmdd(f.date)) + ' (' + weekday(f.date) + ')</span>' +
      (dep ? '<span>' + esc(dep) + ' 출발</span>' : '<span style="color:var(--red)">출발 시각 미입력</span>') +
      (arr ? '<span>' + esc(arr) + ' 도착</span>' : '') +
      (pnr ? '<span>예약번호 <b>' + esc(pnr) + '</b></span>' : '') + '</div>';
    const d = kstMin(f.date, dep, f.from);
    if (d != null) {
      const oh = ciHours(f.code);
      h += '<div class="fnote">' +
        '<div>체크인 열림 · ' + fmtMin(d - oh * 60) + ' (출발 ' + oh + '시간 전, 항공사 확인 필요)</div>' +
        '<div>공항 도착 · ' + fmtMin(d - 180) + ' (국제선 3시간 전)</div>' +
        (f.note ? '<div>' + esc(f.note) + '</div>' : '') + '</div>';
    } else {
      h += '<div class="fnote">출발 시각을 넣으면 체크인 열리는 시각과 공항 도착 시각을 계산합니다.</div>';
    }
    h += '</div>';
    return h;
  };
  out.push('<div class="card"><h2>항공편</h2>' + sec('out', 'OUTBOUND') + sec('back', 'RETURN') +
    '<div class="btns"><button data-act="editflight">시각·예약번호 입력</button></div></div>');
  const last = lastDiveMin();
  if (last != null) out.push('<div class="warn"><b>마지막 다이빙 마감</b><br>' + fmtMin(last) + ' (한국 시각) 전 — 비행까지 24시간을 비웁니다.</div>');
  if (t.resort && t.resort.name) {
    out.push('<div class="card"><h2>숙소</h2><div><b>' + esc(t.resort.name) + '</b>' +
      (t.resort.area ? '<div class="area">' + esc(t.resort.area) + '</div>' : '') +
      '<div class="rows"><div><span>체크인</span><span>' + esc(t.resort.checkin || '') + ' / 체크아웃 ' + esc(t.resort.checkout || '') + '</span></div></div>' +
      (t.resort.note ? '<div class="nt">' + esc(t.resort.note) + '</div>' : '') +
      (t.resort.maps ? '<div class="btns"><a href="' + esc(t.resort.maps) + '" target="_blank" rel="noopener">지도에서 보기</a></div>' : '') +
      '</div></div>');
  }
  return out.join('');
}

/* 비상 */
function panelSos() {
  const so = S.trip.sos || {};
  const ins = S.ins || {};
  const out = [];
  if ((so.tips || []).length) out.push('<div class="warn"><b>다이빙 사고가 나면</b><br>' + so.tips.map(esc).join('<br>') + '</div>');
  if (ins.name) {
    const pv = (S.state.insurance || {});
    out.push('<div class="card"><div class="daytag">DIVE INSURANCE</div><h2>' + esc(ins.name) + (ins.plan ? ' · ' + esc(ins.plan) : '') + '</h2>' +
      '<div class="rows"><div><span>긴급</span><span>' + esc(ins.agent || '') + '</span></div>' +
      (pv.policy ? '<div><span>증권</span><span>' + esc(pv.policy) + '</span></div>' : '') +
      (pv.holder ? '<div><span>가입자</span><span>' + esc(pv.holder) + '</span></div>' : '') + '</div>' +
      (ins.phones || []).map(function (p) {
        return '<div class="btns"><a class="res" href="tel:' + esc(String(p[1]).replace(/[^\d+]/g, '')) + '">' + esc(p[0]) + ' ' + esc(p[1]) + '</a></div>';
      }).join('') +
      (ins.email ? '<div class="btns"><a href="mailto:' + esc(ins.email) + '">' + esc(ins.email) + '</a></div>' : '') +
      (!pv.policy ? '<p class="hint" style="margin-top:10px">' + esc(ins.privateHint || '') + '</p>' : '') +
      '<div class="btns"><button data-act="editins">' + (pv.policy ? '증권번호 고치기' : '증권번호 입력') + '</button></div>' +
      '<div class="say">전화하면 이렇게: “I’m a ' + esc(ins.name) + ' member.”' +
      (pv.holder ? ' / “My name is <b>' + esc(pv.holder) + '</b>.”' : '') +
      (pv.policy ? ' / “Plan number <b>' + esc(pv.policy) + '</b>.”' : '') + '</div></div>');
  }
  const grp = function (title, arr) {
    if (!arr || !arr.length) return '';
    return '<div class="card"><h2>' + esc(title) + '</h2>' + arr.map(function (x) {
      const tel = String(x.phone || '').replace(/[^\d+]/g, '');
      return '<div style="padding:9px 0;border-top:1px solid var(--line)"><b>' + esc(x.name) + '</b>' +
        (x.note ? '<div class="nt">' + esc(x.note) + '</div>' : '') +
        (x.address ? '<div class="nt">' + esc(x.address) + '</div>' : '') +
        '<div class="btns">' + (tel.length >= 3 ? '<a class="res" href="tel:' + esc(tel) + '">' + esc(x.phone) + '</a>' : '') +
        (x.address ? '<a href="' + mapsFor(x.name + ' ' + x.address) + '" target="_blank" rel="noopener">지도</a>' : '') + '</div></div>';
    }).join('') + '</div>';
  };
  out.push(grp('감압 챔버', so.chamber));
  out.push(grp('응급실', so.hospital));
  out.push(grp('대사관 · 영사', so.embassy));
  out.push(grp('긴급 번호', so.local));
  if (so.verified) out.push('<p class="hint">' + esc(so.verified) + ' 확인 · 출발 전에 전화번호를 다시 확인하세요.</p>');
  return out.join('');
}

/* ── 동작 ─────────────────────────────────────────────── */
function toggleCheck(name) {
  if (S.state.checks[name]) delete S.state.checks[name];
  else S.state.checks[name] = true;
  saveState(); render();
}
function editFlight() {
  const f = S.trip.flights || {};
  const which = prompt('어느 편을 고칠까요? out = 가는 편, back = 오는 편', 'out');
  if (which !== 'out' && which !== 'back') return;
  const fl = f[which]; if (!fl) return;
  const cur = (S.state.flight || {})[which] || {};
  const dep = prompt(fl.code + ' ' + mmdd(fl.date) + ' 출발 시각 (현지 시각 HH:MM)', cur.dep || fl.dep || '');
  if (dep === null) return;
  const arr = prompt('도착 시각 (현지 시각 HH:MM, 모르면 비워 두기)', cur.arr || fl.arr || '');
  if (arr === null) return;
  const pnr = prompt('예약번호 (이 기기에만 저장, 없으면 비워 두기)', cur.pnr || fl.pnr || '');
  if (pnr === null) return;
  S.state.flight = S.state.flight || {};
  S.state.flight[which] = { dep: String(dep).trim(), arr: String(arr).trim(), pnr: String(pnr).trim() };
  saveState(); render(); toast('항공편 정보를 저장했습니다');
}
function editIns() {
  const pv = S.state.insurance || {};
  const policy = prompt('보험 증권(플랜) 번호 — 이 기기에만 저장됩니다', pv.policy || '');
  if (policy === null) return;
  const holder = prompt('가입자 영문 이름', pv.holder || '');
  if (holder === null) return;
  S.state.insurance = { policy: String(policy).trim(), holder: String(holder).trim() };
  saveState(); render();
}
function addItem() {
  const inp = $('aname'); if (!inp) return;
  const n = (inp.value || '').trim();
  const sel = $('acat');
  const c = (sel && sel.value) || '기타';
  if (!n) { $('aname').focus(); return; }
  const list = itemsList().slice();
  if (list.some(function (x) { return x[1] === n; })) { toast('이미 있는 항목입니다'); return; }
  list.push([c, n]);
  S.state.items = list;
  saveState(); render(); toast('추가했습니다');
}
function delItem(name) {
  if (!confirm('"' + name + '" 를 목록에서 뺄까요?')) return;
  const list = itemsList().filter(function (x) { return x[1] !== name; });
  S.state.items = list;
  delete S.state.checks[name];
  saveState(); render();
}

document.addEventListener('click', function (e) {
  const t = (e.target && e.target.closest) ? e.target.closest('[data-act]') : null;
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'tab') { S.tab = t.dataset.tab; render(); }
  else if (act === 'trip') { loadTrip(t.dataset.id).then(render).catch(function (err) { S.err = String(err); render(); }); }
  else if (act === 'check') { toggleCheck(t.dataset.name); }
  else if (act === 'delitem') { delItem(t.dataset.name); }
  else if (act === 'additem') { addItem(); }
  else if (act === 'pick') {
    const id = t.dataset.id;
    if (S.state.picks[id]) delete S.state.picks[id]; else S.state.picks[id] = true;
    saveState(); render();
  }
  else if (act === 'editflight') { editFlight(); }
  else if (act === 'editins') { editIns(); }
  else if (act === 'sync') { Sync.setup(); }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && e.target && e.target.id === 'aname') addItem();
});

/* ── 동기화(선택) ─────────────────────────────────────── */
let syncTimer = null;
function scheduleSync() {
  if (!window.Sync || !S.trip) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function () {
    Sync.push(S.trip.id, {
      checks: S.state.checks,
      picks: S.state.picks,
      memo: S.state.memo,
      items: S.state.items,
      flight: S.state.flight,
      // 증권번호·가입자 이름은 기본으로 올리지 않습니다(공개 저장소 대비)
      pending: pendingList(),
      done: itemsList().length - pendingList().length,
      total: itemsList().length,
      updatedAt: S.state.updatedAt,
      updatedISO: new Date(S.state.updatedAt).toISOString()
    });
  }, 800);
}

/* ── 시작 ─────────────────────────────────────────────── */
async function boot() {
  try {
    S.idx = await loadJSON('data/trips.json');
    S.items = await loadJSON('data/items/dive-default.json').catch(function () { return { items: [], categories: [] }; });
    S.ins = await loadJSON('data/insurance.json').catch(function () { return null; });
    const last = localStorage.getItem('lastTrip');
    const first = (S.idx.trips || [])[0];
    const id = (S.idx.trips || []).some(function (x) { return x.id === last; }) ? last : (first && first.id);
    if (!id) { S.err = '여행 목록이 비었습니다'; render(); return; }
    await loadTrip(id);
    render();
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('sw.js'); } catch (e) {}
    }
  } catch (err) {
    S.err = String(err);
    render();
  }
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden || !S.trip) return;
  Sync.pull(S.trip.id, S.state).then(function (remote) {
    if (remote && remote.updatedAt > (S.state.updatedAt || 0)) {
      S.state = Object.assign(S.state, remote);
      render(); toast('최신 체크 상태로 맞췄습니다');
    }
  }).catch(function () {});
});

boot();
