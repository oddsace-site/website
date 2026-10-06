# Odds Ace Australia: quarterly results reports

This branch holds the downloadable results reports linked from [oddsaceaustralia.com](https://oddsaceaustralia.com). Netlify never builds it, so updating a report costs nothing.

- **`reports/latest.pdf`** and **`reports/latest.csv`**: the current quarter so far, refreshed weekly. The website links to these.
- **`reports/odds-ace-results-YYYY-qN.pdf`** and **`.csv`**: each quarter's report. A quarter's final edition replaces its "so far" edition once every game in it has settled.
- **`tools/make-report.js`**: builds a report from the Edge Tracker's records with the website's own results code, so every figure matches the site. See the comment at the top for how to run it. It needs Playwright with Chromium.
- **`tools/og-image.html`**, **`tools/og-logo-dark.png`** and **`tools/make-site-images.js`**: the source of the website's share image (`site/og-image.png` on `main`, 1200×630, shown when the site is linked on X, Facebook, Telegram or Slack). `node tools/make-site-images.js <out dir>` renders it; see the comment at the top for the icons that go with it.
- **`tools/fonts/`**: Libre Franklin, Big Shoulders Display and IBM Plex Mono (the website's typefaces), as static instances, under the SIL Open Font License (licence files alongside).

Paper results at the alerted price, not advice. 18+. For free and confidential support call 1800 858 858 or visit gamblinghelponline.org.au.
