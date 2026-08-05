// 間取りのひな形・壁とドアの自動生成（UIに依存しない純粋関数群）

const EPSILON = 1e-6;
const DOOR_WIDTH = 0.9;

const WET_ROOM_TYPES = new Set(["キッチン", "洗面", "浴室", "トイレ"]);

// 各プリセットは0.5mグリッドに揃えた矩形の集まりとして定義する
const PRESETS = {
  "1K": [
    { id: "entrance", type: "玄関", x: 0, y: 0, width: 1.5, depth: 1.5 },
    { id: "hall", type: "廊下", x: 1.5, y: 0, width: 1.0, depth: 1.5 },
    { id: "bath", type: "浴室", x: 2.5, y: 0, width: 1.5, depth: 1.5 },
    { id: "toilet", type: "トイレ", x: 4.0, y: 0, width: 1.0, depth: 1.5 },
    { id: "kitchen", type: "キッチン", x: 0, y: 1.5, width: 1.5, depth: 3.0 },
    { id: "room", type: "洋室", x: 1.5, y: 1.5, width: 3.5, depth: 3.0 },
  ],
  "2LDK": [
    { id: "entrance", type: "玄関", x: 0, y: 0, width: 1.5, depth: 1.5 },
    { id: "hall", type: "廊下", x: 1.5, y: 0, width: 1.0, depth: 1.5 },
    { id: "washroom", type: "洗面", x: 2.5, y: 0, width: 1.5, depth: 1.5 },
    { id: "bath", type: "浴室", x: 4.0, y: 0, width: 1.5, depth: 1.5 },
    { id: "toilet", type: "トイレ", x: 5.5, y: 0, width: 1.5, depth: 1.5 },
    { id: "ldk", type: "LDK", x: 0, y: 1.5, width: 4.0, depth: 6.0 },
    { id: "bedroom1", type: "寝室", x: 4.0, y: 1.5, width: 3.0, depth: 3.0 },
    { id: "bedroom2", type: "洋室", x: 4.0, y: 4.5, width: 3.0, depth: 3.0 },
  ],
  "3LDK": [
    { id: "entrance", type: "玄関", x: 0, y: 0, width: 1.5, depth: 1.5 },
    { id: "hall", type: "廊下", x: 1.5, y: 0, width: 1.0, depth: 1.5 },
    { id: "washroom", type: "洗面", x: 2.5, y: 0, width: 1.5, depth: 1.5 },
    { id: "bath", type: "浴室", x: 4.0, y: 0, width: 1.5, depth: 1.5 },
    { id: "toilet", type: "トイレ", x: 5.5, y: 0, width: 1.0, depth: 1.5 },
    { id: "study", type: "書斎", x: 6.5, y: 0, width: 1.5, depth: 1.5 },
    { id: "ldk", type: "LDK", x: 0, y: 1.5, width: 4.5, depth: 6.0 },
    { id: "bedroom1", type: "寝室", x: 4.5, y: 1.5, width: 3.5, depth: 2.0 },
    { id: "bedroom2", type: "和室", x: 4.5, y: 3.5, width: 3.5, depth: 2.0 },
    { id: "bedroom3", type: "洋室", x: 4.5, y: 5.5, width: 3.5, depth: 2.0 },
  ],
};

/**
 * ひな形の間取りを生成する
 * @param {"1K"|"2LDK"|"3LDK"} presetName
 * @returns {import('./types.js').Room[]}
 */
export function createPresetRooms(presetName) {
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`unknown preset: ${presetName}`);
  return preset.map((room) => ({ ...room }));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function verticalEdges(rooms) {
  const edges = [];
  for (const room of rooms) {
    edges.push({ line: room.x, r0: room.y, r1: room.y + room.depth, side: "left", room });
    edges.push({ line: room.x + room.width, r0: room.y, r1: room.y + room.depth, side: "right", room });
  }
  return edges;
}

function horizontalEdges(rooms) {
  const edges = [];
  for (const room of rooms) {
    edges.push({ line: room.y, r0: room.x, r1: room.x + room.width, side: "top", room });
    edges.push({ line: room.y + room.depth, r0: room.x, r1: room.x + room.width, side: "bottom", room });
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
  return groups;
}

// 1本の直線上で、区間ごとに「手前側」「奥側」にどの部屋があるかを求める
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

function classifySegment({ before, after }) {
  if (before && after) {
    const kind = WET_ROOM_TYPES.has(before.type) || WET_ROOM_TYPES.has(after.type) ? "wet" : "partition";
    return { kind, roomIds: [before.id, after.id].sort() };
  }
  if (before || after) {
    return { kind: "exterior", roomIds: [(before ?? after).id] };
  }
  return null;
}

function sameRoomPair(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// 隣接する同種の区間をひとつの壁にまとめる
function mergeSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    const classified = classifySegment(segment);
    if (!classified) continue;
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.r1 - segment.r0) < EPSILON && last.kind === classified.kind && sameRoomPair(last.roomIds, classified.roomIds)) {
      last.r1 = segment.r1;
    } else {
      merged.push({ r0: segment.r0, r1: segment.r1, kind: classified.kind, roomIds: classified.roomIds });
    }
  }
  return merged;
}

function buildWall(start, end, kind) {
  if (kind === "exterior") {
    return { start, end, kind, doorOpening: null };
  }
  const wallLength = Math.hypot(end.x - start.x, end.y - start.y);
  const doorLength = Math.min(DOOR_WIDTH, wallLength);
  const offset = (wallLength - doorLength) / 2;
  return { start, end, kind, doorOpening: { start: offset, end: offset + doorLength } };
}

/**
 * 部屋の隣接関係から壁とドアを自動生成する
 * @param {import('./types.js').Room[]} rooms
 * @returns {import('./types.js').Wall[]}
 */
export function generateWalls(rooms) {
  const walls = [];

  for (const [x, edges] of groupByLine(verticalEdges(rooms))) {
    const merged = mergeSegments(overlay1D(edges, "right", "left"));
    for (const segment of merged) {
      walls.push(buildWall({ x, y: segment.r0 }, { x, y: segment.r1 }, segment.kind));
    }
  }

  for (const [y, edges] of groupByLine(horizontalEdges(rooms))) {
    const merged = mergeSegments(overlay1D(edges, "bottom", "top"));
    for (const segment of merged) {
      walls.push(buildWall({ x: segment.r0, y }, { x: segment.r1, y }, segment.kind));
    }
  }

  return walls;
}

function rectsOverlap(a, b) {
  const noOverlapX = a.x + a.width <= b.x + EPSILON || b.x + b.width <= a.x + EPSILON;
  const noOverlapY = a.y + a.depth <= b.y + EPSILON || b.y + b.depth <= a.y + EPSILON;
  return !(noOverlapX || noOverlapY);
}

/**
 * 部屋の移動が他の部屋と重ならないか検証する（0.5m単位スナップ後の座標を想定）
 * @param {import('./types.js').Room[]} rooms
 * @param {string} movingRoomId
 * @param {number} newX
 * @param {number} newY
 * @returns {boolean} 移動可能か
 */
export function canMoveRoom(rooms, movingRoomId, newX, newY) {
  const movingRoom = rooms.find((r) => r.id === movingRoomId);
  if (!movingRoom) throw new Error(`room not found: ${movingRoomId}`);

  const movedRect = { x: newX, y: newY, width: movingRoom.width, depth: movingRoom.depth };

  return rooms.filter((r) => r.id !== movingRoomId).every((r) => !rectsOverlap(movedRect, r));
}
