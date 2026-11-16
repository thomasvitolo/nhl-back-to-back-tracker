const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const html = readFileSync("index.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
assert.match(html, /<title>B2B — NHL Back-To-Back Tracker<\/title>/);
assert.match(html, /<h1>NHL Back-To-Back Tracker<\/h1>/);
assert.doesNotMatch(html, /<header class="top"/);
assert.match(html, /<footer class="foot">[\s\S]*id="status"[\s\S]*<\/footer>/);
assert.doesNotMatch(html, /ICE.?REST|Every second night, mapped by team/);

function createApp(data, ok = true) {
  const elements = new Map();
  const dynamicElements = new Map();
  const requests = [];
  function element() {
    return {
      textContent: "", innerHTML: "", style: {}, value: "all", children: [],
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
      replaceChildren(...children) { this.children = children; },
      append(child) { this.children.push(child); },
      addEventListener(name, callback) { this[name] = callback; },
      contains() { return true; },
    };
  }
  const context = {
    document: {
      getElementById(id) {
        if (dynamicElements.has(id)) return dynamicElements.get(id);
        assert.match(html, new RegExp(`id="${id}"`), `Unknown element: ${id}`);
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
      createTextNode: (text) => ({ textContent: text }),
    },
    console: { error() {} },
    fetch: async (url) => {
      requests.push(url);
      return { ok, status: ok ? 200 : 503, json: async () => data };
    },
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  return { elements, dynamicElements, requests, context };
}

const settled = () => new Promise((resolve) => setImmediate(resolve));
function snapshot() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const date = new Date(now.getFullYear(), now.getMonth(), 2);
  const dateKey = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const game = (id, day, home) => ({
    id,
    gameDate: dateKey(day),
    homeTeam: { abbrev: home, logo: `https://assets.nhle.com/logos/nhl/svg/${home}_light.svg` },
    awayTeam: { abbrev: "NYR", logo: "https://assets.nhle.com/logos/nhl/svg/NYR_light.svg" },
  });
  const yesterday = new Date(date);
  yesterday.setDate(1);
  return {
    updatedAt: now.toISOString(), startDate: `${year}-07-01`, endDate: `${year + 1}-07-01`,
    gameWeek: [{ date: dateKey(date), games: [
      game(1, yesterday, "BOS"), game(2, date, "MTL"),
    ] }],
  };
}

test("reads only same-origin data and renders real schedule back-to-backs", async () => {
  const app = createApp(snapshot());
  await settled();
  assert.deepEqual(app.requests, ["./data/schedule.json"]);
  assert.match(app.elements.get("calendar").innerHTML, /NYR/);
  assert.match(app.elements.get("calendar").innerHTML, /NYR_light\.svg/);
  assert.match(app.elements.get("calendar").innerHTML, /class="game road"/);
  assert.doesNotMatch(app.elements.get("calendar").innerHTML, /b2b-tag|>B2B</);
  assert.doesNotMatch(html, /id="(?:today|filter|total|roadtotal|teamtotal|list|calbtn|listbtn)"/);
});

test("final results distinguish regulation, overtime and shootout losses", async () => {
  const data = snapshot();
  const game = data.gameWeek[0].games[1];
  game.gameState = "OFF";
  game.homeTeam.score = 3;
  game.awayTeam.score = 2;
  game.gameOutcome = { lastPeriodType: "OT" };
  const app = createApp(data);
  await settled();
  assert.match(app.elements.get("calendar").innerHTML, /class="game-result ot-loss"[^>]*>OTL<\/span>/);

  app.context.testGame = game;
  const result = (team) => vm.runInContext(`resultFor({ game: testGame, team: "${team}" })?.label ?? null`, app.context);
  assert.equal(result("NYR"), "OTL");
  assert.equal(result("MTL"), "W");
  game.gameOutcome.lastPeriodType = "SO";
  assert.equal(result("NYR"), "OTL");
  game.gameOutcome.lastPeriodType = "REG";
  assert.equal(result("NYR"), "L");
  game.gameState = "FINAL";
  assert.equal(result("NYR"), "L");
  game.gameState = "LIVE";
  assert.equal(result("NYR"), null);
  game.gameState = "FUT";
  assert.equal(result("MTL"), null);
  game.gameState = "FINAL";
  delete game.gameOutcome;
  assert.equal(result("NYR"), null);
  assert.equal(result("MTL"), "W");
  game.awayTeam.score = 3;
  assert.equal(result("NYR"), null);
  delete game.awayTeam.score;
  assert.equal(result("MTL"), null);
});

test("busy days initially show four teams and can expand and collapse", async () => {
  const data = snapshot();
  const date = data.gameWeek[0].games[1].gameDate;
  const previous = data.gameWeek[0].games[0].gameDate;
  for (const [index, team] of ["AAA", "BBB", "CCC", "DDD"].entries()) {
    data.gameWeek[0].games.push(
      { id: 10 + index * 2, gameDate: previous, homeTeam: { abbrev: `H${index}` }, awayTeam: { abbrev: team } },
      { id: 11 + index * 2, gameDate: date, homeTeam: { abbrev: `X${index}` }, awayTeam: { abbrev: team } },
    );
  }
  const app = createApp(data);
  await settled();
  const calendar = app.elements.get("calendar").innerHTML;
  for (const team of ["AAA", "BBB", "CCC", "DDD"]) {
    assert.match(calendar, new RegExp(`<b>${team}</b>`));
  }
  assert.match(calendar, new RegExp(`<div id="extra-${date}" hidden>.*<b>NYR</b>`));
  assert.match(calendar, /aria-expanded="false"/);
  assert.match(calendar, />View 1 more<\/button>/);

  const extra = { hidden: true };
  app.dynamicElements.set(`extra-${date}`, extra);
  const attributes = { "aria-controls": `extra-${date}`, "aria-expanded": "false" };
  const button = {
    dataset: { count: "1" },
    getAttribute: (name) => attributes[name],
    setAttribute: (name, value) => { attributes[name] = value; },
    textContent: "",
  };
  const event = { target: { closest: () => button } };
  app.elements.get("calendar").click(event);
  assert.equal(extra.hidden, false);
  assert.equal(attributes["aria-expanded"], "true");
  assert.equal(button.textContent, "Show less");
  app.elements.get("calendar").click(event);
  assert.equal(extra.hidden, true);
  assert.equal(attributes["aria-expanded"], "false");
  assert.equal(button.textContent, "View 1 more");
});

test("calendar displays only the selected month's dates with weekday alignment", async () => {
  const app = createApp(snapshot());
  await settled();
  for (const [year, month, dayCount, leading] of [
    [2026, 1, 28, 0],
    [2024, 1, 29, 4],
    [2026, 7, 31, 6],
  ]) {
    vm.runInContext(`cursor = new Date(${year}, ${month}, 1); renderCalendar(monthDays());`, app.context);
    const calendar = app.elements.get("calendar").innerHTML;
    const dates = [...calendar.matchAll(/class="date"><span>(\d+)<\/span>/g)].map((match) => Number(match[1]));
    assert.deepEqual(dates, Array.from({ length: dayCount }, (_, index) => index + 1));
    const beforeFirstDate = calendar.split('class="date"')[0];
    assert.equal((beforeFirstDate.match(/class="day empty-day"/g) || []).length, leading);
    assert.doesNotMatch(calendar, /class="day outside/);
  }
});

test("API publication failure remains visible in the calendar", async () => {
  const app = createApp(null, false);
  await settled();
  assert.match(app.elements.get("calendar").innerHTML, /503/);
  assert.doesNotMatch(app.elements.get("calendar").innerHTML, /No second-night/);
});

test("unsupported months and old snapshots are explicitly reported", async () => {
  const data = snapshot();
  data.updatedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const app = createApp(data);
  await settled();
  assert.match(app.elements.get("status").children.map((child) => child.textContent).join(""), /OUTDATED/);
  vm.runInContext('cursor = new Date(2000, 0, 1); loadAround();', app.context);
  await settled();
  assert.match(app.elements.get("calendar").innerHTML, /Schedule available from/);
});
