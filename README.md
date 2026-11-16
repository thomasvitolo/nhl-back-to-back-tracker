# NHL Back-to-Back Tracker

See NHL teams playing the second game of a back-to-back all in one place.

The static website reads the current schedule from the NHL's public schedule API and runs on GitHub Pages. Game times are displayed in the visitor's local timezone.

## Local preview

Open `index.html` in a browser. The schedule requires an internet connection and access to the NHL API.

## Deployment

The GitHub Actions workflow deploys the site whenever changes are pushed to `main`. For the initial setup, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**, then rerun the deployment workflow.
