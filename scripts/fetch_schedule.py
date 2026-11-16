import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen


def fetch_week(day):
    url = f"https://api-web.nhle.com/v1/schedule/{day.isoformat()}"
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "NHL-Back-to-Back-Tracker/1.0"})
            with urlopen(request, timeout=45) as response:
                data = json.load(response)
            if not isinstance(data.get("gameWeek"), list):
                raise ValueError(f"Invalid NHL schedule response for {day}")
            return data["gameWeek"]
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def build_snapshot(today):
    season_year = today.year if today.month >= 7 else today.year - 1
    start = date(season_year, 7, 1)
    end = date(season_year + 1, 7, 1)
    # Include the calendar's adjacent dates and the preceding night.
    first = start - timedelta(days=7)
    last = end + timedelta(days=42)
    weeks = [first + timedelta(days=offset)
             for offset in range(0, (last - first).days + 1, 7)]
    days = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        for week in executor.map(fetch_week, weeks):
            for entry in week:
                day = entry["date"]
                date.fromisoformat(day)
                games = days.setdefault(day, {})
                for game in entry.get("games", []):
                    if not game.get("homeTeam", {}).get("abbrev") or not game.get("awayTeam", {}).get("abbrev"):
                        raise ValueError(f"Missing team in NHL game on {day}")
                    games[game["id"]] = {
                        key: game[key]
                        for key in ("id", "gameDate", "gameState", "startTimeUTC", "homeTeam", "awayTeam", "venue", "gameOutcome")
                        if key in game
                    }

    if not any(days.values()):
        raise ValueError("NHL returned no games; refusing to publish an empty schedule")

    return {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "gameWeek": [
            {"date": day, "games": list(games.values())}
            for day, games in sorted(days.items())
        ],
    }


if __name__ == "__main__":
    snapshot = build_snapshot(datetime.now(timezone.utc).date())
    output = Path("_site/data/schedule.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, separators=(",", ":")), encoding="utf-8")
    print(f"Published {sum(len(day['games']) for day in snapshot['gameWeek'])} games")
