const scheduleContainer = document.querySelector("#schedule");
const statusMessage = document.querySelector("#status");
const refreshButton = document.querySelector("#refresh");

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function nextDate(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function localDateString(date) {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function teamName(team) {
  return team?.commonName?.default || team?.placeName?.default || team?.abbrev || "NHL team";
}

function createTeamRow(team) {
  const row = document.createElement("div");
  row.className = "team-row";

  if (team.logo) {
    const logo = document.createElement("img");
    logo.src = team.logo;
    logo.alt = "";
    logo.loading = "lazy";
    row.append(logo);
  }

  const abbreviation = document.createElement("span");
  abbreviation.className = "team-abbrev";
  abbreviation.textContent = team.abbrev || "NHL";
  row.append(abbreviation);

  const name = document.createElement("span");
  name.textContent = teamName(team);
  row.append(name);
  return row;
}

function createGameCard(game) {
  const card = document.createElement("article");
  card.className = "game-card";

  const date = document.createElement("div");
  date.className = "game-date";
  date.textContent = dateFormatter.format(new Date(`${game.date}T12:00:00`));

  const time = document.createElement("span");
  time.textContent = game.startTimeUTC
    ? timeFormatter.format(new Date(game.startTimeUTC))
    : "Time TBD";
  date.append(time);

  const matchup = document.createElement("div");
  matchup.className = "matchup";
  matchup.append(createTeamRow(game.awayTeam), createTeamRow(game.homeTeam));

  const badges = document.createElement("div");
  badges.className = "team-badges";
  for (const team of game.backToBackTeams) {
    const badge = document.createElement("span");
    badge.className = "b2b-badge";
    badge.textContent = `${team.abbrev || teamName(team)} on B2B`;
    badges.append(badge);
  }

  card.append(date, matchup, badges);
  return card;
}

function findUpcomingBackToBacks(schedule, today) {
  const gamesByTeam = new Map();
  const games = [];

  for (const week of schedule.gameWeek || []) {
    for (const game of week.games || []) {
      const date = game.gameDate || week.date;
      if (!date || !game.homeTeam || !game.awayTeam) continue;

      const entry = { ...game, date };
      games.push(entry);

      for (const team of [game.homeTeam, game.awayTeam]) {
        const key = team.id ?? team.abbrev;
        if (key == null) continue;
        const teamGames = gamesByTeam.get(key) || [];
        teamGames.push({ date, game: entry, team });
        gamesByTeam.set(key, teamGames);
      }
    }
  }

  const secondGameTeams = new Map();
  for (const teamGames of gamesByTeam.values()) {
    teamGames.sort((a, b) => a.date.localeCompare(b.date));
    for (let index = 1; index < teamGames.length; index += 1) {
      const previous = teamGames[index - 1];
      const current = teamGames[index];
      if (nextDate(previous.date) !== current.date || current.date < today) continue;

      const teams = secondGameTeams.get(current.game) || [];
      teams.push(current.team);
      secondGameTeams.set(current.game, teams);
    }
  }

  return games
    .filter((game) => secondGameTeams.has(game) && game.gameState !== "PPD" && game.gameState !== "CANC")
    .map((game) => ({ ...game, backToBackTeams: secondGameTeams.get(game) }))
    .sort((a, b) => {
      const dateOrder = a.date.localeCompare(b.date);
      return dateOrder || (a.startTimeUTC || "").localeCompare(b.startTimeUTC || "");
    });
}

async function loadSchedule() {
  statusMessage.classList.remove("is-error");
  statusMessage.replaceChildren(
    Object.assign(document.createElement("span"), { className: "loading-spinner", ariaHidden: "true" }),
    document.createTextNode("Loading the NHL schedule…"),
  );
  scheduleContainer.replaceChildren();

  try {
    const response = await fetch("https://api-web.nhle.com/v1/schedule/now");
    if (!response.ok) throw new Error(`The NHL schedule returned ${response.status}.`);
    const schedule = await response.json();
    if (!Array.isArray(schedule.gameWeek)) throw new Error("The NHL schedule response was incomplete.");
    const today = localDateString(new Date());
    const upcoming = findUpcomingBackToBacks(schedule, today);

    if (upcoming.length) {
      scheduleContainer.append(...upcoming.map(createGameCard));
      statusMessage.textContent = `${upcoming.length} upcoming ${upcoming.length === 1 ? "game" : "games"} with a team on the second night.`;
    } else {
      statusMessage.textContent = "No upcoming back-to-backs found in the current NHL schedule.";
    }
  } catch (error) {
    statusMessage.classList.add("is-error");
    statusMessage.textContent = "Could not load the NHL schedule. Check your connection and try again.";
    console.error("Unable to load NHL schedule:", error);
  }
}

refreshButton.addEventListener("click", loadSchedule);
loadSchedule();
