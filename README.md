# NHL Back-to-Back Tracker

See NHL teams playing the second game of a back-to-back all in one place.

The static website reads the current schedule from the NHL's public schedule API and runs on GitHub Pages. Game times are displayed in the visitor's local timezone.

## Local preview

Open `index.html` in a browser. The schedule requires an internet connection and access to the NHL API.

## Deployment

The GitHub Actions workflow deploys the site to GitHub Pages whenever changes are pushed to `main`. Enable **Settings → Pages → Build and deployment → Source: GitHub Actions** if Pages is not already enabled.
