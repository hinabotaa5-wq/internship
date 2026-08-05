// 電波計算エンジン（UIに依存しない純粋関数群）
// DOM・Canvas・Flaskルーティングに触れない。同じ入力には必ず同じ結果を返す（乱数禁止）。

const BAND_PARAMS = {
  b5: { p0: -44, n: 2.2, wallCoef: 1.5 },
  b24: { p0: -38, n: 2.0, wallCoef: 1.0 },
};

const WALL_ATTENUATION_BASE = { concrete: 11, wood: 3, water: 8 };
const REFLECTION_LOSS_BASE = { concrete: 4, wood: 7, water: 6 };

// 部屋種別のうち「水回り」（壁材質の判定・設置候補の除外に使う）
const WET_ROOM_TYPES = new Set(["kitchen", "wash", "bath", "toilet"]);
// 診断対象外の居室（サービスエリアの評価に含めない）
const EXCLUDED_FROM_DIAGNOSIS = new Set(["wash", "bath", "toilet", "entrance", "hall"]);

const USAGE_MBPS = { video: 25, meeting: 15, game: 30, work: 10 };

const ROUTER_LIMIT_MBPS = { wifi4: 100, wifi5: 400, wifi6: 900 };
const PLAN_THROUGHPUT_MBPS = { giga1: 500, giga10: 2500 };

const THROUGHPUT_TABLE = {
  b5: [
    [-92, 0],
    [-85, 5],
    [-78, 40],
    [-73, 110],
    [-68, 230],
    [-62, 420],
    [-55, 620],
    [-45, 880],
  ],
  b24: [
    [-92, 0],
    [-85, 2],
    [-78, 8],
    [-73, 25],
    [-68, 55],
    [-62, 95],
    [-55, 140],
    [-45, 180],
  ],
};

const EPSILON = 1e-9;
const DEFAULT_GRID_STEP = 0.6;

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function powerSumDb(dbValues) {
  if (dbValues.length === 0) return -Infinity;
  let totalPower = 0;
  for (const db of dbValues) totalPower += 10 ** (db / 10);
  return 10 * Math.log10(totalPower);
}

// 2線分 (x1,y1)-(x2,y2) と (x3,y3)-(x4,y4) の交点を返す。交差しなければ null。
function segmentIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d1x = x2 - x1;
  const d1y = y2 - y1;
  const d2x = x4 - x3;
  const d2y = y4 - y3;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < EPSILON) return null; // 平行

  const t = ((x3 - x1) * d2y - (y3 - y1) * d2x) / denom;
  const u = ((x3 - x1) * d1y - (y3 - y1) * d1x) / denom;

  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;

  return [x1 + t * d1x, y1 + t * d1y];
}

function isPointWithinDoorOpening(wall, ix, iy) {
  if (!wall.door) return false;
  const distFromStart = distance(wall.x1, wall.y1, ix, iy);
  return distFromStart >= wall.door.start - EPSILON && distFromStart <= wall.door.end + EPSILON;
}

function wallLossBetween(tx, ty, ex, ey, walls, wallCoef, excludeWall) {
  let wallLoss = 0;
  for (const wall of walls) {
    if (wall === excludeWall) continue;
    const intersection = segmentIntersection(tx, ty, ex, ey, wall.x1, wall.y1, wall.x2, wall.y2);
    if (!intersection) continue;
    if (isPointWithinDoorOpening(wall, intersection[0], intersection[1])) continue;
    wallLoss += WALL_ATTENUATION_BASE[wall.material] * wallCoef;
  }
  return wallLoss;
}

function directRssi(tx, ty, ex, ey, walls, band, excludeWall) {
  const { p0, n, wallCoef } = BAND_PARAMS[band];
  const d = Math.max(distance(tx, ty, ex, ey), 0.6);
  const pathLoss = 10 * n * Math.log10(d);
  const wallLoss = wallLossBetween(tx, ty, ex, ey, walls, wallCoef, excludeWall);
  return p0 - pathLoss - wallLoss;
}

// 壁の派生情報（長さ・軸方向）を同じwalls配列に対してキャッシュする（格子探索での再計算を避ける）
const wallsDerivedCache = new WeakMap();

function getWallsDerived(walls) {
  let derived = wallsDerivedCache.get(walls);
  if (derived) return derived;

  const withMeta = walls.map((wall) => {
    const length = distance(wall.x1, wall.y1, wall.x2, wall.y2);
    const isVertical = Math.abs(wall.x1 - wall.x2) < EPSILON;
    return { wall, length, isVertical };
  });

  // 反射に使う壁: 長さ1.5m以上のうち長い順に最大8枚（外壁を優先）
  const reflectionCandidates = withMeta
    .filter((m) => m.length >= 1.5)
    .sort((a, b) => {
      const lenDiff = b.length - a.length;
      if (Math.abs(lenDiff) > EPSILON) return lenDiff;
      const aExterior = a.wall.material === "concrete" ? 0 : 1;
      const bExterior = b.wall.material === "concrete" ? 0 : 1;
      return aExterior - bExterior;
    })
    .slice(0, 8)
    .map((m) => m.wall);

  derived = { reflectionCandidates };
  wallsDerivedCache.set(walls, derived);
  return derived;
}

function mirrorAcrossWall(px, py, wall) {
  const isVertical = Math.abs(wall.x1 - wall.x2) < EPSILON;
  const isHorizontal = Math.abs(wall.y1 - wall.y2) < EPSILON;
  if (isVertical) return [2 * wall.x1 - px, py];
  if (isHorizontal) return [px, 2 * wall.y1 - py];
  throw new Error("wall must be axis-aligned");
}

function reflectedPaths(tx, ty, ex, ey, walls, band) {
  const { reflectionCandidates } = getWallsDerived(walls);
  const paths = [];
  for (const wall of reflectionCandidates) {
    const [mx, my] = mirrorAcrossWall(tx, ty, wall);
    const intersection = segmentIntersection(mx, my, ex, ey, wall.x1, wall.y1, wall.x2, wall.y2);
    if (!intersection) continue; // 反射点が壁の外 -> 成立しない
    if (isPointWithinDoorOpening(wall, intersection[0], intersection[1])) continue;
    const rssi = directRssi(mx, my, ex, ey, walls, band, wall) - REFLECTION_LOSS_BASE[wall.material];
    paths.push(rssi);
  }
  return paths;
}

function transmitterOwnRssi(tx, ty, ex, ey, walls, band, reflections) {
  const paths = [directRssi(tx, ty, ex, ey, walls, band, null)];
  if (reflections) {
    paths.push(...reflectedPaths(tx, ty, ex, ey, walls, band));
  }
  return powerSumDb(paths);
}

/**
 * 1点における合成RSSIを計算する（直接波 + 反射波、親機+中継機の電力和）
 * @param {import('./types.js').Point} point - 評価点
 * @param {import('./types.js').Wall[]} walls
 * @param {import('./types.js').Point} router
 * @param {import('./types.js').Point|null} repeater
 * @param {import('./types.js').Band} band
 * @param {{reflections: boolean}} options - 反射ON/OFF
 * @returns {number} RSSI (dBm)
 */
export function calculateRssiAt(point, walls, router, repeater, band, options = {}) {
  const reflections = Boolean(options.reflections);
  const routerDb = transmitterOwnRssi(router.x, router.y, point.x, point.y, walls, band, reflections);
  if (!repeater) return routerDb;

  const back = transmitterOwnRssi(router.x, router.y, repeater.x, repeater.y, walls, band, reflections);
  const penalty = 4 + Math.max(0, (-58 - back) * 0.6);
  const repeaterDb = transmitterOwnRssi(repeater.x, repeater.y, point.x, point.y, walls, band, reflections) - penalty;

  // 直接波・反射波・中継機の分はすべて電力で合成する（大きい方を採用する方式は使わない）
  return powerSumDb([routerDb, repeaterDb]);
}

/**
 * RSSIから実効速度(Mbps)を線形補間で求める
 * @param {number} rssi - dBm
 * @param {import('./types.js').Band} band
 * @returns {number} Mbps
 */
export function rssiToThroughput(rssi, band) {
  const table = THROUGHPUT_TABLE[band];
  if (rssi <= table[0][0]) return table[0][1];
  if (rssi >= table[table.length - 1][0]) return table[table.length - 1][1];

  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (rssi >= x0 && rssi <= x1) {
      const ratio = (rssi - x0) / (x1 - x0);
      return y0 + ratio * (y1 - y0);
    }
  }
  return 0;
}

/**
 * RSSIから快適度レベルを判定する
 * @param {number} rssi - dBm
 * @returns {import('./types.js').RssiLevel}
 */
export function rssiToLevel(rssi) {
  if (rssi >= -55) return "strong";
  if (rssi >= -65) return "good";
  if (rssi >= -72) return "weak";
  return "poor";
}

/**
 * 部屋ごとのRSSI・実効速度・レベルを評価する（3x3代表点の平均）
 * @param {import('./types.js').Room[]} rooms
 * @param {import('./types.js').Wall[]} walls
 * @param {import('./types.js').Point} router
 * @param {import('./types.js').Point|null} repeater
 * @param {import('./types.js').Band} band
 * @param {{reflections: boolean}} options
 * @returns {import('./types.js').RoomSummary[]}
 */
export function evaluateRooms(rooms, walls, router, repeater, band, options = {}) {
  return rooms.map((room) => {
    const samples = [];
    for (const fx of [0.25, 0.5, 0.75]) {
      for (const fy of [0.25, 0.5, 0.75]) {
        samples.push({ x: room.x + room.width * fx, y: room.y + room.height * fy });
      }
    }
    const rssiValues = samples.map((p) => calculateRssiAt(p, walls, router, repeater, band, options));
    const rssi = rssiValues.reduce((sum, v) => sum + v, 0) / rssiValues.length;
    return {
      room_id: room.id,
      rssi_dbm: rssi,
      estimated_mbps: rssiToThroughput(rssi, band),
      level: rssiToLevel(rssi),
    };
  });
}

/**
 * 必要帯域(Mbps)を算出する
 * @param {import('./types.js').Environment} environment
 * @returns {number} Mbps
 */
export function calculateRequiredBandwidth(environment) {
  const usageSum = environment.uses.reduce((sum, usage) => sum + (USAGE_MBPS[usage] ?? 0), 0);
  return (5 + usageSum) * environment.people * 0.7;
}

function computeBounds(rooms) {
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.width));
  const maxY = Math.max(...rooms.map((r) => r.y + r.height));
  return { minX, minY, maxX, maxY };
}

function findRoomContaining(rooms, point) {
  return rooms.find(
    (r) =>
      point.x >= r.x - EPSILON &&
      point.x <= r.x + r.width + EPSILON &&
      point.y >= r.y - EPSILON &&
      point.y <= r.y + r.height + EPSILON
  );
}

/**
 * 親機/中継機の最適位置を探索する（診断対象の居室で最も弱い部屋のRSSIを最大化する点）
 * @param {import('./types.js').Room[]} rooms - 間取り全体の部屋（候補判定に使う）
 * @param {import('./types.js').Wall[]} walls
 * @param {import('./types.js').Band} band
 * @param {{role?: "router"|"repeater", otherPoint?: import('./types.js').Point|null, excludeNearPoint?: import('./types.js').Point, excludeRadius?: number, gridStep?: number}} constraints
 *   role="repeater"のときはotherPointを親機として固定し、中継機の位置を探索する。省略時(role="router")はotherPointを中継機として固定し、親機の位置を探索する。
 * @returns {{point: import('./types.js').Point, minRssi: number}}
 */
export function findOptimalPosition(rooms, walls, band, constraints = {}) {
  const role = constraints.role ?? "router";
  const otherPoint = constraints.otherPoint ?? null;
  const gridStep = constraints.gridStep ?? DEFAULT_GRID_STEP;

  const livableRooms = rooms.filter((r) => !EXCLUDED_FROM_DIAGNOSIS.has(r.type));
  if (livableRooms.length === 0) throw new Error("no livable rooms to evaluate");

  const bounds = computeBounds(rooms);

  let best = null;
  let bestScore = -Infinity;

  for (let x = bounds.minX; x <= bounds.maxX + EPSILON; x += gridStep) {
    for (let y = bounds.minY; y <= bounds.maxY + EPSILON; y += gridStep) {
      const point = { x, y };
      const room = findRoomContaining(rooms, point);
      if (!room || WET_ROOM_TYPES.has(room.type)) continue;

      if (constraints.excludeNearPoint) {
        const radius = constraints.excludeRadius ?? 0;
        if (distance(x, y, constraints.excludeNearPoint.x, constraints.excludeNearPoint.y) < radius) continue;
      }

      const router = role === "repeater" ? otherPoint : point;
      const repeater = role === "repeater" ? point : otherPoint;

      const summaries = evaluateRooms(livableRooms, walls, router, repeater, band, { reflections: true });
      const minRssi = Math.min(...summaries.map((s) => s.rssi_dbm));

      if (minRssi > bestScore) {
        bestScore = minRssi;
        best = point;
      }
    }
  }

  if (!best) throw new Error("no valid candidate position found");
  return { point: best, minRssi: bestScore };
}

/**
 * 間取り全体をシミュレーションし、部屋ごとの評価とボトルネックを決定する
 * 配置提案(suggested_router_pos / suggested_repeater_pos)は含まない。
 * 提案の要否・しきい値判定・費用表示は担当D「提案ロジック」の責務であり、
 * Dが本関数の結果と findOptimalPosition を組み合わせて決定する。
 * @param {import('./types.js').RoomLayout} roomLayout
 * @returns {Omit<import('./types.js').SimulationResult, 'suggested_router_pos'|'suggested_repeater_pos'>}
 */
export function runSimulation(roomLayout) {
  const { rooms, walls, router, repeater, environment } = roomLayout;

  const livableRooms = rooms.filter((r) => !EXCLUDED_FROM_DIAGNOSIS.has(r.type));
  const roomSummaries = evaluateRooms(livableRooms, walls, router, repeater, environment.band, {
    reflections: true,
  });
  const worst = roomSummaries.reduce((min, s) => (s.rssi_dbm < min.rssi_dbm ? s : min), roomSummaries[0]);

  const requiredMbps = calculateRequiredBandwidth(environment);
  const routerLimit = ROUTER_LIMIT_MBPS[environment.router_gen];
  const planThroughput = PLAN_THROUGHPUT_MBPS[environment.plan];
  const actualMbps = Math.min(worst.estimated_mbps, routerLimit, planThroughput);

  const candidates = [
    { key: "radio", value: worst.estimated_mbps },
    { key: "router", value: routerLimit },
    { key: "plan", value: planThroughput },
  ];
  const limiting = candidates.reduce((min, c) => (c.value < min.value ? c : min));
  const bottleneck = limiting.value < requiredMbps ? limiting.key : "none";

  return {
    room_summaries: roomSummaries,
    worst_room_id: worst.room_id,
    worst_rssi_dbm: worst.rssi_dbm,
    required_mbps: requiredMbps,
    actual_mbps: actualMbps,
    bottleneck,
    is_simulation: true,
  };
}
