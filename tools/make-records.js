// Odds Ace monthly records: a dated copy of the public website, kept for the record.
// The federal wagering advertising rules that start on 1 January 2027 call for 12 months of records of what was
// published. Git already keeps every version of the site's files; this adds what the pages actually looked like:
// every page printed to PDF at desktop width, a phone screenshot of the home page, and the list of website versions
// published since the last capture. The "Odds Ace monthly records" scheduled task runs it on the 1st of each month
// and pushes the result to the records branch (records/website/<Sydney date>/).
//
// NODE_PATH=/home/claude/.npm-global/lib/node_modules node tools/make-records.js \
//   --site <main checkout>/site --data <data checkout>/results.json --repo <main checkout> \
//   --since 2026-09-01T00:00:00Z --out records/website/2026-11-01
//
// The page is served from a local copy, so nothing is fetched from the internet: the site's Google Fonts come from
// tools/fonts (the same files, under their open font licence) and its live results from the data branch's results.json.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
['site', 'data', 'repo', 'since', 'out'].forEach(k => { if (!args[k]) { console.error('missing --' + k); process.exit(2); } });
const SITE = path.resolve(args.site), OUT = path.resolve(args.out), FONTS = args.fonts || path.join(__dirname, 'fonts');
const DATA_URL = 'https://raw.githubusercontent.com/oddsace-site/website/data/results.json';

// Every page of the site: the home page, the pages opened from its links (#terms and so on) and the explainer page.
const PAGES = [
  ['home', '/'],
  ['terms', '/#terms'],
  ['privacy', '/#privacy'],
  ['responsible-gambling', '/#responsible-gambling'],
  ['about', '/#about'],
  ['compare', '/#compare'],
  ['method', '/#method'],
  ['faq', '/#faq'],
  ['after-you-join', '/#after-you-join'],
  ['why-aussie-odds-lag', '/why-aussie-odds-lag/'],
];

const FONT_CSS = [
  ['Libre Franklin', 'LibreFranklin-Regular.ttf', '400'], ['Libre Franklin', 'LibreFranklin-Medium.ttf', '500'],
  ['Libre Franklin', 'LibreFranklin-SemiBold.ttf', '600'], ['Libre Franklin', 'LibreFranklin-Bold.ttf', '700'],
  ['Big Shoulders Display', 'BigShouldersDisplay-ExtraBold.ttf', '700'], ['Big Shoulders Display', 'BigShouldersDisplay-ExtraBold.ttf', '800'],
  ['IBM Plex Mono', 'IBMPlexMono-Regular.ttf', '400'], ['IBM Plex Mono', 'IBMPlexMono-Medium.ttf', '500'],
  ['IBM Plex Mono', 'IBMPlexMono-SemiBold.ttf', '600'],
].map(([family, file, weight]) => "@font-face{font-family:'" + family + "';font-style:normal;font-weight:" + weight +
  ";font-display:block;src:url(data:font/ttf;base64," + fs.readFileSync(path.join(FONTS, file)).toString('base64') + ") format('truetype')}").join('\n');

const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(SITE, path.normalize(p));
    if (!file.startsWith(SITE) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const sydney = d => new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).format(d);
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const blocked = new Set();
  async function newPage(opts) {
    const context = await browser.newContext(Object.assign({ locale: 'en-AU', timezoneId: 'Australia/Sydney', colorScheme: 'light' }, opts));
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      if (url.startsWith('https://fonts.googleapis.com/')) return route.fulfill({ status: 200, contentType: 'text/css', body: FONT_CSS });
      if (url.split('?')[0] === DATA_URL) return route.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(args.data) });
      blocked.add(new URL(url).hostname);
      return route.abort();
    });
    return context.newPage();
  }
  async function settle(page, url) {
    await page.goto(base + url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
  }

  const files = [];
  for (const [name, url] of PAGES) {
    const page = await newPage({ viewport: { width: 1280, height: 900 } });
    await settle(page, url);
    await page.emulateMedia({ media: 'screen' });
    const title = await page.title();
    const file = path.join(OUT, name + '.pdf');
    await page.pdf({ path: file, width: '1280px', height: '1810px', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    const pdf = fs.readFileSync(file);
    files.push({ page: name, url: 'https://oddsaceaustralia.com' + url, title, file: name + '.pdf', bytes: pdf.length, pages: (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length });
    await page.context().close();
  }
  const phone = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await settle(phone, '/');
  await phone.screenshot({ path: path.join(OUT, 'home-phone.png') });
  files.push({ page: 'home (phone, first screen)', url: 'https://oddsaceaustralia.com/', file: 'home-phone.png', bytes: fs.statSync(path.join(OUT, 'home-phone.png')).size });
  await phone.context().close();
  await browser.close();
  server.close();

  // The website versions published since the last capture (each commit to the site on the main branch).
  const log = execFileSync('git', ['-C', args.repo, 'log', '--since=' + args.since, '--format=%H%x09%cI%x09%s', '--', 'site'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean).map(line => { const [hash, when, subject] = line.split('\t'); return { hash, when, subject }; });
  const head = execFileSync('git', ['-C', args.repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const now = new Date();
  fs.writeFileSync(path.join(OUT, 'versions.txt'), [
    'Odds Ace Australia website: versions published from ' + sydney(new Date(args.since)) + ' to ' + sydney(now),
    'Each line is one publish to oddsaceaustralia.com (a commit to the site on the main branch of github.com/oddsace-site/website):',
    'Sydney time, commit, what changed. The exact files of any version: https://github.com/oddsace-site/website/tree/<commit>/site',
    '',
    ...(log.length ? log.map(c => sydney(new Date(c.when)) + '  ' + c.hash.slice(0, 7) + '  ' + c.subject) : ['(no changes in this period)']),
    '',
  ].join('\n'));
  const manifest = {
    captured_at_utc: now.toISOString(),
    captured_at_sydney: sydney(now),
    since_utc: new Date(args.since).toISOString(),
    site_commit: head,
    site_index_sha256: sha256(fs.readFileSync(path.join(SITE, 'index.html'))),
    results_json_sha256: sha256(fs.readFileSync(args.data)),
    versions_published: log.length,
    files,
    blocked_hosts: Array.from(blocked).sort(),
    note: 'Printed from a local copy of the site at site_commit, with the live results data from the data branch. Fonts are the site\'s own Google Fonts, from tools/fonts on the reports branch.',
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ out: OUT, pages: files.length, versions: log.length, smallest: Math.min(...files.map(f => f.bytes)), blocked: manifest.blocked_hosts }));
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
