import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateRssiAt,
  rssiToThroughput,
  rssiToLevel,
  evaluateRooms,
  calculateRequiredBandwidth,
  findOptimalPosition,
  runSimulation,
} from "./engine.js";

test("calculateRssiAt: 間仕切り1枚で約4.5dB下がる(5GHz)", () => {
  const router = { x: 1, y: 2.5 };
  const point = { x: 8, y: 2.5 };
  const noWall = calculateRssiAt(point, [], router, null, "b5", { reflections: false });
  const withWall = calculateRssiAt(
    point,
    [{ x1: 6, y1: 0, x2: 6, y2: 5, material: "wood" }],
    router,
    null,
    "b5",
    { reflections: false }
  );
  assert.ok(Math.abs(noWall - withWall - 4.5) < 0.01);
});

test("calculateRssiAt: 反射が成立する配置では反射OFFより強くなる", () => {
  const walls = [{ x1: 10, y1: 0, x2: 10, y2: 5, material: "concrete" }];
  const router = { x: 2, y: 2.5 };
  const point = { x: 4, y: 2.5 };
  const noRefl = calculateRssiAt(point, walls, router, null, "b5", { reflections: false });
  const withRefl = calculateRssiAt(point, walls, router, null, "b5", { reflections: true });
  assert.ok(withRefl > noRefl);
});

test("calculateRssiAt: 反射が成立しない配置(壁の裏側)では反射OFFと同値", () => {
  const walls = [{ x1: 6, y1: 0, x2: 6, y2: 5, material: "wood" }];
  const router = { x: 1, y: 2.5 };
  const behindWall = { x: 8, y: 2.5 };
  const noRefl = calculateRssiAt(behindWall, walls, router, null, "b5", { reflections: false });
  const withRefl = calculateRssiAt(behindWall, walls, router, null, "b5", { reflections: true });
  assert.equal(noRefl, withRefl);
});

test("calculateRssiAt: ドア開口を通る経路は壁の減衰を受けない", () => {
  const wallNoDoor = { x1: 6, y1: 0, x2: 6, y2: 5, material: "wood" };
  const wallWithDoor = { ...wallNoDoor, door: { start: 2, end: 3 } };
  const router = { x: 1, y: 2.5 };
  const point = { x: 8, y: 2.5 }; // wallを(6,2.5)で通過。ドア区間(2m~3m)に含まれる
  const noDoor = calculateRssiAt(point, [wallNoDoor], router, null, "b5", { reflections: false });
  const withDoor = calculateRssiAt(point, [wallWithDoor], router, null, "b5", { reflections: false });
  assert.ok(withDoor > noDoor);
});

test("calculateRssiAt: 中継機ありは直接波のみの合成より強くなる(電力合成)", () => {
  const walls = [{ x1: 6, y1: 0, x2: 6, y2: 5, material: "wood" }];
  const router = { x: 1, y: 2.5 };
  const repeater = { x: 7, y: 2.5 };
  const point = { x: 8, y: 2.5 };
  const routerOnly = calculateRssiAt(point, walls, router, null, "b5", { reflections: false });
  const withRepeater = calculateRssiAt(point, walls, router, repeater, "b5", { reflections: false });
  assert.ok(withRepeater > routerOnly);
});

test("rssiToThroughput: テーブルの端点をそのまま返す(5GHz)", () => {
  assert.equal(rssiToThroughput(-92, "b5"), 0);
  assert.equal(rssiToThroughput(-45, "b5"), 880);
  assert.equal(rssiToThroughput(-100, "b5"), 0); // 範囲外は下端でクランプ
  assert.equal(rssiToThroughput(0, "b5"), 880); // 範囲外は上端でクランプ
});

test("rssiToThroughput: 中間値は線形補間される", () => {
  // -62 -> 420, -55 -> 620 の中間(-58.5)は概ね中間値になる
  const mid = rssiToThroughput(-58.5, "b5");
  assert.ok(mid > 420 && mid < 620);
});

test("rssiToLevel: 4段階のしきい値", () => {
  assert.equal(rssiToLevel(-50), "strong");
  assert.equal(rssiToLevel(-55), "strong");
  assert.equal(rssiToLevel(-60), "good");
  assert.equal(rssiToLevel(-65), "good");
  assert.equal(rssiToLevel(-70), "weak");
  assert.equal(rssiToLevel(-72), "weak");
  assert.equal(rssiToLevel(-80), "poor");
});

test("evaluateRooms: room_summariesが3x3平均のRSSIとレベルを返す", () => {
  const rooms = [{ id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 6, height: 5 }];
  const router = { x: 1, y: 2.5 };
  const summaries = evaluateRooms(rooms, [], router, null, "b5", { reflections: false });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].room_id, "r1");
  assert.ok(typeof summaries[0].rssi_dbm === "number");
  assert.ok(["strong", "good", "weak", "poor"].includes(summaries[0].level));
});

test("calculateRequiredBandwidth: 用途なし・1人で(5+0)*1*0.7=3.5Mbps", () => {
  assert.equal(calculateRequiredBandwidth({ people: 1, uses: [] }), 3.5);
});

test("calculateRequiredBandwidth: video+meetingの2人で(5+25+15)*2*0.7=63Mbps", () => {
  assert.ok(Math.abs(calculateRequiredBandwidth({ people: 2, uses: ["video", "meeting"] }) - 63) < 1e-9);
});

test("findOptimalPosition: 対称な間取りでは中央付近が最適になる", () => {
  const rooms = [{ id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 6, height: 6 }];
  const result = findOptimalPosition(rooms, [], "b5", { gridStep: 1 });
  assert.ok(result.point.x >= 2 && result.point.x <= 4);
  assert.ok(result.point.y >= 2 && result.point.y <= 4);
});

test("findOptimalPosition: 水回りの部屋は候補から除外される", () => {
  const rooms = [{ id: "bath1", name: "浴室", type: "bath", x: 0, y: 0, width: 2, height: 2 }];
  assert.throws(() => findOptimalPosition(rooms, [], "b5", {}), /no livable rooms|no valid candidate/);
});

test("runSimulation: 全て足りている条件ではbottleneckがnone", () => {
  const rooms = [{ id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 4, height: 4 }];
  const roomLayout = {
    rooms,
    walls: [],
    router: { x: 2, y: 2 },
    repeater: null,
    environment: { router_gen: "wifi6", plan: "giga10", band: "b5", people: 1, uses: [] },
  };
  const result = runSimulation(roomLayout);
  assert.equal(result.bottleneck, "none");
  assert.equal(result.is_simulation, true);
});

test("runSimulation: 古いルーター世代・多用途・多人数でボトルネックがradio以外に移る", () => {
  const rooms = [{ id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 2, height: 2 }];
  const roomLayout = {
    rooms,
    walls: [],
    router: { x: 1, y: 1 },
    repeater: null,
    environment: { router_gen: "wifi4", plan: "giga10", band: "b5", people: 5, uses: ["video", "game"] },
  };
  const result = runSimulation(roomLayout);
  assert.equal(result.bottleneck, "router");
});

test("runSimulation: suggested_router_pos/suggested_repeater_posを含まない", () => {
  const rooms = [{ id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 4, height: 4 }];
  const roomLayout = {
    rooms,
    walls: [],
    router: { x: 2, y: 2 },
    repeater: null,
    environment: { router_gen: "wifi6", plan: "giga10", band: "b5", people: 1, uses: [] },
  };
  const result = runSimulation(roomLayout);
  assert.equal("suggested_router_pos" in result, false);
  assert.equal("suggested_repeater_pos" in result, false);
});
