const API = "https://api-web.nhle.com/v1/schedule/";
const schedule = new Map();
const backToBack = new Map();
const $ = (id) => document.getElementById(id);

let cursor = new Date();
cursor.setDate(1);
let view = "calendar";
let requestId = 0;

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function nextDate(value) {
  return dateKey(addDays(parseDate(value), 1));
}

function monthDays() {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function setStatus(message, state = "ready") {
  const status = $("status");
  status.classList.toggle("is-error", state === "error");
  status.replaceChildren();

  if (state === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    status.append(spinner);
  }

  status.append(document.createTextNode(message));
}

function setView(nextView) {
  view = nextView;
  $("calbtn").classList.toggle("active", view === "calendar");
  $("listbtn").classList.toggle("active", view === "list");
  $("calbtn").setAttribute("aria-pressed", String(view === "calendar"));
  $("listbtn").setAttribute("aria-pressed", String(view === "list"));
  render();
}

function setLoading() {
  const message = document.createElement("div");
  message.className = "loading-state";
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  spinner.setAttribute("aria-hidden", "true");
  message.append(spinner, document.createTextNode("Loading this month's NHL schedule…"));

  $("calendar").replaceChildren(message.cloneNode(true));
  $("list").replaceChildren(message);
  $("calendar").style.display = view === "calendar" ? "block" : "none";
  $("list").style.display = view === "list" ? "block" : "none";
}

async function loadMonth() {
  const currentRequest = ++requestId;
  schedule.clear();
  backToBack.clear();
  setStatus("LOADING NHL SCHEDULE", "loading");
  setLoading();

  const days = monthDays();
  const firstDate = addDays(days[0], -1);
  const weekStarts = new Set(
    [firstDate, ...days].map((date) => dateKey(mondayOf(date))),
  );

  try {
    const responses = await Promise.all(
      [...weekStarts].map(async (weekStart) => {
        const response = await fetch(`${API}${weekStart}`);
        if (!response.ok) throw new Error(`The NHL schedule returned ${response.status}.`);
        const data = await response.json();
        if (!Array.isArray(data.gameWeek)) throw new Error("The NHL schedule response was incomplete.");
        return data.gameWeek;
      }),
    );

    if (currentRequest !== requestId) return;

    const seenGames = new Set();
    for (const weeks of responses) {
      for (const week of weeks) {
        for (const game of week.games || []) {
          const date = game.gameDate || week.date;
          if (!date || !game.homeTeam?.abbrev || !game.awayTeam?.abbrev) continue;

          const identity = game.id ?? `${date}-${game.awayTeam.abbrev}-${game.homeTeam.abbrev}`;
          if (seenGames.has(identity)) continue;
          seenGames.add(identity);

          const dayGames = schedule.get(date) || [];
          dayGames.push({ ...game, date });
          schedule.set(date, dayGames);
        }
      }
    }

    buildBackToBack();
    render();
    const firstOfMonth = dateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    const nextMonth = dateKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    const gameCount = [...schedule.entries()]
      .filter(([date]) => date >= firstOfMonth && date < nextMonth)
      .reduce((count, [, games]) => count + games.length, 0);
    setStatus(`SCHEDULE UPDATED · ${gameCount} GAMES THIS MONTH`);
  } catch (error) {
    if (currentRequest !== requestId) return;
    schedule.clear();
    backToBack.clear();
    render();
    setStatus("SCHEDULE UNAVAILABLE · TRY ANOTHER MONTH OR RELOAD", "error");
    console.error("Unable to load NHL schedule:", error);
  }
}

function buildBackToBack() {
  backToBack.clear();
  const previousByTeam = new Map();
  const dates = [...schedule.keys()].sort();

  for (const date of dates) {
    const games = schedule.get(date).slice().sort((a, b) => {
      const timeOrder = (a.startTimeUTC || "").localeCompare(b.startTimeUTC || "");
      return timeOrder || String(a.id || "").localeCompare(String(b.id || ""));
    });

    for (const game of games) {
      if (game.gameState === "PPD" || game.gameState === "CANC") continue;
      const home = game.homeTeam.abbrev;
      const away = game.awayTeam.abbrev;

      for (const [team, venue, opponent] of [
        [home, "HOME", away],
        [away, "AWAY", home],
      ]) {
        const previous = previousByTeam.get(team);
        if (previous && nextDate(previous.date) === date) {
          const rows = backToBack.get(date) || [];
          rows.push({
            date,
            team,
            venue,
            opponent,
            previousVenue: previous.venue,
            game,
          });
          backToBack.set(date, rows);
        }
        previousByTeam.set(team, { date, venue });
      }
    }
  }
}

function isRoadToRoad(row) {
  return row.venue === "AWAY" && row.previousVenue === "AWAY";
}

function rowsFor(date) {
  const rows = backToBack.get(dateKey(date)) || [];
  const filter = $("filter").value;
  return rows
    .filter((row) => {
      if (filter === "road") return isRoadToRoad(row);
      if (filter === "home") return !isRoadToRoad(row);
      return true;
    })
    .sort((a, b) => a.team.localeCompare(b.team));
}

function createGameChip(row) {
  const chip = document.createElement("div");
  chip.className = `game${isRoadToRoad(row) ? " road" : ""}`;
  chip.title = `${row.team}: ${row.previousVenue} → ${row.venue}`;

  const team = document.createElement("b");
  team.textContent = row.team;
  const matchup = document.createElement("span");
  matchup.textContent = `${row.venue === "AWAY" ? "@" : "vs"} ${row.opponent}`;
  chip.append(team, matchup);
  return chip;
}

function renderCalendar(days) {
  const calendar = $("calendar");
  const weekdayRow = document.createElement("div");
  weekdayRow.className = "weekdays";
  for (const weekday of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    const label = document.createElement("div");
    label.className = "weekday";
    label.textContent = weekday;
    weekdayRow.append(label);
  }

  const grid = document.createElement("div");
  grid.className = "grid";
  const today = dateKey(new Date());
  for (const date of days) {
    const day = document.createElement("div");
    const key = dateKey(date);
    day.className = "day";
    if (date.getMonth() !== cursor.getMonth()) day.classList.add("outside");
    if (key === today) day.classList.add("today");

    const dateLabel = document.createElement("div");
    dateLabel.className = "date";
    const number = document.createElement("span");
    number.textContent = String(date.getDate());
    dateLabel.append(number);
    if (key === today) {
      const todayTag = document.createElement("span");
      todayTag.className = "todaytag";
      todayTag.textContent = "TODAY";
      dateLabel.append(todayTag);
    }
    day.append(dateLabel);

    const rows = rowsFor(date);
    for (const row of rows.slice(0, 4)) day.append(createGameChip(row));
    if (rows.length > 4) {
      const more = document.createElement("div");
      more.className = "more";
      more.textContent = `+${rows.length - 4} more`;
      day.append(more);
    }
    grid.append(day);
  }

  calendar.replaceChildren(weekdayRow, grid);
}

function createListEntry(row) {
  const entry = document.createElement("article");
  entry.className = "game-row";

  const venueChange = document.createElement("div");
  venueChange.className = "away";
  venueChange.append(
    document.createTextNode(row.previousVenue),
    document.createElement("br"),
    document.createTextNode(`↓ ${row.venue}`),
  );

  const details = document.createElement("div");
  const teams = document.createElement("div");
  teams.className = "teams";
  teams.textContent = `${row.team} ${row.venue === "AWAY" ? "@" : "vs"} ${row.opponent}`;
  const venue = document.createElement("div");
  venue.className = "venue";
  venue.textContent = `${row.game.venue?.default || "NHL venue"} · second game in as many days`;
  details.append(teams, venue);

  const badge = document.createElement("span");
  badge.className = `badge${isRoadToRoad(row) ? " road" : ""}`;
  badge.textContent = isRoadToRoad(row) ? "ROAD → ROAD" : "BACK-TO-BACK";
  entry.append(venueChange, details, badge);
  return entry;
}

function renderList(days) {
  const list = $("list");
  const monthDates = days.filter((date) => date.getMonth() === cursor.getMonth());
  const activeDates = monthDates.filter((date) => rowsFor(date).length);

  if (!activeDates.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No second-night games match this view.";
    list.replaceChildren(empty);
    return;
  }

  const groups = activeDates.map((date) => {
    const group = document.createElement("section");
    group.className = "listday";
    const heading = document.createElement("h3");
    heading.className = "listhead";
    heading.textContent = date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    group.append(heading);
    for (const row of rowsFor(date)) group.append(createListEntry(row));
    return group;
  });
  list.replaceChildren(...groups);
}

function render() {
  const days = monthDays();
  $("month").textContent = cursor.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  renderCalendar(days);
  renderList(days);

  const monthDates = days.filter((date) => date.getMonth() === cursor.getMonth());
  const monthRows = monthDates.flatMap(rowsFor);
  $("total").textContent = String(monthRows.length);
  $("roadtotal").textContent = String(monthRows.filter(isRoadToRoad).length);
  $("teamtotal").textContent = String(new Set(monthRows.map((row) => row.team)).size);
  $("calendar").style.display = view === "calendar" ? "block" : "none";
  $("list").style.display = view === "list" ? "block" : "none";
}

$("prev").addEventListener("click", () => {
  cursor.setMonth(cursor.getMonth() - 1);
  loadMonth();
});

$("next").addEventListener("click", () => {
  cursor.setMonth(cursor.getMonth() + 1);
  loadMonth();
});

$("today").addEventListener("click", () => {
  cursor = new Date();
  cursor.setDate(1);
  loadMonth();
});

$("filter").addEventListener("change", render);
$("calbtn").addEventListener("click", () => setView("calendar"));
$("listbtn").addEventListener("click", () => setView("list"));

loadMonth();
