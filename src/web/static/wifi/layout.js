// 間取りのひな形・部屋の編集・壁とドアの自動生成（担当B）
//
// このモジュールはUIに依存しない純粋関数群。DOM・Canvas・fetchに触れない。
// 同じ入力には必ず同じ結果を返す（乱数禁止）。
// 座標の単位はメートル、原点は間取りの左上、0.5m刻み（仕様書 規則2）。
// 外に出すキーはすべて snake_case（仕様書 規則1）。

const EPSILON = 1e-6;

/** 座標・寸法のスナップ単位(m) */
export const SNAP_M = 0.5;
/** 1歩の長さ(m)。部屋の広さの増減はこの単位で指示し、SNAP_Mへ丸める */
export const STEP_M = 0.65;
/** 畳1枚の面積(㎡)。中京間相当 */
export const TATAMI_SQM = 1.62;
/** 自動生成するドアの開口幅(m) */
export const DOOR_WIDTH_M = 0.9;
/** ドアを空ける間仕切りの最小長さ(m) */
export const DOOR_MIN_WALL_M = 1.5;
/** 部屋の一辺の最小・最大(m) */
export const MIN_ROOM_SIDE_M = 1.0;
export const MAX_ROOM_SIDE_M = 12.0;

/** 水回りの部屋種別（壁材質の判定に使う） */
const WET_ROOM_TYPES = new Set(["kitchen", "wash", "bath", "toilet"]);

/**
 * 選べる部屋の種別。label は画面表示用、default_name は追加時の初期名。
 * 表示文とIDは分離する（仕様書 規則3）。
 * @type {{id: import('./types.js').RoomType, label: string, default_name: string, width: number, height: number}[]}
 */
export const ROOM_TYPES = [
  { id: "ldk", label: "LDK", default_name: "リビング", width: 4.0, height: 4.0 },
  { id: "bedroom", label: "寝室", default_name: "寝室", width: 3.0, height: 2.5 },
  { id: "room", label: "洋室", default_name: "洋室", width: 3.0, height: 2.5 },
  { id: "tatami", label: "和室", default_name: "和室", width: 3.0, height: 2.5 },
  { id: "study", label: "書斎", default_name: "書斎", width: 2.0, height: 2.0 },
  { id: "kitchen", label: "キッチン", default_name: "キッチン", width: 2.0, height: 2.0 },
  { id: "wash", label: "洗面", default_name: "洗面所", width: 1.5, height: 1.5 },
  { id: "bath", label: "浴室", default_name: "浴室", width: 1.5, height: 1.5 },
  { id: "toilet", label: "トイレ", default_name: "トイレ", width: 1.0, height: 1.5 },
  { id: "entrance", label: "玄関", default_name: "玄関", width: 1.5, height: 1.5 },
  { id: "hall", label: "廊下", default_name: "廊下", width: 1.0, height: 1.5 },
];

const ROOM_TYPE_BY_ID = new Map(ROOM_TYPES.map((type) => [type.id, type]));

/**
 * 部屋種別の定義を引く
 * @param {string} typeId
 * @returns {{id: string, label: string, default_name: string, width: number, height: number}|null}
 */
export function getRoomType(typeId) {
  return ROOM_TYPE_BY_ID.get(typeId) ?? null;
}

// ひな形。すべて0.5mグリッドに揃え、部屋どうしが重ならないように定義する
const PRESET_DEFINITIONS = {
  "1k": {
    label: "1K",
    description: "ワンルーム＋キッチン",
    rooms: [
      { type: "entrance", name: "玄関", x: 0, y: 0, width: 1.5, height: 1.5 },
      { type: "hall", name: "廊下", x: 1.5, y: 0, width: 1.0, height: 1.5 },
      { type: "bath", name: "浴室", x: 2.5, y: 0, width: 1.5, height: 1.5 },
      { type: "toilet", name: "トイレ", x: 4.0, y: 0, width: 1.0, height: 1.5 },
      { type: "kitchen", name: "キッチン", x: 0, y: 1.5, width: 1.5, height: 3.0 },
      { type: "room", name: "洋室", x: 1.5, y: 1.5, width: 3.5, height: 3.0 },
    ],
  },
  "2ldk": {
    label: "2LDK",
    description: "LDK＋寝室2部屋",
    rooms: [
      { type: "entrance", name: "玄関", x: 0, y: 0, width: 1.5, height: 1.5 },
      { type: "hall", name: "廊下", x: 1.5, y: 0, width: 1.0, height: 1.5 },
      { type: "wash", name: "洗面所", x: 2.5, y: 0, width: 1.5, height: 1.5 },
      { type: "bath", name: "浴室", x: 4.0, y: 0, width: 1.5, height: 1.5 },
      { type: "toilet", name: "トイレ", x: 5.5, y: 0, width: 1.5, height: 1.5 },
      { type: "ldk", name: "リビング", x: 0, y: 1.5, width: 4.0, height: 6.0 },
      { type: "bedroom", name: "寝室", x: 4.0, y: 1.5, width: 3.0, height: 3.0 },
      { type: "room", name: "洋室", x: 4.0, y: 4.5, width: 3.0, height: 3.0 },
    ],
  },
  "3ldk": {
    label: "3LDK",
    description: "LDK＋居室3部屋",
    rooms: [
      { type: "entrance", name: "玄関", x: 0, y: 0, width: 1.5, height: 1.5 },
      { type: "hall", name: "廊下", x: 1.5, y: 0, width: 1.0, height: 1.5 },
      { type: "wash", name: "洗面所", x: 2.5, y: 0, width: 1.5, height: 1.5 },
      { type: "bath", name: "浴室", x: 4.0, y: 0, width: 1.5, height: 1.5 },
      { type: "toilet", name: "トイレ", x: 5.5, y: 0, width: 1.0, height: 1.5 },
      { type: "study", name: "書斎", x: 6.5, y: 0, width: 1.5, height: 1.5 },
      { type: "ldk", name: "リビング", x: 0, y: 1.5, width: 4.5, height: 6.0 },
      { type: "bedroom", name: "寝室", x: 4.5, y: 1.5, width: 3.5, height: 2.0 },
      { type: "tatami", name: "和室", x: 4.5, y: 3.5, width: 3.5, height: 2.0 },
      { type: "room", name: "洋室", x: 4.5, y: 5.5, width: 3.5, height: 2.0 },
    ],
  },
};

/**
 * 選べるひな形の一覧（画面のボタン生成用）
 * @returns {{id: string, label: string, description: string}[]}
 */
export function listPresets() {
  return Object.entries(PRESET_DEFINITIONS).map(([id, preset]) => ({
    id,
    label: preset.label,
    description: preset.description,
  }));
}

function round(value) {
  const rounded = Math.round(value * 1000) / 1000;
  // -0 を 0 に正規化する（JSONに "-0" を出さない）
  return rounded === 0 ? 0 : rounded;
}

/**
 * 0.5m刻みに丸める
 * @param {number} value
 * @returns {number}
 */
export function snapToGrid(value) {
  return round(Math.round(value / SNAP_M) * SNAP_M);
}

/**
 * ひな形の部屋一覧を生成する
 * @param {string} presetId - listPresets() が返すID
 * @returns {import('./types.js').Room[]}
 */
export function createPresetRooms(presetId) {
  const preset = PRESET_DEFINITIONS[presetId];
  if (!preset) throw new Error(`unknown preset: ${presetId}`);
  return preset.rooms.map((room, index) => ({
    id: `r${index + 1}`,
    name: room.name,
    type: room.type,
    x: room.x,
    y: room.y,
    width: room.width,
    height: room.height,
  }));
}

// ---------------------------------------------------------------------------
// 壁とドアの自動生成
// ---------------------------------------------------------------------------

function verticalEdges(rooms) {
  const edges = [];
  for (const room of rooms) {
    edges.push({ line: room.x, r0: room.y, r1: room.y + room.height, side: "left", room });
    edges.push({ line: room.x + room.width, r0: room.y, r1: room.y + room.height, side: "right", room });
  }
  return edges;
}

function horizontalEdges(rooms) {
  const edges = [];
  for (const room of rooms) {
    edges.push({ line: room.y, r0: room.x, r1: room.x + room.width, side: "top", room });
    edges.push({ line: room.y + room.height, r0: room.x, r1: room.x + room.width, side: "bottom", room });
  }
  return edges;
}

function groupByLine(edges) {
  const groups = new Map();
  for (const edge of edges) {
    const key = round(edge.line);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

// 1本の直線上を区間に分け、区間ごとに「手前側」「奥側」にどの部屋があるかを求める。
// 隣接する2部屋が同じ区間を二重に持つため、ここで1区間=1壁に正規化される（重複排除）。
function overlay1D(edges, beforeSide, afterSide) {
  const breakpoints = new Set();
  for (const edge of edges) {
    breakpoints.add(round(edge.r0));
    breakpoints.add(round(edge.r1));
  }
  const sorted = [...breakpoints].sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const r0 = sorted[i];
    const r1 = sorted[i + 1];
    if (r1 - r0 < EPSILON) continue;
    const mid = (r0 + r1) / 2;
    const before = edges.find((e) => e.side === beforeSide && mid > e.r0 - EPSILON && mid < e.r1 + EPSILON);
    const after = edges.find((e) => e.side === afterSide && mid > e.r0 - EPSILON && mid < e.r1 + EPSILON);
    segments.push({ r0, r1, before: before?.room ?? null, after: after?.room ?? null });
  }
  return segments;
}

// 区間の両隣に何があるかで壁の材質を決める
function classifySegment({ before, after }) {
  if (before && after) {
    const isWet = WET_ROOM_TYPES.has(before.type) || WET_ROOM_TYPES.has(after.type);
    return { material: isWet ? "water" : "wood", room_ids: [before.id, after.id].sort() };
  }
  if (before || after) {
    // 片側だけに部屋がある = 外気に面している
    return { material: "concrete", room_ids: [(before ?? after).id] };
  }
  return null;
}

function sameRoomIds(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// 同一直線上で連続し、材質が同じ区間を1本の壁にまとめる。
// 外壁は面する部屋が違っても1本の壁として扱う。間仕切りは隣接する部屋の組が
// 変わったら別の壁にする（そうしないと部屋をまたぐ長い壁の中央に1つだけドアが
// 空いてしまう）。
function mergeSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    const classified = classifySegment(segment);
    if (!classified) continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(last.r1 - segment.r0) < EPSILON &&
      last.material === classified.material &&
      (classified.material === "concrete" || sameRoomIds(last.room_ids, classified.room_ids))
    ) {
      last.r1 = segment.r1;
    } else {
      merged.push({ r0: segment.r0, r1: segment.r1, material: classified.material, room_ids: classified.room_ids });
    }
  }
  return merged;
}

// 間仕切り・水回りの壁が十分長ければ中央にドアの開口を空ける。
// 開口は始点(x1,y1)からの距離(m)で表す（engine.js が減衰計算で参照する）。
function buildWall(x1, y1, x2, y2, material) {
  const wall = { x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2), material, door: null };
  if (material === "concrete") return wall;

  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < DOOR_MIN_WALL_M - EPSILON) return wall;

  const start = (length - DOOR_WIDTH_M) / 2;
  wall.door = { start: round(start), end: round(start + DOOR_WIDTH_M) };
  return wall;
}

/**
 * 部屋の隣接関係から壁とドアを自動生成する（UIに依存しない）
 * @param {import('./types.js').Room[]} rooms
 * @returns {import('./types.js').Wall[]}
 */
export function generateWalls(rooms) {
  const walls = [];

  for (const [x, edges] of groupByLine(verticalEdges(rooms))) {
    for (const segment of mergeSegments(overlay1D(edges, "right", "left"))) {
      walls.push(buildWall(x, segment.r0, x, segment.r1, segment.material));
    }
  }

  for (const [y, edges] of groupByLine(horizontalEdges(rooms))) {
    for (const segment of mergeSegments(overlay1D(edges, "bottom", "top"))) {
      walls.push(buildWall(segment.r0, y, segment.r1, y, segment.material));
    }
  }

  return walls;
}

// ---------------------------------------------------------------------------
// 部屋の編集
// ---------------------------------------------------------------------------

function toRect(room) {
  return { x: room.x, y: room.y, width: room.width, height: room.height };
}

function rectsOverlap(a, b) {
  const separatedX = a.x + a.width <= b.x + EPSILON || b.x + b.width <= a.x + EPSILON;
  const separatedY = a.y + a.height <= b.y + EPSILON || b.y + b.height <= a.y + EPSILON;
  return !(separatedX || separatedY);
}

/**
 * 矩形が他の部屋と重なるか判定する
 * @param {import('./types.js').Room[]} rooms
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {string|null} ignoreRoomId - 判定から除く部屋（自分自身）
 * @returns {boolean}
 */
export function isOverlapping(rooms, rect, ignoreRoomId = null) {
  return rooms.some((room) => room.id !== ignoreRoomId && rectsOverlap(rect, toRect(room)));
}

/**
 * 部屋を移動する。0.5m刻みにスナップし、他の部屋と重なる場合は移動しない。
 * @param {import('./types.js').Room[]} rooms
 * @param {string} roomId
 * @param {number} x - 移動先の左上x(m)
 * @param {number} y - 移動先の左上y(m)
 * @returns {import('./types.js').Room[]|null} 移動後の配列。重なる場合はnull
 */
export function moveRoom(rooms, roomId, x, y) {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return null;

  const nextX = Math.max(0, snapToGrid(x));
  const nextY = Math.max(0, snapToGrid(y));
  if (isOverlapping(rooms, { x: nextX, y: nextY, width: room.width, height: room.height }, roomId)) {
    return null;
  }

  return rooms.map((r) => (r.id === roomId ? { ...r, x: nextX, y: nextY } : r));
}

/**
 * 部屋の広さを歩数で増減する。左上を固定して伸縮し、0.5m刻みへ丸める。
 * @param {import('./types.js').Room[]} rooms
 * @param {string} roomId
 * @param {"width"|"height"} axis
 * @param {number} stepDelta - 増減する歩数（+1 / -1）
 * @returns {import('./types.js').Room[]|null} 変更後の配列。下限・上限超過や重なりが起きる場合はnull
 */
export function resizeRoomBySteps(rooms, roomId, axis, stepDelta) {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return null;

  const target = snapToGrid(room[axis] + stepDelta * STEP_M);
  if (target < MIN_ROOM_SIDE_M - EPSILON || target > MAX_ROOM_SIDE_M + EPSILON) return null;
  if (Math.abs(target - room[axis]) < EPSILON) return null;

  const rect = { ...toRect(room), [axis]: target };
  if (isOverlapping(rooms, rect, roomId)) return null;

  return rooms.map((r) => (r.id === roomId ? { ...r, [axis]: target } : r));
}

function nextRoomId(rooms) {
  let maxIndex = 0;
  for (const room of rooms) {
    const matched = /^r(\d+)$/.exec(room.id);
    if (matched) maxIndex = Math.max(maxIndex, Number(matched[1]));
  }
  return `r${maxIndex + 1}`;
}

// 新しい部屋が既存の部屋と辺を共有しているか（間取りが分断されないようにする）
function touchesAnyRoom(rooms, rect) {
  return rooms.some((room) => {
    const other = toRect(room);
    const sharesVerticalEdge =
      (Math.abs(rect.x + rect.width - other.x) < EPSILON || Math.abs(other.x + other.width - rect.x) < EPSILON) &&
      rect.y < other.y + other.height - EPSILON &&
      other.y < rect.y + rect.height - EPSILON;
    const sharesHorizontalEdge =
      (Math.abs(rect.y + rect.height - other.y) < EPSILON || Math.abs(other.y + other.height - rect.y) < EPSILON) &&
      rect.x < other.x + other.width - EPSILON &&
      other.x < rect.x + rect.width - EPSILON;
    return sharesVerticalEdge || sharesHorizontalEdge;
  });
}

/**
 * 間取り全体の外接矩形を返す
 * @param {import('./types.js').Room[]} rooms
 * @returns {{min_x: number, min_y: number, max_x: number, max_y: number, width: number, height: number}}
 */
export function layoutBounds(rooms) {
  if (rooms.length === 0) return { min_x: 0, min_y: 0, max_x: 0, max_y: 0, width: 0, height: 0 };
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.width));
  const maxY = Math.max(...rooms.map((r) => r.y + r.height));
  return { min_x: minX, min_y: minY, max_x: maxX, max_y: maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * 部屋を追加する。既存の部屋と辺を共有する空き位置を探して置く。
 * @param {import('./types.js').Room[]} rooms
 * @param {string} typeId - ROOM_TYPES のID
 * @returns {import('./types.js').Room[]|null} 追加後の配列。置ける場所がなければnull
 */
export function addRoom(rooms, typeId) {
  const type = getRoomType(typeId);
  if (!type) return null;

  const newRoom = {
    id: nextRoomId(rooms),
    name: type.default_name,
    type: type.id,
    x: 0,
    y: 0,
    width: type.width,
    height: type.height,
  };

  if (rooms.length === 0) return [newRoom];

  const bounds = layoutBounds(rooms);
  const candidates = [];
  for (let y = bounds.min_y; y <= bounds.max_y + EPSILON; y = round(y + SNAP_M)) {
    for (let x = bounds.min_x; x <= bounds.max_x + EPSILON; x = round(x + SNAP_M)) {
      candidates.push({ x, y });
    }
  }
  // 外周に回り込む候補（右側・下側）も試す
  for (let y = bounds.min_y; y <= bounds.max_y + EPSILON; y = round(y + SNAP_M)) {
    candidates.push({ x: bounds.max_x, y });
  }
  for (let x = bounds.min_x; x <= bounds.max_x + EPSILON; x = round(x + SNAP_M)) {
    candidates.push({ x, y: bounds.max_y });
  }

  for (const candidate of candidates) {
    const rect = { x: candidate.x, y: candidate.y, width: newRoom.width, height: newRoom.height };
    if (isOverlapping(rooms, rect, null)) continue;
    if (!touchesAnyRoom(rooms, rect)) continue;
    return [...rooms, { ...newRoom, x: candidate.x, y: candidate.y }];
  }
  return null;
}

/**
 * 部屋を削除する
 * @param {import('./types.js').Room[]} rooms
 * @param {string} roomId
 * @returns {import('./types.js').Room[]}
 */
export function removeRoom(rooms, roomId) {
  return rooms.filter((room) => room.id !== roomId);
}

/**
 * 部屋の名前を変更する
 * @param {import('./types.js').Room[]} rooms
 * @param {string} roomId
 * @param {string} name
 * @returns {import('./types.js').Room[]}
 */
export function renameRoom(rooms, roomId, name) {
  return rooms.map((room) => (room.id === roomId ? { ...room, name } : room));
}

/**
 * 部屋の広さを利用者向けの単位に言い換える（歩数・㎡・畳）
 * @param {import('./types.js').Room} room
 * @returns {{steps_x: number, steps_y: number, area_sqm: number, tatami: number}}
 */
export function describeRoomSize(room) {
  const area = room.width * room.height;
  return {
    steps_x: Math.round(room.width / STEP_M),
    steps_y: Math.round(room.height / STEP_M),
    area_sqm: round(area),
    tatami: Math.round((area / TATAMI_SQM) * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// 親機・中継機の配置
// ---------------------------------------------------------------------------

/**
 * 指定した地点がどの部屋に属するかを返す
 * @param {import('./types.js').Room[]} rooms
 * @param {import('./types.js').Point} point
 * @returns {import('./types.js').Room|null}
 */
export function findRoomAt(rooms, point) {
  // 後ろの部屋を優先する（描画順が後=手前）
  for (let i = rooms.length - 1; i >= 0; i--) {
    const room = rooms[i];
    if (
      point.x >= room.x - EPSILON &&
      point.x <= room.x + room.width + EPSILON &&
      point.y >= room.y - EPSILON &&
      point.y <= room.y + room.height + EPSILON
    ) {
      return room;
    }
  }
  return null;
}

/**
 * 機器を置ける位置か（部屋の中かどうか）
 * @param {import('./types.js').Room[]} rooms
 * @param {import('./types.js').Point} point
 * @returns {boolean}
 */
export function isPlaceable(rooms, point) {
  return findRoomAt(rooms, point) !== null;
}

/**
 * 機器の移動先を確定する。0.5m刻みにスナップし、部屋の外なら移動を認めない。
 * @param {import('./types.js').Room[]} rooms
 * @param {import('./types.js').Point} point - 移動先の候補
 * @returns {import('./types.js').Point|null} 確定した位置。部屋の外ならnull
 */
export function resolveTransmitterPosition(rooms, point) {
  const snapped = { x: Math.max(0, snapToGrid(point.x)), y: Math.max(0, snapToGrid(point.y)) };
  return isPlaceable(rooms, snapped) ? snapped : null;
}

/**
 * 親機の初期位置。もっとも広い居室の中心に置く。
 * @param {import('./types.js').Room[]} rooms
 * @returns {import('./types.js').Point|null}
 */
export function defaultRouterPosition(rooms) {
  const candidates = rooms.filter((room) => !WET_ROOM_TYPES.has(room.type));
  const target = (candidates.length > 0 ? candidates : rooms).reduce(
    (largest, room) => (room.width * room.height > largest.width * largest.height ? room : largest),
    (candidates.length > 0 ? candidates : rooms)[0]
  );
  if (!target) return null;
  return { x: snapToGrid(target.x + target.width / 2), y: snapToGrid(target.y + target.height / 2) };
}

/**
 * 中継機を追加したときの初期位置。親機からもっとも遠い居室の中心に置く。
 * ここでは距離しか見ない（電波を見た最適位置の探索は担当Cのengine.jsの責務）。
 * @param {import('./types.js').Room[]} rooms
 * @param {import('./types.js').Point} router
 * @returns {import('./types.js').Point|null}
 */
export function defaultRepeaterPosition(rooms, router) {
  const candidates = rooms.filter((room) => !WET_ROOM_TYPES.has(room.type));
  const pool = candidates.length > 0 ? candidates : rooms;

  let best = null;
  let bestDistance = -1;
  for (const room of pool) {
    const center = { x: room.x + room.width / 2, y: room.y + room.height / 2 };
    const distance = Math.hypot(center.x - router.x, center.y - router.y);
    if (distance > bestDistance) {
      bestDistance = distance;
      best = center;
    }
  }
  if (!best) return null;
  return resolveTransmitterPosition(rooms, best) ?? resolveTransmitterPosition(rooms, router);
}

// ---------------------------------------------------------------------------
// 4章「間取り・機器」オブジェクトの組み立て
// ---------------------------------------------------------------------------

/**
 * 環境設定の既定値。値の選択UIは本モジュールの担当外なので、
 * 間取りを保存する時点ではこの既定値を入れておく。
 * @returns {import('./types.js').Environment}
 */
export function defaultEnvironment() {
  return { router_gen: "wifi5", plan: "giga1", band: "b5", people: 3, uses: ["video"] };
}

/**
 * 部屋一覧から、仕様書4-1の「間取り・機器」オブジェクトを組み立てる。
 * 壁は必ずここで生成し直すので、部屋を動かせば壁とドアも引き直される。
 * @param {import('./types.js').Room[]} rooms
 * @param {{router?: import('./types.js').Point|null, repeater?: import('./types.js').Point|null, environment?: import('./types.js').Environment}} options
 * @returns {import('./types.js').RoomLayout}
 */
export function buildRoomLayout(rooms, options = {}) {
  const router = options.router && isPlaceable(rooms, options.router) ? options.router : defaultRouterPosition(rooms);
  const repeater = options.repeater && isPlaceable(rooms, options.repeater) ? options.repeater : null;

  return {
    rooms: rooms.map((room) => ({ ...room })),
    walls: generateWalls(rooms),
    router: router ?? { x: 0, y: 0 },
    repeater,
    environment: options.environment ?? defaultEnvironment(),
  };
}

/**
 * ひな形から間取り一式を作る
 * @param {string} presetId
 * @returns {import('./types.js').RoomLayout}
 */
export function createPresetLayout(presetId) {
  return buildRoomLayout(createPresetRooms(presetId));
}
