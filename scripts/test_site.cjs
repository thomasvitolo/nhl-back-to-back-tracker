const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const html = readFileSync("index.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
assert.match(html, /<title>B2B — NHL Back-To-Back Tracker<\/title>/);
assert.match(html, /class="brand-name">B2B/);
assert.match(html, /<h1>NHL Back-To-Back Tracker<\/h1>/);
assert.doesNotMatch(html, /ICE.?REST|Every second night, mapped by team/);

function createApp(data, ok = true) {
  const elements = new Map();
  const requests = [];
  function element() {
    return {
      textContent: "", innerHTML: "", style: {}, value: "all", children: [],
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
      replaceChildren(...children) { this.children = children; },
      append(child) { this.children.push(child); },
      addEventListener(name, callback) { this[name] = callback; },
    };
  }
  const context = {
    document: {
      getElementById(id) {
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
  return { elements, requests, context };
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

test("calendar shows all teams on busy days", async () => {
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
  for (const team of ["NYR", "AAA", "BBB", "CCC", "DDD"]) {
    assert.match(calendar, new RegExp(`<b>${team}</b>`));
  }
  assert.doesNotMatch(calendar, /\+\d+ more/);
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
