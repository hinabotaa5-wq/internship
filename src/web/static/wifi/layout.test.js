import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOOR_WIDTH_M,
  MIN_ROOM_SIDE_M,
  SNAP_M,
  addRoom,
  buildRoomLayout,
  createPresetRooms,
  defaultRepeaterPosition,
  defaultRouterPosition,
  describeRoomSize,
  findRoomAt,
  generateWalls,
  isOverlapping,
  layoutBounds,
  listPresets,
  moveRoom,
  removeRoom,
  resizeRoomBySteps,
  resolveTransmitterPosition,
  snapToGrid,
} from "./layout.js";

const isOnGrid = (value) => Math.abs(value / SNAP_M - Math.round(value / SNAP_M)) < 1e-9;

// --- ひな形 -----------------------------------------------------------------

test("createPresetRooms: 全ひな形で部屋が重ならず、0.5m刻みに揃っている", () => {
  for (const preset of listPresets()) {
    const rooms = createPresetRooms(preset.id);
    assert.ok(rooms.length > 0, `${preset.id} に部屋がない`);

    const ids = new Set(rooms.map((room) => room.id));
    assert.equal(ids.size, rooms.length, `${preset.id} のIDが重複している`);

    for (const room of rooms) {
      for (const value of [room.x, room.y, room.width, room.height]) {
        assert.ok(isOnGrid(value), `${preset.id}/${room.id} が0.5m刻みでない: ${value}`);
      }
      assert.ok(room.width >= MIN_ROOM_SIDE_M && room.height >= MIN_ROOM_SIDE_M);
      const others = rooms.filter((other) => other.id !== room.id);
      assert.equal(isOverlapping(others, room, null), false, `${preset.id}/${room.id} が他の部屋と重なる`);
    }
  }
});

test("createPresetRooms: 未知のひな形IDは例外", () => {
  assert.throws(() => createPresetRooms("4ldk"));
});

// --- 壁の自動生成 -----------------------------------------------------------

const twoRooms = [
  { id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 4, height: 4 },
  { id: "r2", name: "寝室", type: "bedroom", x: 4, y: 0, width: 3, height: 4 },
];

test("generateWalls: 隣接する2部屋の境界は間仕切り1枚だけ（重複排除）", () => {
  const walls = generateWalls(twoRooms);
  const boundary = walls.filter((wall) => Math.abs(wall.x1 - 4) < 1e-9 && Math.abs(wall.x2 - 4) < 1e-9);
  assert.equal(boundary.length, 1);
  assert.equal(boundary[0].material, "wood");
});

test("generateWalls: 外周は外壁(concrete)で、連続区間が1本にまとまる", () => {
  const walls = generateWalls(twoRooms);
  // 上端 y=0 は r1(幅4)とr2(幅3)が並ぶが、外壁として1本にまとまる
  const top = walls.filter((wall) => Math.abs(wall.y1) < 1e-9 && Math.abs(wall.y2) < 1e-9);
  assert.equal(top.length, 1);
  assert.equal(top[0].material, "concrete");
  assert.equal(top[0].x1, 0);
  assert.equal(top[0].x2, 7);
  assert.equal(top[0].door, null);
});

test("generateWalls: 水回りに接する間仕切りはwater", () => {
  const rooms = [
    { id: "r1", name: "リビング", type: "ldk", x: 0, y: 0, width: 4, height: 4 },
    { id: "r2", name: "浴室", type: "bath", x: 4, y: 0, width: 2, height: 4 },
  ];
  const boundary = generateWalls(rooms).find((wall) => Math.abs(wall.x1 - 4) < 1e-9 && Math.abs(wall.x2 - 4) < 1e-9);
  assert.equal(boundary.material, "water");
});

test("generateWalls: 1.5m以上の間仕切りには中央に0.9mのドアが空く", () => {
  const boundary = generateWalls(twoRooms).find((wall) => Math.abs(wall.x1 - 4) < 1e-9);
  assert.notEqual(boundary.door, null);
  assert.ok(Math.abs(boundary.door.end - boundary.door.start - DOOR_WIDTH_M) < 1e-9);
  // 長さ4mの壁の中央 -> 1.55m〜2.45m
  assert.ok(Math.abs(boundary.door.start - 1.55) < 1e-9);
});

test("generateWalls: 1.5m未満の間仕切りにはドアを空けない", () => {
  const rooms = [
    { id: "r1", name: "廊下", type: "hall", x: 0, y: 0, width: 2, height: 1 },
    { id: "r2", name: "トイレ", type: "toilet", x: 2, y: 0, width: 1, height: 1 },
  ];
  const boundary = generateWalls(rooms).find((wall) => Math.abs(wall.x1 - 2) < 1e-9);
  assert.equal(boundary.door, null);
});

test("generateWalls: 部屋を動かすと壁が引き直される", () => {
  const before = generateWalls(twoRooms);
  const moved = moveRoom(twoRooms, "r2", 5, 0);
  const after = generateWalls(moved);
  assert.notDeepEqual(before, after);
  // 離れたので境界は外壁2枚になる
  assert.equal(after.filter((wall) => wall.material === "wood").length, 0);
});

test("generateWalls: ひな形の壁がすべて軸に平行で、長さを持つ", () => {
  for (const preset of listPresets()) {
    for (const wall of generateWalls(createPresetRooms(preset.id))) {
      const isVertical = Math.abs(wall.x1 - wall.x2) < 1e-9;
      const isHorizontal = Math.abs(wall.y1 - wall.y2) < 1e-9;
      assert.ok(isVertical || isHorizontal, "軸に平行でない壁がある");
      assert.ok(Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) > 1e-9, "長さ0の壁がある");
      assert.ok(["concrete", "wood", "water"].includes(wall.material));
    }
  }
});

// --- 部屋の編集 -------------------------------------------------------------

test("snapToGrid: 0.5m刻みに丸める", () => {
  assert.equal(snapToGrid(3.65), 3.5);
  assert.equal(snapToGrid(3.8), 4.0);
  assert.equal(snapToGrid(-0.1), 0);
});

test("moveRoom: 重なる移動は認めない", () => {
  assert.equal(moveRoom(twoRooms, "r2", 2, 0), null);
});

test("moveRoom: 空いている位置へは0.5m刻みにスナップして移動する", () => {
  const moved = moveRoom(twoRooms, "r2", 4.3, 4.1);
  const target = moved.find((room) => room.id === "r2");
  assert.equal(target.x, 4.5);
  assert.equal(target.y, 4.0);
});

test("moveRoom: 負の座標は0で止まる（原点は間取りの左上）", () => {
  const moved = moveRoom(twoRooms, "r1", -3, -3);
  const target = moved.find((room) => room.id === "r1");
  assert.equal(target.x, 0);
  assert.equal(target.y, 0);
});

test("resizeRoomBySteps: 1歩ぶん広げると0.5m刻みで大きくなる", () => {
  const rooms = [{ id: "r1", name: "洋室", type: "room", x: 0, y: 0, width: 3, height: 3 }];
  const grown = resizeRoomBySteps(rooms, "r1", "width", 1);
  assert.equal(grown[0].width, 3.5);
  const shrunk = resizeRoomBySteps(rooms, "r1", "height", -1);
  assert.equal(shrunk[0].height, 2.5);
});

test("resizeRoomBySteps: 最小サイズ未満・他の部屋との重なりは認めない", () => {
  const rooms = [{ id: "r1", name: "トイレ", type: "toilet", x: 0, y: 0, width: 1, height: 1 }];
  assert.equal(resizeRoomBySteps(rooms, "r1", "width", -1), null);
  assert.equal(resizeRoomBySteps(twoRooms, "r1", "width", 1), null);
});

test("addRoom: 既存の部屋と辺を共有する空き位置に追加される", () => {
  const added = addRoom(twoRooms, "study");
  assert.equal(added.length, 3);
  const added3 = added[2];
  assert.equal(added3.type, "study");
  assert.equal(isOverlapping(twoRooms, added3, null), false);
  // 追加後も壁が生成できる
  assert.ok(generateWalls(added).length > 0);
});

test("addRoom: 部屋が空の状態では原点に置く", () => {
  const added = addRoom([], "ldk");
  assert.equal(added.length, 1);
  assert.equal(added[0].x, 0);
  assert.equal(added[0].y, 0);
});

test("removeRoom: 指定した部屋だけが消える", () => {
  const removed = removeRoom(twoRooms, "r1");
  assert.deepEqual(
    removed.map((room) => room.id),
    ["r2"]
  );
});

test("describeRoomSize: 歩数・㎡・畳を併記できる", () => {
  const size = describeRoomSize({ width: 3.25, height: 3.25 });
  assert.equal(size.steps_x, 5);
  assert.equal(size.steps_y, 5);
  assert.ok(Math.abs(size.area_sqm - 10.563) < 1e-3);
  assert.ok(Math.abs(size.tatami - 6.5) < 0.1);
});

test("layoutBounds: 間取り全体の外接矩形を返す", () => {
  const bounds = layoutBounds(twoRooms);
  assert.deepEqual(bounds, { min_x: 0, min_y: 0, max_x: 7, max_y: 4, width: 7, height: 4 });
});

// --- 機器の配置 -------------------------------------------------------------

test("findRoomAt: 部屋の中と外を判定する", () => {
  assert.equal(findRoomAt(twoRooms, { x: 1, y: 1 }).id, "r1");
  assert.equal(findRoomAt(twoRooms, { x: 5, y: 1 }).id, "r2");
  assert.equal(findRoomAt(twoRooms, { x: 9, y: 9 }), null);
});

test("resolveTransmitterPosition: 部屋の外には置けない", () => {
  assert.deepEqual(resolveTransmitterPosition(twoRooms, { x: 1.2, y: 1.4 }), { x: 1, y: 1.5 });
  assert.equal(resolveTransmitterPosition(twoRooms, { x: 20, y: 20 }), null);
});

test("defaultRouterPosition: もっとも広い居室の中心に置く", () => {
  const position = defaultRouterPosition(createPresetRooms("2ldk"));
  const room = findRoomAt(createPresetRooms("2ldk"), position);
  assert.equal(room.type, "ldk");
});

test("defaultRepeaterPosition: 親機からもっとも遠い居室の中に入る", () => {
  const rooms = createPresetRooms("3ldk");
  const router = defaultRouterPosition(rooms);
  const repeater = defaultRepeaterPosition(rooms, router);
  const room = findRoomAt(rooms, repeater);
  assert.notEqual(room, null);
  assert.ok(Math.hypot(repeater.x - router.x, repeater.y - router.y) > 2);
});

test("defaultRouterPosition: 水回りしかない場合でも位置を返す", () => {
  const rooms = [{ id: "r1", name: "浴室", type: "bath", x: 0, y: 0, width: 2, height: 2 }];
  assert.deepEqual(defaultRouterPosition(rooms), { x: 1, y: 1 });
});

// --- 4章オブジェクトの組み立て ----------------------------------------------

test("buildRoomLayout: 4-1の構造をsnake_caseで組み立てる", () => {
  const layout = buildRoomLayout(createPresetRooms("3ldk"));
  assert.deepEqual(Object.keys(layout).sort(), ["environment", "repeater", "rooms", "router", "walls"]);
  assert.equal(layout.repeater, null);
  assert.ok(layout.walls.length > 0);
  assert.deepEqual(Object.keys(layout.environment).sort(), ["band", "people", "plan", "router_gen", "uses"]);
  for (const room of layout.rooms) {
    assert.deepEqual(Object.keys(room).sort(), ["height", "id", "name", "type", "width", "x", "y"]);
  }
});

test("buildRoomLayout: 部屋の外にある機器の位置は引き継がない", () => {
  const rooms = createPresetRooms("1k");
  const layout = buildRoomLayout(rooms, { router: { x: 99, y: 99 }, repeater: { x: 99, y: 99 } });
  assert.equal(layout.repeater, null);
  assert.notEqual(findRoomAt(rooms, layout.router), null);
});
