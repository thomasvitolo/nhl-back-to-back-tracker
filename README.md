# NHL Back-to-Back Tracker

See NHL teams playing the second game of a back-to-back all in one place.

The self-contained page includes an interactive sample preview and can switch to the live NHL schedule from the public schedule API.

## Local preview

Open `index.html` in a browser. Click **Switch to live schedule** to load the NHL schedule; this requires an internet connection and access to the NHL API.

## Deployment

The GitHub Actions workflow deploys the site whenever changes are pushed to `main`. For the initial setup, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**, then rerun the deployment workflow.
