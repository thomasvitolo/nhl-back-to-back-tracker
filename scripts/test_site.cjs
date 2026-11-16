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
  const dateKey = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const game = (id, day, home, venue, score, state = "FINAL") => ({
    id,
    gameDate: dateKey(day),
    gameState: state,
    venue: { default: venue },
    homeTeam: { abbrev: home, score, logo: `https://assets.nhle.com/logos/nhl/svg/${home}_light.svg` },
    awayTeam: { abbrev: "NYR", score: score + 1, logo: "https://assets.nhle.com/logos/nhl/svg/NYR_light.svg" },
  });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(today.getDate() - 2);
  return {
    updatedAt: now.toISOString(), startDate: `${year}-07-01`, endDate: `${year + 1}-07-01`,
    gameWeek: [
      { date: dateKey(twoDaysAgo), games: [game(1, twoDaysAgo, "BOS", "Previous Arena", 2)] },
      { date: dateKey(yesterday), games: [game(2, yesterday, "MTL", "Yesterday Arena", 3)] },
      { date: dateKey(today), games: [game(3, today, "OTT", "Today's Arena", 4)] },
    ],
    yesterday: dateKey(yesterday),
  };
}

test("daily view renders today's B2B scorecards and calendar opens historical dates", async () => {
  const data = snapshot();
  const app = createApp(data);
  await settled();
  assert.deepEqual(app.requests, ["./data/schedule.json"]);
  assert.equal(app.elements.get("daily").style.display, "block");
  assert.match(app.elements.get("daily").innerHTML, /Today&#39;s Arena/);
  assert.match(app.elements.get("daily").innerHTML, /NYR_light\.svg/);
  assert.match(app.elements.get("daily").innerHTML, /class="score-number">5/);
  assert.match(app.elements.get("daily").innerHTML, /class="score-team on-b2b"/);
  assert.doesNotMatch(app.elements.get("daily").innerHTML, />B2B</);

  app.elements.get("calbtn").click();
  assert.equal(app.elements.get("calendar").style.display, "block");
  app.elements.get("calendar").click({
    target: { closest: () => ({ dataset: { date: data.yesterday } }) },
  });
  assert.equal(app.elements.get("daily").style.display, "block");
  assert.match(app.elements.get("daily").innerHTML, /Yesterday Arena/);
  assert.match(app.elements.get("daily").innerHTML, /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
});

test("schedule publication failure remains visible in daily and calendar views", async () => {
  const app = createApp(null, false);
  await settled();
  assert.match(app.elements.get("daily").innerHTML, /503/);
  app.elements.get("calbtn").click();
  assert.match(app.elements.get("calendar").innerHTML, /503/);
});

test("unsupported months and old snapshots are explicitly reported", async () => {
  const data = snapshot();
  data.updatedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const app = createApp(data);
  await settled();
  assert.match(app.elements.get("status").children.map((child) => child.textContent).join(""), /OUTDATED/);
  vm.runInContext('cursor = new Date(2000, 0, 1); loadAround();', app.context);
  await settled();
  assert.match(app.elements.get("daily").innerHTML, /Schedule available from/);
});
