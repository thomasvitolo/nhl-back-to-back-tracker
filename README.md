# NHL Back-to-Back Tracker

See NHL teams playing the second game of a back-to-back all in one place.

The self-contained page loads its schedule from the NHL public API. Month navigation, venue filters, and calendar/list views all use live schedule data.

## Local preview

Open `index.html` in a browser. Loading the schedule requires an internet connection and access to the NHL API.

## Deployment

The GitHub Actions workflow deploys the site whenever changes are pushed to `main`. For the initial setup, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**, then rerun the deployment workflow.
