const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

const script = readFileSync("index.html", "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];

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
  assert.equal(app.elements.get("total").textContent, "1");
  assert.equal(app.elements.get("roadtotal").textContent, "1");
  assert.match(app.elements.get("calendar").innerHTML, /NYR/);
  assert.match(app.elements.get("calendar").innerHTML, /NYR_light\.svg/);
  assert.doesNotMatch(app.elements.get("calendar").innerHTML, /b2b-tag|>B2B</);
  app.elements.get("listbtn").click();
  assert.equal(app.elements.get("list").style.display, "block");
  assert.match(app.elements.get("list").innerHTML, /NYR_light\.svg/);
  assert.doesNotMatch(app.elements.get("list").innerHTML, /b2b-tag|ON BACK-TO-BACK/);
});

test("API publication failure remains an error after filtering or switching views", async () => {
  const app = createApp(null, false);
  await settled();
  app.elements.get("filter").change();
  app.elements.get("listbtn").click();
  assert.equal(app.elements.get("total").textContent, "—");
  assert.match(app.elements.get("list").innerHTML, /503/);
  assert.doesNotMatch(app.elements.get("list").innerHTML, /No second-night/);
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
  assert.equal(app.elements.get("total").textContent, "—");
});
