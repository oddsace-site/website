#!/usr/bin/env node
// Odds Ace Australia: quarterly results report (PDF).
//
// Built from the Edge Tracker's records with the website's own results code (resultRows, speedStats, unitStats, read
// from the live page), so every figure matches the website's Results section. Each quarter's report covers the alerts
// sent in that quarter (Sydney dates); the October-December 2026 report also covers the launch alerts of 29-30 September.
//
//   node make-report.js --page index.html --bets DIR --closes DIR --speed DIR --quarter 2026Q4 --out report.pdf
//        [--asof 2026-10-05T07:00:00Z] [--html report.html] [--fonts DIR]
//
// --page   the live website page (index.html, as the Artifact tool saves it)
// --bets, --closes, --speed   folders of tracker documents ("bets", "usau_closes", "usau_speed"), one JSON file per
//          document named <document id>.json (ArtifactData's out_dir layout)
// --asof   the time the report is "as of" (default: now); games after it count as not started
// Needs Playwright with Chromium (NODE_PATH pointing at the global node_modules).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
['page', 'bets', 'closes', 'speed', 'quarter', 'out'].forEach(k => { if (!args[k]) throw new Error('missing --' + k); });
const FONTS = args.fonts || path.join(__dirname, 'fonts');

// ------------------------------------------------------------------ the website's own code and content
const html = fs.readFileSync(args.page, 'utf8');
const grab = re => { const m = html.match(re); if (!m) throw new Error('page part missing: ' + re); return m[1]; };
const siteJs = grab(/<script id="site-js">([\s\S]*?)<\/script>/);
const model = JSON.parse(grab(/<script type="application\/json" id="site-data">([\s\S]*?)<\/script>/));
const tmpJs = path.join(os.tmpdir(), 'oa-site-' + process.pid + '.js');
fs.writeFileSync(tmpJs, siteJs);
const api = require(tmpJs);
fs.unlinkSync(tmpJs);
['resultRows', 'speedStats', 'unitStats', 'tagline'].forEach(k => { if (typeof api[k] !== 'function') throw new Error('site code has no ' + k); });

function readDocs(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.json')) { const doc = JSON.parse(fs.readFileSync(p, 'utf8')); doc._id = f.slice(0, -5); out.push(doc); }
    }
  })(dir);
  return out;
}
const allBets = readDocs(args.bets), closes = readDocs(args.closes), speed = readDocs(args.speed);
if (!allBets.length) throw new Error('no tracker bets found in ' + args.bets);
const asOfMs = args.asof ? Date.parse(args.asof) : Date.now();
if (isNaN(asOfMs)) throw new Error('bad --asof');

// ------------------------------------------------------------------ the same rules as the website
const TESTS_BEFORE = '2026-10-04T13:24:00Z';   // tests: alerts held back during the 1-4 Oct filter trial
const LAUNCH_DAY = '2026-09-29';               // first alert in the tracker (Sydney date)
const UNITS_FROM = 20, CLV_MIN = 10, SPEED_MIN_CLOSES = 5, SPEED_MIN_TIMED = 10, SPEED_START_MAX = 50;
const LEAGUES = { NFL: 'NFL', NCAAF: 'College football', NHL: 'NHL', MLB: 'MLB', NBA: 'NBA', NCAAB: 'College basketball' };
const MARKETS = { 'player prop': 'Player props', scorer: 'Scorer markets', 'sharp money': 'Sharp-money moves', 'game line': 'Game lines', 'team total': 'Team totals' };
const VOIDED = { 'void': 1, voided: 1, 'settled-void': 1, cancelled: 1, canceled: 1, refund: 1, refunded: 1 };
const isSent = d => d.emailed !== false && d.held_back !== true;
const isTest = d => d.held_back === true && String(d.alert_sent_utc || '') < TESTS_BEFORE;

// ------------------------------------------------------------------ Sydney dates
const SYD = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function syd(ms) {
  const p = {};
  SYD.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: p.weekday.replace('.', '') };
}
const pad = n => String(n).padStart(2, '0');
const sydDay = ms => { const p = syd(ms); return p.y + '-' + pad(p.mo) + '-' + pad(p.d); };
const clock = p => (p.h % 12 || 12) + ':' + pad(p.mi) + (p.h < 12 ? 'am' : 'pm');
const fmtDay = ms => { const p = syd(ms); return p.wd + ' ' + p.d + ' ' + MON[p.mo - 1]; };
const fmtWhen = ms => { const p = syd(ms); return p.wd + ' ' + p.d + ' ' + MON[p.mo - 1] + ', ' + clock(p); };
const shortWhen = ms => { const p = syd(ms); return p.d + ' ' + MON[p.mo - 1] + ' ' + clock(p); };
const dayLabel = day => { const [y, m, d] = day.split('-').map(Number); return d + ' ' + MONTH[m - 1] + ' ' + y; };
const dayShort = day => { const [, m, d] = day.split('-').map(Number); return d + ' ' + MON[m - 1]; };
function addDays(day, n) { return new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
function weekday(day) { return new Date(day + 'T00:00:00Z').getUTCDay(); } // 0 = Sunday

// ------------------------------------------------------------------ the quarter
const qm = /^(\d{4})Q([1-4])$/i.exec(args.quarter);
if (!qm) throw new Error('--quarter must look like 2026Q4');
const QY = +qm[1], QN = +qm[2];
const QFROM = QY + '-' + pad((QN - 1) * 3 + 1) + '-01';
const QTO = QY + '-' + pad(QN * 3) + '-' + pad(new Date(Date.UTC(QY, QN * 3, 0)).getUTCDate());
if (QTO < LAUNCH_DAY) throw new Error('Odds Ace started on ' + LAUNCH_DAY + ': there are no alerts in ' + args.quarter);
const WITH_LAUNCH = QY === 2026 && QN === 4;   // the October-December 2026 report also covers the launch alerts of 29-30 Sep
const START = WITH_LAUNCH ? LAUNCH_DAY : QFROM;
const QNAME = MONTH[(QN - 1) * 3] + '–' + MONTH[QN * 3 - 1] + ' ' + QY;
const asOfDay = sydDay(asOfMs);
const FINAL = asOfDay > QTO;
const inPeriod = d => { const t = Date.parse(d.alert_sent_utc || ''); if (isNaN(t)) return false; const day = sydDay(t); return day >= START && day <= QTO; };

const bets = allBets.filter(d => inPeriod(d) && (isSent(d) || isTest(d)));
const sentBets = bets.filter(isSent), testBets = bets.filter(isTest);
if (!sentBets.length && !testBets.length) throw new Error('no alerts in ' + START + ' to ' + QTO);
const lastAlertMs = Math.max.apply(null, bets.map(d => Date.parse(d.alert_sent_utc)));

// ------------------------------------------------------------------ per-alert detail
const byAlert = {};
closes.forEach(c => { if (c && c.alert_doc_id) (byAlert[c.alert_doc_id] = byAlert[c.alert_doc_id] || []).push(c); });
const SETTLED_RE = /Selection\s+'[^']*'[^.]*?\b(WON|LOST|VOID|VOIDED|PUSH)\b\s*[-–—:,]?\s*(.*)$/i;
function settledHow(note) {
  const m = SETTLED_RE.exec(String(note || '').replace(/\s+/g, ' ').trim());
  let s = m ? m[2].trim() : '';
  s = s.replace(/^[-–—:,.\s]+/, '').replace(/\s*\.$/, '');
  if (!s) return '';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.length > 110 ? s.slice(0, 107).replace(/\s+\S*$/, '') + '…' : s;
}
function finalScore(note) {
  const fin = /Final:\s*([^(;]+?)\s*(?:\(|;|\.\s|$)/.exec(note || '');
  return fin ? fin[1].trim() : '';
}
function alertRow(d) {
  const sentMs = Date.parse(d.alert_sent_utc), startMs = Date.parse(d.event_start_utc || '');
  const odds = d.paper_track_odds != null ? d.paper_track_odds : d.odds;
  const gap = d.paper_track_ev_pct != null ? d.paper_track_ev_pct : d.ev_pct;
  const cs = (byAlert[d._id] || []).slice().sort((a, b) => String(a.captured_at_utc).localeCompare(String(b.captured_at_utc)));
  let last = null, priced = null, any = null;
  cs.forEach(c => {
    any = c;
    if (typeof c.book_price_now === 'number' && typeof c.odds_taken === 'number') last = c;
    if (typeof c.clv_pct === 'number' && isFinite(c.clv_pct)) priced = c;
  });
  const started = any && Date.parse(any.event_start_utc || '') <= asOfMs;
  return {
    id: d._id, sent: isSent(d), test: isTest(d),
    sport: d.sport || (d.alert_row && d.alert_row.sport) || '',
    market: MARKETS[d.alert_type] || (d.alert_type ? d.alert_type.charAt(0).toUpperCase() + d.alert_type.slice(1) : 'Other'),
    game: d.matchup || '', selection: d.paper_track_selection || d.selection || '',
    book: d.paper_track_book || d.book || '',
    price: typeof odds === 'number' ? odds : null, us: typeof d.us_fair_price === 'number' ? d.us_fair_price : null,
    gap: typeof gap === 'number' && isFinite(gap) ? gap : null,
    sentMs, startMs, before: !isNaN(startMs) ? (startMs - sentMs) / 3600000 : null,
    status: d.status || 'pending', final: finalScore(d.result_note), how: settledHow(d.result_note),
    lastPrice: last ? last.book_price_now : null, dropped: last ? last.book_price_now < last.odds_taken - 1e-9 : null,
    clv: d.held_back !== true && priced && started && !VOIDED[d.status] ? priced.clv_pct : null
  };
}
const rowsAll = bets.map(alertRow);

// ------------------------------------------------------------------ figures, exactly as the website works them out
function figures(list) {
  const sent = list.filter(isSent);
  const S = api.speedStats(sent, closes, speed, asOfMs);
  const settled = api.resultRows(sent);
  const U = api.unitStats(settled);
  return { n: sent.length, S, U, settled: settled.length };
}
const F = figures(bets);
// Tallies, as on the website: all alerts found, sent to members, tests (each a 1-unit stake at the alerted price)
function tally(rows) { return { rows, settled: rows.length, U: rows.length >= UNITS_FROM ? api.unitStats(rows) : null }; }
const sentRows = api.resultRows(sentBets);
const testRows = api.resultRows(testBets.map(d => Object.assign({}, d, { emailed: true, held_back: false })));
const T = { all: tally(sentRows.concat(testRows)), sent: tally(sentRows), tests: tally(testRows) };

// Time on the old line (Kaplan-Meier), with the website's rules: only alerts first re-checked within 50 minutes, a drop
// timed halfway between the last check that still found the old price and the first that didn't.
function kmCurve(list) {
  const ids = {}; list.filter(isSent).forEach(d => { ids[d._id] = 1; });
  const obs = [];
  speed.forEach(s => {
    if (!s || !ids[s.alert_doc_id]) return;
    const t0 = Date.parse(s.alert_sent_utc), tm = Date.parse(s.moved_at_utc || ''), tl = Date.parse(s.last_on_old_line_utc || '');
    if (isNaN(t0)) return;
    let first = NaN;
    (Array.isArray(s.checks) ? s.checks : []).forEach(c => { const t = Date.parse((c && c.t) || ''); if (!isNaN(t) && (isNaN(first) || t < first)) first = t; });
    if (isNaN(first)) first = Math.min(isNaN(tm) ? Infinity : tm, isNaN(tl) ? Infinity : tl);
    if (!isFinite(first) || (first - t0) / 60000 > SPEED_START_MAX) return;
    if (!isNaN(tm)) { const seen = (!isNaN(tl) && tl < tm) ? Math.max(tl, t0) : t0; obs.push({ t: Math.max(0, ((seen + tm) / 2 - t0) / 60000), e: 1 }); }
    else if (!isNaN(tl)) obs.push({ t: Math.max(0, (tl - t0) / 60000), e: 0 });
  });
  obs.sort((a, b) => a.t - b.t || b.e - a.e);
  let atRisk = obs.length, surv = 1, i = 0, longest = 0;
  const curve = [[0, 1]];
  while (i < obs.length) {
    const t = obs[i].t; let dd = 0, cc = 0;
    while (i < obs.length && obs[i].t === t) { if (obs[i].e) dd += 1; else cc += 1; i += 1; }
    if (dd) { surv *= 1 - dd / atRisk; curve.push([t, surv]); }
    atRisk -= dd + cc; longest = Math.max(longest, t);
  }
  return { n: obs.length, moved: obs.filter(o => o.e).length, curve, longest };
}
const KM = kmCurve(bets);

// ------------------------------------------------------------------ formatting
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MINUS = '−';
const signed = (x, dp) => { const s = Math.abs(x).toFixed(dp); return (Number(s) === 0 ? '' : x > 0 ? '+' : MINUS) + s; };
const pct = (a, b) => Math.round(a / b * 100) + '%';
const price = x => x == null ? '' : x.toFixed(2);
function fmtMinutes(mins) {
  const m = Math.max(5, Math.round(mins / 5) * 5);
  if (m < 60) return m + ' min';
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh + ' h' + (mm ? ' ' + mm + ' min' : '');
}
function hoursBefore(h) {
  if (h == null) return '';
  if (h < 1) return Math.max(1, Math.round(h * 60)) + ' min before';
  if (h < 48) return Math.round(h) + ' h before';
  return Math.round(h / 24) + ' days before';
}
const DASH = '<span class="na">–</span>';
const cell = (ok, v) => ok ? v : DASH;

// ------------------------------------------------------------------ charts (SVG, drawn to scale)
function niceStep(range, target) {
  const raw = range / Math.max(1, target), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}
function unitsChart() {
  // Units added up game by game (by start time), one line each for all alerts found, sent to members and the tests.
  const W = 680, H = 250, ml = 46, mr = 128, mt = 14, mb = 30;
  const lines = [['all', 'All alerts found', T.all.rows], ['tests', 'Tests, not sent', T.tests.rows], ['sent', 'Sent to members', T.sent.rows]]
    .filter(l => l[2].length >= UNITS_FROM);
  if (!lines.length) return '';
  const series = lines.map(([k, name, rows]) => {
    const byT = {};
    rows.forEach(r => { const p = parseFloat(r.price); const c = r.result === 'won' && p > 1 ? Math.round((p - 1) * 100) : r.result === 'lost' ? -100 : 0; byT[r.t] = (byT[r.t] || 0) + c; });
    let acc = 0;
    const pts = Object.keys(byT).sort().map(t => { acc += byT[t]; return [Date.parse(t), acc / 100]; });
    return { k, name, pts };
  });
  const xs = [].concat.apply([], series.map(s => s.pts.map(p => p[0]))), ys = [0].concat.apply([], series.map(s => s.pts.map(p => p[1])));
  const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  let y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  const step = niceStep(y1 - y0 || 10, 5);
  y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step;
  if (y1 === y0) y1 = y0 + step;
  const X = t => ml + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - ml - mr), Y = v => mt + (y1 - v) / (y1 - y0) * (H - mt - mb);
  const out = ['<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Units over time">'];
  for (let v = y0; v <= y1 + 1e-9; v += step) {
    out.push('<line class="' + (Math.abs(v) < 1e-9 ? 'zero' : 'grid') + '" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/>');
    out.push('<text class="tick" x="' + (ml - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + signed(v, step < 1 ? 1 : 0) + '</text>');
  }
  // x ticks: Sydney midnights, thinned to about 7 labels
  const days = []; for (let d = sydDay(x0); d <= sydDay(x1); d = addDays(d, 1)) days.push(d);
  const every = Math.max(1, Math.ceil(days.length / 7));
  days.forEach((d, i) => {
    if (i % every) return;
    const t = Date.parse(d + 'T00:00:00+10:00') + (Date.parse(d + 'T12:00:00Z') >= Date.parse('2026-10-03T16:00:00Z') ? -3600000 : 0);
    if (t < x0 - 3600000 || t > x1) return;
    const x = X(Math.max(t, x0));
    out.push('<text class="tick" x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + dayShort(d) + '</text>');
  });
  const ends = [];
  series.forEach(s => {
    const d = s.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    out.push('<path class="line k-' + s.k + '" d="' + d + '"/>');
    const lp = s.pts[s.pts.length - 1];
    out.push('<circle class="dot k-' + s.k + '" cx="' + X(lp[0]).toFixed(1) + '" cy="' + Y(lp[1]).toFixed(1) + '" r="3.5"/>');
    ends.push({ s, y: Y(lp[1]), v: lp[1], x: X(lp[0]) });
  });
  // direct labels at the line ends, nudged apart so they never overlap
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 26) ends[i].y = ends[i - 1].y + 26;
  const over = ends.length ? ends[ends.length - 1].y - (H - mb) : 0;
  if (over > 0) ends.forEach(e => { e.y -= over; });
  ends.forEach(e => {
    out.push('<text class="end" x="' + (W - mr + 10) + '" y="' + (e.y - 1).toFixed(1) + '"><tspan class="end-v">' + signed(e.v, 1) + '</tspan></text>');
    out.push('<text class="end-n" x="' + (W - mr + 10) + '" y="' + (e.y + 11).toFixed(1) + '">' + esc(e.s.name) + '</text>');
  });
  out.push('</svg>');
  const legend = '<ul class="legend">' + ['sent', 'all', 'tests'].map(k => series.find(s => s.k === k)).filter(Boolean).map(s => '<li><span class="key k-' + s.k + '"></span>' + esc(s.name) + '</li>').join('') + '</ul>';
  return legend + out.join('');
}
function kmChart() {
  if (KM.n < SPEED_MIN_TIMED) return '';
  const W = 680, H = 230, ml = 46, mr = 24, mt = 14, mb = 34;
  const xMax = Math.max(120, Math.min(24 * 60, Math.ceil(Math.max(KM.longest, 60) / 60) * 60));
  const X = m => ml + Math.min(m, xMax) / xMax * (W - ml - mr), Y = s => mt + (1 - s) * (H - mt - mb);
  const out = ['<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Share of alerted prices still on the old line">'];
  [0, 0.25, 0.5, 0.75, 1].forEach(s => {
    out.push('<line class="grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(s).toFixed(1) + '" y2="' + Y(s).toFixed(1) + '"/>');
    out.push('<text class="tick" x="' + (ml - 8) + '" y="' + (Y(s) + 4).toFixed(1) + '" text-anchor="end">' + Math.round(s * 100) + '%</text>');
  });
  const tickStep = xMax <= 180 ? 30 : xMax <= 360 ? 60 : xMax <= 720 ? 120 : 240;
  for (let m = 0; m <= xMax; m += tickStep) out.push('<text class="tick" x="' + X(m).toFixed(1) + '" y="' + (H - 14) + '" text-anchor="middle">' + (m < 60 ? m + ' min' : (m / 60) + ' h') + '</text>');
  let d = 'M' + X(0).toFixed(1) + ' ' + Y(1).toFixed(1), prev = 1;
  KM.curve.slice(1).forEach(([t, s]) => { if (t > xMax) return; d += ' L' + X(t).toFixed(1) + ' ' + Y(prev).toFixed(1) + ' L' + X(t).toFixed(1) + ' ' + Y(s).toFixed(1); prev = s; });
  d += ' L' + X(Math.min(KM.longest, xMax)).toFixed(1) + ' ' + Y(prev).toFixed(1);
  out.push('<path class="line k-sent" d="' + d + '"/>');
  if (F.S.at30 != null) {
    out.push('<line class="mark" x1="' + X(30).toFixed(1) + '" x2="' + X(30).toFixed(1) + '" y1="' + mt + '" y2="' + (H - mb) + '"/>');
    out.push('<circle class="dot k-sent" cx="' + X(30).toFixed(1) + '" cy="' + Y(F.S.at30).toFixed(1) + '" r="3.5"/>');
    out.push('<text class="note-t" x="' + (X(30) + 8).toFixed(1) + '" y="' + (Y(F.S.at30) - 8).toFixed(1) + '">' + Math.round(F.S.at30 * 100) + '% still on the old price at 30 min</text>');
  }
  out.push('<text class="axis-t" x="' + ((ml + W - mr) / 2) + '" y="' + (H - 1) + '" text-anchor="middle">Time since the alert</text>');
  out.push('</svg>');
  return out.join('');
}

// ------------------------------------------------------------------ tables
function groupTable(title, groups, firstCol) {
  const head = '<thead><tr><th class="l">' + esc(firstCol) + '</th><th>Alerts sent</th><th>Average gap</th><th>Beat the US close</th><th>Average closing value</th><th>Dropped by kick-off</th><th>Typical time on old line</th><th>Settled</th><th>Units</th><th>ROI</th></tr></thead>';
  const body = groups.map(([label, list]) => {
    const f = figures(list), S = f.S, U = f.settled >= UNITS_FROM ? f.U : null;
    const clv = S.clvClosed >= CLV_MIN && S.clvAvg != null, dr = S.closes >= SPEED_MIN_CLOSES, tm = S.tracked >= SPEED_MIN_TIMED;
    return '<tr><th class="l">' + esc(label) + '</th><td>' + f.n + '</td>' +
      '<td>' + (S.gapAvg != null ? signed(S.gapAvg, 1) + '%' : DASH) + '</td>' +
      '<td>' + cell(clv, pct(S.clvBeat, S.clvClosed) + '<span class="sub">' + S.clvBeat + ' of ' + S.clvClosed + '</span>') + '</td>' +
      '<td>' + cell(clv, signed(S.clvAvg, 1) + '%') + '</td>' +
      '<td>' + cell(dr, pct(S.dropped, S.closes) + '<span class="sub">' + S.dropped + ' of ' + S.closes + '</span>') + '</td>' +
      '<td>' + cell(tm, S.median != null ? fmtMinutes(S.median) : 'over ' + fmtMinutes(S.longest || 0)) + '</td>' +
      '<td>' + f.settled + '</td>' +
      '<td>' + cell(U, U ? signed(U.units, 1) : '') + '</td>' +
      '<td>' + cell(U, U ? signed(U.roi, 1) + '%<span class="sub">± ' + Math.round(U.margin) + '</span>' : '') + '</td></tr>';
  }).join('');
  return '<div class="blk"><h3>' + esc(title) + '</h3><table class="grp">' + head + '<tbody>' + body + '</tbody></table></div>';
}
function groupsBy(keyFn, order) {
  const m = {};
  sentBets.forEach(d => { const k = keyFn(d); (m[k] = m[k] || []).push(d); });
  let keys = Object.keys(m);
  keys = order ? order.filter(k => m[k]).concat(keys.filter(k => order.indexOf(k) < 0)) : keys.sort((a, b) => m[b].length - m[a].length || a.localeCompare(b));
  return keys.map(k => [k, m[k]]);
}
const sportOf = d => LEAGUES[d.sport] || d.sport || 'Other';
const marketOf = d => MARKETS[d.alert_type] || 'Other';
const TIMING = ['More than 24 hours before', '6 to 24 hours before', '2 to 6 hours before', 'Under 2 hours before'];
const timingOf = d => { const h = (Date.parse(d.event_start_utc || '') - Date.parse(d.alert_sent_utc)) / 3600000; return isNaN(h) ? 'Start time not recorded' : h > 24 ? TIMING[0] : h > 6 ? TIMING[1] : h > 2 ? TIMING[2] : TIMING[3]; };
const GAPS = ['Under 8%', '8 to 12%', '12 to 15%', '15 to 20%', '20% or more'];
const gapOf = d => { const g = d.paper_track_ev_pct != null ? d.paper_track_ev_pct : d.ev_pct; return typeof g !== 'number' ? 'Not recorded' : g < 8 ? GAPS[0] : g < 12 ? GAPS[1] : g < 15 ? GAPS[2] : g < 20 ? GAPS[3] : GAPS[4]; };

function weeklyTable() {
  const sports = Object.keys(LEAGUES).filter(s => bets.some(d => d.sport === s));
  const first = START, weeks = [];
  let ws = addDays(first, -((weekday(first) + 6) % 7)); // Monday on or before the start
  const end = FINAL ? QTO : asOfDay;
  while (ws <= end) { weeks.push(ws); ws = addDays(ws, 7); }
  const rows = weeks.map(w => {
    const a = w < START ? START : w, b = addDays(w, 6) > end ? end : addDays(w, 6);
    const inW = d => { const day = sydDay(Date.parse(d.alert_sent_utc)); return day >= a && day <= b; };
    const s = sentBets.filter(inW), t = testBets.filter(inW);
    return '<tr><th class="l">' + dayShort(a) + (a === b ? '' : ' to ' + dayShort(b)) + '</th>' + sports.map(sp => '<td>' + (s.filter(d => d.sport === sp).length || DASH) + '</td>').join('') +
      '<td class="b">' + s.length + '</td><td>' + (t.length || DASH) + '</td></tr>';
  }).join('');
  return '<table class="grp wk"><thead><tr><th class="l">Alerts sent (Sydney dates)</th>' + sports.map(s => '<th>' + esc(LEAGUES[s]) + '</th>').join('') + '<th>All sent</th><th>Tests, not sent</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

// The record: every alert, game by game in order of start time
const LOG_MAX = 800; // more alerts than this and the record goes in the CSV only
const PILL = { won: 'Won', lost: 'Lost', push: 'Push', 'void': 'Void', pending: 'Pending' };
function logTable() {
  const games = {};
  rowsAll.forEach(r => { const k = (isNaN(r.startMs) ? 'z' : new Date(r.startMs).toISOString()) + '|' + r.sport + '|' + r.game; (games[k] = games[k] || []).push(r); });
  const keys = Object.keys(games).sort();
  const body = keys.map(k => {
    const rs = games[k].sort((a, b) => a.sentMs - b.sentMs || a.selection.localeCompare(b.selection)), g = rs[0];
    const fin = rs.map(r => r.final).find(Boolean) || '';
    const head = '<tr class="game"><td colspan="9"><span class="g-when">' + (isNaN(g.startMs) ? '' : esc(fmtWhen(g.startMs))) + '</span>' +
      '<span class="g-lg">' + esc(LEAGUES[g.sport] || g.sport) + '</span><span class="g-name">' + esc(g.game) + '</span>' +
      (fin ? '<span class="g-fin">Final: ' + esc(fin) + '</span>' : (g.startMs > asOfMs ? '<span class="g-fin">Not started</span>' : '')) + '</td></tr>';
    const lines = rs.map(r => '<tr class="a' + (r.test ? ' is-test' : '') + '">' +
      '<td class="sel"><b>' + esc(r.selection) + '</b><span class="sub">' + esc(r.market) + (r.test ? ' · <em>Test, not sent</em>' : '') + '</span></td>' +
      '<td>' + esc(r.book) + '</td>' +
      '<td class="when">' + esc(shortWhen(r.sentMs)) + '<span class="sub">' + esc(hoursBefore(r.before)) + '</span></td>' +
      '<td class="n">' + price(r.price) + '</td>' +
      '<td class="n">' + (r.us != null ? price(r.us) : DASH) + '</td>' +
      '<td class="n">' + (r.gap != null ? signed(r.gap, 1) + '%' : DASH) + '</td>' +
      '<td class="n">' + (r.lastPrice != null ? price(r.lastPrice) + '<span class="sub">' + (r.dropped ? 'dropped' : r.lastPrice > r.price + 1e-9 ? 'longer' : 'held') + '</span>' : DASH) + '</td>' +
      '<td class="n">' + (r.clv != null ? signed(r.clv, 1) + '%' : DASH) + '</td>' +
      '<td class="res"><span class="pill p-' + esc(r.status) + '">' + esc(PILL[r.status] || r.status) + '</span>' + (r.how ? '<span class="sub">' + esc(r.how) + '</span>' : '') + '</td></tr>').join('');
    return '<tbody class="g">' + head + lines + '</tbody>';
  }).join('');
  return '<table class="log"><colgroup><col class="c-sel"><col class="c-book"><col class="c-when"><col class="c-n"><col class="c-n"><col class="c-n2"><col class="c-n2"><col class="c-n2"><col class="c-res"></colgroup>' +
    '<thead><tr><th class="l">Alert</th><th class="l">Bookmaker</th><th class="l">Sent (Sydney)</th><th>Price</th><th>US fair</th><th>Gap</th><th>Last check</th><th>Closing value</th><th class="l">Result</th></tr></thead>' + body + '</table>';
}

// ------------------------------------------------------------------ the document
const tag = api.tagline(model, asOfMs);
const signOff = '18+ · ' + tag + (/set a deposit limit\.?\s*$/i.test(tag) ? '' : ' Set a deposit limit.') + ' For free and confidential support call 1800 858 858 or visit gamblinghelponline.org.au';
const edition = FINAL ? 'Final edition' : 'Quarter so far';
const longDay = ms => { const p = syd(ms); return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()] + ' ' + p.d + ' ' + MONTH[p.mo - 1] + ' ' + p.y; };
const coverage = 'Covers alerts sent from ' + dayLabel(START) + ' to ' + (FINAL ? dayLabel(QTO) : dayLabel(sydDay(lastAlertMs)));
const asOfText = 'Results as of ' + clock(syd(asOfMs)) + ' on ' + longDay(asOfMs) + ', Sydney time';
const S = F.S;
const tiles = [];
tiles.push([String(sentBets.length), 'alerts sent to members' + (testBets.length ? ', plus ' + testBets.length + ' tests that weren\'t sent' : '')]);
if (S.clvClosed >= CLV_MIN && S.clvAvg != null) tiles.push([pct(S.clvBeat, S.clvClosed), 'beat the US closing price (' + S.clvBeat + ' of ' + S.clvClosed + '), average ' + signed(S.clvAvg, 1) + '%']);
if (S.closes >= SPEED_MIN_CLOSES) tiles.push([pct(S.dropped, S.closes), 'had dropped by kick-off at the same bookmaker (' + S.dropped + ' of ' + S.closes + ')']);
if (S.tracked >= SPEED_MIN_TIMED) tiles.push([S.median != null ? fmtMinutes(S.median).replace(/ h /, 'h ').replace(/ min$/, 'm').replace(/^(\d+) h$/, '$1h') : 'Over ' + fmtMinutes(S.longest || 0), 'typical time an alerted price stayed on the old line (' + S.tracked + ' followed)']);
function tallyRow(label, t) {
  return '<tr><th class="l">' + esc(label) + '</th><td>' + t.settled + '</td><td>' + (t.U ? signed(t.U.units, 1) : DASH) + '</td><td>' + (t.U ? signed(t.U.roi, 1) + '%' : DASH) + '</td><td>' + (t.U ? '± ' + Math.round(t.U.margin) + ' points' : DASH) + '</td></tr>';
}
const nResults = T.all.settled;
const css = fs.readFileSync(path.join(__dirname, 'report.css'), 'utf8')
  .replace('/*FONTS*/', [['Libre Franklin', 'LibreFranklin-Regular.ttf', 'normal', '400'], ['Libre Franklin', 'LibreFranklin-Medium.ttf', 'normal', '500'],
    ['Libre Franklin', 'LibreFranklin-SemiBold.ttf', 'normal', '600'], ['Libre Franklin', 'LibreFranklin-Bold.ttf', 'normal', '700'],
    ['Big Shoulders Display', 'BigShouldersDisplay-ExtraBold.ttf', 'normal', '800'], ['IBM Plex Mono', 'IBMPlexMono-Regular.ttf', 'normal', '400'],
    ['IBM Plex Mono', 'IBMPlexMono-Medium.ttf', 'normal', '500'], ['IBM Plex Mono', 'IBMPlexMono-SemiBold.ttf', 'normal', '600']]
    .map(([fam, file, style, weight]) => "@font-face{font-family:'" + fam + "';src:url(data:font/ttf;base64," + fs.readFileSync(path.join(FONTS, file)).toString('base64') + ") format('truetype');font-style:" + style + ';font-weight:' + weight + '}').join('\n'))
  .replace('/*FOOT-LEFT*/', JSON.stringify(signOff))
  .replace('/*FOOT-TITLE*/', JSON.stringify('Odds Ace Australia · Results report · ' + QNAME + (FINAL ? '' : ' (quarter so far)')));

const doc = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>Odds Ace Australia results report: ${esc(QNAME)}</title><style>${css}</style></head><body>
<section class="cover">
  <header class="mast">${model.logoWide ? '<img class="logo" src="' + model.logoWide + '" alt="Odds Ace Australia">' : '<p class="brand">Odds Ace Australia</p>'}<p class="eyebrow">Quarterly results report<br><span>${esc(edition)}</span></p></header>
  <h1>${esc(QNAME)}</h1>
  <p class="cov">${esc(coverage)}${WITH_LAUNCH ? ', including the launch alerts of 29 and 30 September' : ''}.${FINAL ? '' : ' Updated weekly until the quarter ends; the final edition follows once every game has settled.'}<br>${esc(asOfText)}.</p>
  <p class="lead">Every alert Odds Ace found this quarter: the Aussie price, the US market's fair price at that moment, how the price held up before the game, and how each one finished, with the final score. Nothing is left out or added after the fact.${testBets.length ? ' The record also includes ' + testBets.length + ' test alerts found from 1 to 4 October while a filter was trialled. They weren\'t sent to members at the time, so they\'re marked and counted separately.' : ''}</p>
  <ul class="tiles">${tiles.map(t => '<li><span class="tile-n">' + esc(t[0]) + '</span><span class="tile-l">' + esc(t[1]) + '</span></li>').join('')}</ul>
  <h2>Results so far</h2>
  <table class="grp tal"><thead><tr><th class="l"></th><th>Settled</th><th>Units</th><th>ROI</th><th>Luck alone could move the ROI by</th></tr></thead><tbody>
    ${tallyRow('Sent to members', T.sent)}${testBets.length ? tallyRow('Tests, not sent (1 to 4 Oct)', T.tests) + tallyRow('All alerts found', T.all) : ''}
  </tbody></table>
  <p class="small">A 1-unit stake on every settled alert at the price in the alert; pushes and voids are left out. Units and ROI show from ${UNITS_FROM} results. ${nResults < 100 ? 'It\'s early days: with ' + nResults + ' results, luck alone moves the ROI a long way, as the last column shows (95% range). ' : ''}Members' own alerts are the first line; the other lines aren't what members received.</p>
  <div class="caution"><p><b>Paper results, not advice.</b> Results use the price in each alert. Prices often move within minutes, and bookmakers can limit accounts, so real results are likely to be lower. Odds Ace is information, not betting advice, and past results don't predict future ones. You can still lose.</p></div>
</section>

<section class="pg">
  <h2>How the alerted prices held up</h2>
  <p>Each alert compares an Aussie bookmaker's price with the US market's fair price, with the bookmakers' margin taken out. Three things show whether those prices were out of line: whether the Aussie price beat where the US market closed, whether the Aussie bookmaker cut the price before the game, and how long the old price lasted.</p>
  ${kmChart() ? '<figure><figcaption><b>Share of alerted prices still on the old line</b>, by time since the alert (' + KM.n + ' alerts followed from their first re-check, ' + KM.moved + ' seen to move)</figcaption>' + kmChart() + '</figure>' : '<p class="small">Timings appear once ' + SPEED_MIN_TIMED + ' alerts have been followed.</p>'}
  <p class="small">After each alert the same bookmaker's price is checked again at each scan until it drops or the game starts. Only alerts first re-checked within ${SPEED_START_MAX} minutes count, and a drop is timed halfway between the last check that found the old price and the first that didn't. Alerts whose game started first still count until then (a Kaplan-Meier estimate).</p>
  <h2>Units over time</h2>
  <figure><figcaption><b>Units, added up game by game</b> in order of start time (1 unit on every settled alert at the alerted price)</figcaption>${unitsChart() || '<p class="small">The chart appears from ' + UNITS_FROM + ' results.</p>'}</figure>
</section>

<section class="pg">
  <h2>Where the alerts came from</h2>
  <p>Alerts sent to members, by sport, market and bookmaker. A dash means too few alerts to measure yet: closing value shows from ${CLV_MIN} games that have started, kick-off drops from ${SPEED_MIN_CLOSES} checked alerts, time on the old line from ${SPEED_MIN_TIMED} followed alerts, and units and ROI from ${UNITS_FROM} results. The figure under ROI is how far luck alone could move it (95%).</p>
  ${groupTable('By sport', groupsBy(sportOf, Object.keys(LEAGUES).map(k => LEAGUES[k])), 'Sport')}
  ${groupTable('By market', groupsBy(marketOf), 'Market')}
  ${groupTable('By bookmaker', groupsBy(d => d.paper_track_book || d.book || 'Unknown'), 'Bookmaker')}
</section>

<section class="pg">
  <h2>Timing and size of the gap</h2>
  <p>How far ahead of the game each alert went out, and how big the gap was between the Aussie price and the US fair price when it did.</p>
  ${groupTable('By time before the game', groupsBy(timingOf, TIMING), 'Alert sent')}
  ${groupTable('By gap at the alert', groupsBy(gapOf, GAPS), 'Gap')}
  <div class="blk"><h3>Alerts by week</h3>
  ${weeklyTable()}</div>
</section>

<section class="log-s">
  <h2>The record</h2>
  ${rowsAll.length > LOG_MAX ? '<p>This quarter has ' + rowsAll.length + ' alerts, too many to list in a PDF. Every one is in the spreadsheet (CSV) published with this report, with the same columns as below.</p>' : ''}
  <p class="small">${rowsAll.length > LOG_MAX ? 'Columns in the spreadsheet' : 'Every alert in this report, game by game in order of start time (Sydney time). The same record is in the spreadsheet (CSV) published with this report'}. <b>Price</b>: the Aussie price in the alert. <b>US fair</b>: the US market's price with the margin taken out. <b>Gap</b>: how far the Aussie price was above it. <b>Last check</b>: the same bookmaker's price at the last check before the game. <b>Closing value</b>: the alerted price against the US fair price at that last check. The note under each result says how it was settled, from the box score.</p>
  ${rowsAll.length > LOG_MAX ? '' : logTable()}
</section>

<section class="pg method">
  <h2>How this report works</h2>
  <h3>What's included</h3>
  <p>Every alert Odds Ace sent to members with a Sydney date in the period, whatever happened to it${testBets.length ? ', and the test alerts from 1 to 4 October, which were found and recorded at the time but not sent' : ''}. Nothing is removed after the fact and nothing is added. The same records drive the Results section of oddsaceaustralia.com, which updates every hour.</p>
  <h3>Prices</h3>
  <p>The Aussie price is the bookmaker's price in the alert. The US fair price is the US market's price at the same moment with the bookmakers' margin removed. The gap is the Aussie price × the US fair chance − 1. A "sharp-money move" is an alert where the US line moved towards a side most of the public weren't on, and the Aussie price hadn't followed.</p>
  <h3>Closing value and kick-off checks</h3>
  <p>Before each game the scans record the same bookmaker's price again. Closing value compares the alerted price with the US market's fair price at the last check before the game: the alerted price × the US chance − 1. Above zero means the alert beat where the US market closed. It counts once the game has started; voided bets are left out. "Dropped by kick-off" compares the alerted price with the same bookmaker's price at the last check before the game. Both measure price, not profit.</p>
  <h3>Results</h3>
  <p>Each result is settled from the final score and the box score, with two sources that agree, and recorded with a note starting "Final:". Units are a 1-unit stake on every settled alert at the price in the alert; pushes and voids are left out. ROI is units divided by settled results. The luck range is the 95% spread of ROI that chance alone could produce from the same number of results.</p>
  <h3>What these figures don't show</h3>
  <p>They're paper results at the alerted price. Prices often move within minutes of an alert, bookmakers can limit or close any account and can void bets they treat as obvious errors, so real results are likely to be lower. Odds Ace is information, not betting advice. Past results don't predict future ones.</p>
  <div class="caution"><p><b>Gambling help.</b> ${esc(signOff)}. You can block yourself from all licensed Australian online and phone betting at betstop.gov.au.</p></div>
  <p class="small">Odds Ace Australia is run by Tony Chalhoub, ABN 38 722 496 289. Questions about this report: info@oddsaceaustralia.com. Built at ${esc(clock(syd(Date.now())))} on ${esc(longDay(Date.now()))} (Sydney time) from the Odds Ace results records.</p>
</section>
</body></html>`;

if (args.html) fs.writeFileSync(args.html, doc);

// The record as a spreadsheet: one row per alert, in game order (written next to the PDF unless --csv says where).
const CSV_COLS = ['game_start_sydney', 'league', 'game', 'final_score', 'alert_sent_sydney', 'hours_before_start', 'selection', 'market',
  'bookmaker', 'aussie_price', 'us_fair_price', 'gap_pct', 'last_check_price', 'last_check', 'closing_value_pct', 'result', 'how_it_settled', 'sent_to_members'];
const iso = ms => { if (isNaN(ms)) return ''; const p = syd(ms); return p.y + '-' + pad(p.mo) + '-' + pad(p.d) + ' ' + pad(p.h) + ':' + pad(p.mi); };
const csvCell = v => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const csvRows = rowsAll.slice().sort((a, b) => (a.startMs || 0) - (b.startMs || 0) || a.sentMs - b.sentMs).map(r => [
  iso(r.startMs), LEAGUES[r.sport] || r.sport, r.game, r.final, iso(r.sentMs), r.before == null ? '' : r.before.toFixed(1), r.selection, r.market,
  r.book, r.price == null ? '' : r.price.toFixed(2), r.us == null ? '' : r.us.toFixed(2), r.gap == null ? '' : r.gap.toFixed(1),
  r.lastPrice == null ? '' : r.lastPrice.toFixed(2), r.lastPrice == null ? '' : r.dropped ? 'dropped' : r.lastPrice > r.price + 1e-9 ? 'longer' : 'held',
  r.clv == null ? '' : r.clv.toFixed(1), r.status, r.how, r.test ? 'no (test, 1-4 Oct)' : 'yes']);
const csvPath = args.csv || args.out.replace(/\.pdf$/i, '') + '.csv';
fs.writeFileSync(csvPath, '\ufeff' + [CSV_COLS].concat(csvRows).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n');

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(doc, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: args.out, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, tagged: true, outline: true });
  await browser.close();
  console.log(JSON.stringify({ out: args.out, quarter: args.quarter, from: START, to: QTO, final: FINAL, alerts: bets.length, sent: sentBets.length, tests: testBets.length,
    settled: { sent: T.sent.settled, tests: T.tests.settled }, units: T.sent.U && { units: T.sent.U.units, roi: Math.round(T.sent.U.roi * 10) / 10 },
    clv: S.clvClosed >= CLV_MIN ? { beat: S.clvBeat, of: S.clvClosed, avg: S.clvAvg } : null, dropped: { n: S.dropped, of: S.closes }, median: S.median, tracked: S.tracked }));
})().catch(e => { console.error(e); process.exit(1); });
