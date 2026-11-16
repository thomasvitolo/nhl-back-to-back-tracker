# NHL Back-to-Back Tracker

See NHL teams playing the second game of a back-to-back all in one place.

GitHub Actions downloads the current NHL season schedule server-side and publishes it alongside the website. The browser reads `data/schedule.json` from GitHub Pages, avoiding the NHL API's cross-origin (CORS) restriction. No proxy service or API key is required.

The schedule refreshes on deployment and every six hours (scheduled runs can be delayed by GitHub). The page shows its last update time and warns when the data is over 24 hours old. Navigation covers July through June of the current season; unsupported months display an explicit message. No sample data is used.

## Local preview

Run `python3 scripts/fetch_schedule.py`, copy `index.html` and `favicon.svg` into `_site/`, then run `python3 -m http.server --directory _site 8000`. Open `http://localhost:8000`. Generating the snapshot requires access to the NHL API; viewing it does not.

## Deployment

The GitHub Actions workflow deploys the site whenever changes are pushed to `main`, on the refresh schedule, or through **Run workflow**. If the NHL download fails, deployment stops and the previous site and schedule remain available. For the initial setup, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
