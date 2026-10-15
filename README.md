# CounterBuild

Item builds for Deadlock that counter the enemy team, with the reasons behind every item.

Pick your hero, pick the enemy team, and CounterBuild suggests a lane, early, mid and late
game build. Every item explains what it does, how to use it, when players usually buy it,
and which enemy heroes it counters. Click a card to flip it and see the item's full stats,
or click an optional swap to replace it.

**Live site:** https://counterbuild.github.io/

**Status:** beta. Feedback on wrong or weak advice is very welcome: use the Feedback button on the site
(emailed to the maintainer, no account needed) or open an issue here.

## How it works

- `site/` is the whole website: plain HTML, CSS and JavaScript with no build step.
  - `engine.js` scores items and picks the build.
  - `knowledge.js` and `tips.js` hold the hand-written rules, counters and tips.
  - `data.js` is generated hero and item data (names, pictures, stats, popular items).
- Win rates per matchup are fetched live in the browser from
  [deadlock-api.com](https://deadlock-api.com).

## Run it locally

```bash
python tools/serve.py 8123
```

Then open http://localhost:8123.

## Update after a game patch

```bash
python tools/update_data.py
```

This downloads the latest heroes and items from deadlock-api.com and rebuilds `site/data.js`.

## Hosting

The site is hosted on GitHub Pages. Every push to `main` publishes the `site/` folder
automatically (see `.github/workflows/pages.yml`).

---

CounterBuild is a fan-made tool and is not affiliated with or endorsed by Valve.
Deadlock and its game assets are trademarks of Valve Corporation.
