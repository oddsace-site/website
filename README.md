# Odds Ace Australia: records

This branch keeps dated records of what Odds Ace Australia publishes, for the federal wagering advertising rules that start on 1 January 2027. Keep every record for at least 12 months; don't delete or rewrite anything here. Netlify never builds this branch and the website doesn't use it.

## The website: `records/website/<Sydney date>/`

A copy of the public website, oddsaceaustralia.com, as it stood on that date. The "Odds Ace monthly records" scheduled task makes one on the 1st of each month; the first two were made on 6 October 2026 (before the 18+ and independence wording went live) and 7 October 2026 (after).

- `home.pdf`, `terms.pdf`, `privacy.pdf`, `responsible-gambling.pdf`, `about.pdf`, `compare.pdf`, `after-you-join.pdf`, `why-aussie-odds-lag.pdf`: every page, printed at desktop width with the site's own fonts and its live results.
- `home-phone.png`: the home page's first screen on a phone.
- `versions.txt`: every version of the website published since the previous copy, with its Sydney time and git commit. The exact files of any version are on the `main` branch: `https://github.com/oddsace-site/website/tree/<commit>/site`.
- `manifest.json`: when the copy was made, from which commit, and checksums of the page and the results data.

Made by `tools/make-records.js` on the `reports` branch, from a local copy of the site (nothing is fetched from the internet).

## Telegram posts

The members' channels are private, so their posts aren't kept in this public repository. Every post the Odds Ace Telegram relay sends, in every channel, is written as it goes out to the Google Sheet "Odds Ace post archive" in the owner's Google Drive (from relay version 3.6): Telegram's time and message number, the channel, the bookmakers named, any links, and the exact text. The Edge Tracker also keeps each alert's post text and time, and each results-channel post.

## Bookmakers

Odds Ace is an independent wagering-market analytics service, not a bookmaker. It doesn't accept or place bets, act for any bookmaker, or take commissions, referral fees, sponsorship or any other payment from bookmakers, and it doesn't publish bookmaker advertising or affiliate links. Bookmaker prices are shown for market comparison and analysis. If that ever changes, the arrangement will be recorded here with its dates.

18+ only. For free and confidential support call 1800 858 858 or visit gamblinghelponline.org.au.
