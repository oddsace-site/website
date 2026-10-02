# Odds Ace Australia website

The site at [oddsaceaustralia.com](https://oddsaceaustralia.com), hosted on Netlify.

- **`main`**: `site/index.html`, the whole site in one file. Netlify publishes it whenever `main` changes, so `main` only changes when the design or wording does.
- **`data`**: `results.json`, the settled results and price figures. A scheduled task updates it twice a day after the results are settled, and the site loads it in the visitor's browser, so results stay fresh without a new Netlify deploy.

The site is built from the Claude-hosted version of the page (Edit page there, or ask Claude). Don't edit `site/index.html` by hand.
