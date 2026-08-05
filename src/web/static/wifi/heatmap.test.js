import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHeatmapGrid, rssiToColor, findRoomIdAt, buildSuggestion } from "./heatmap.js";
import { runSimulation } from "./engine.js";

test("rssiToColor: 範囲の両端は仕様のカラースケール通り", () => {
  assert.equal(rssiToColor(-90), "#0c1826");
  assert.equal(rssiToColor(-42), "#fff6d6");
  assert.equal(rssiToColor(-66), "#2fa189");
});

test("rssiToColor: 範囲外はクランプされる", () => {
  assert.equal(rssiToColor(-120), rssiToColor(-90));
  assert.equal(rssiToColor(0), rssiToColor(-42));
});

test("findRoomIdAt: 部屋の内側/外側の判定", () => {
  const rooms = [
    { id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 6, height: 5 },
    { id: "r2", name: "寝室", type: "bedroom", x: 6, y: 0, width: 4, height: 5 },
  ];
  assert.equal(findRoomIdAt(rooms, { x: 1, y: 1 }), "r1");
  assert.equal(findRoomIdAt(rooms, { x: 8, y: 1 }), "r2");
  assert.equal(findRoomIdAt(rooms, { x: 20, y: 20 }), null);
});

test("buildHeatmapGrid: 部屋の外側にはセルを生成しない", () => {
  const rooms = [{ id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 4, height: 4 }];
  const roomLayout = {
    rooms,
    walls: [],
    router: { x: 2, y: 2 },
    repeater: null,
    environment: { router_gen: "wifi6", plan: "giga10", band: "b5", people: 1, uses: [] },
  };
  // 部屋(4x4)を覆う境界(computeBoundsはroomsのbboxそのもの)なので全セルが部屋内になる
  const grid = buildHeatmapGrid(roomLayout, { cols: 4, rows: 4, reflections: false });
  assert.equal(grid.cells.length, 16);
  for (const cell of grid.cells) {
    assert.equal(cell.room_id, "r1");
    assert.match(cell.color, /^#[0-9a-f]{6}$/);
  }
});

test("buildSuggestion: 全て足りている条件ではsufficientを返す", () => {
  const rooms = [{ id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 4, height: 4 }];
  const roomLayout = {
    rooms,
    walls: [],
    router: { x: 2, y: 2 },
    repeater: null,
    environment: { router_gen: "wifi6", plan: "giga10", band: "b5", people: 1, uses: [] },
  };
  const sim = runSimulation(roomLayout);
  const suggestion = buildSuggestion(roomLayout, sim);
  assert.equal(suggestion.kind, "sufficient");
  assert.equal(suggestion.is_free, true);
  assert.equal(suggestion.monthly_cost_yen, null);
});

test("buildSuggestion: ルーター世代がボトルネックならupgrade_routerを返す", () => {
  const rooms = [{ id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 2, height: 2 }];
  const roomLayout = {
    rooms,
    walls: [],
    router: { x: 1, y: 1 },
    repeater: null,
    environment: { router_gen: "wifi4", plan: "giga10", band: "b5", people: 5, uses: ["video", "game"] },
  };
  const sim = runSimulation(roomLayout);
  const suggestion = buildSuggestion(roomLayout, sim);
  assert.equal(suggestion.kind, "upgrade_router");
  assert.equal(suggestion.monthly_cost_yen, 330);
});

test("buildSuggestion: 電波がボトルネックで親機移動により解決する場合はmove_routerを返す", () => {
  const rooms = [
    { id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 6, height: 5 },
    { id: "r2", name: "寝室", type: "bedroom", x: 6, y: 0, width: 4, height: 5 },
  ];
  const walls = [{ x1: 6, y1: 0, x2: 6, y2: 5, material: "wood" }];
  const roomLayout = {
    rooms,
    walls,
    router: { x: 0.3, y: 0.3 },
    repeater: null,
    environment: {
      router_gen: "wifi6",
      plan: "giga10",
      band: "b5",
      people: 8,
      uses: ["video", "meeting", "game", "work"],
    },
  };
  const sim = runSimulation(roomLayout);
  assert.equal(sim.bottleneck, "radio");
  const suggestion = buildSuggestion(roomLayout, sim);
  assert.equal(suggestion.kind, "move_router");
  assert.equal(suggestion.is_free, true);
  assert.ok(suggestion.after_rssi_dbm > suggestion.before_rssi_dbm);
});

test("buildSuggestion: 電波が全く届かない部屋があるとonsite_supportを返す", () => {
  const rooms = [
    { id: "r1", name: "A", type: "ldk", x: 0, y: 0, width: 4, height: 4 },
    { id: "r2", name: "B", type: "bedroom", x: 4, y: 0, width: 4, height: 4 },
    { id: "r3", name: "C", type: "bedroom", x: 8, y: 0, width: 4, height: 4 },
  ];
  const walls = [
    { x1: 4, y1: 0, x2: 4, y2: 4, material: "concrete" },
    { x1: 8, y1: 0, x2: 8, y2: 4, material: "concrete" },
  ];
  const roomLayout = {
    rooms,
    walls,
    router: { x: 1, y: 1 },
    repeater: null,
    environment: {
      router_gen: "wifi6",
      plan: "giga10",
      band: "b5",
      people: 8,
      uses: ["video", "meeting", "game", "work"],
    },
  };
  const sim = runSimulation(roomLayout);
  assert.equal(sim.bottleneck, "radio");
  const suggestion = buildSuggestion(roomLayout, sim);
  assert.equal(suggestion.kind, "onsite_support");
  assert.equal(suggestion.after_rssi_dbm, null);
  assert.equal(suggestion.target_position, null);
});
