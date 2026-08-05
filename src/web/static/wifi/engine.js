// 電波計算エンジン（UIに依存しない純粋関数群）

const BAND_PARAMS = {
  "5GHz": { p0: -44, n: 2.2, wallCoef: 1.5 },
  "2.4GHz": { p0: -38, n: 2.0, wallCoef: 1.0 },
};

const WALL_ATTENUATION_BASE = { exterior: 11, partition: 3, wet: 8 };
const REFLECTION_LOSS_BASE = { exterior: 4, partition: 7, wet: 6 };

const WET_ROOM_TYPES = new Set(["キッチン", "洗面", "浴室", "トイレ"]);
const EXCLUDED_FROM_DIAGNOSIS = new Set(["トイレ", "浴室", "玄関", "廊下"]);

const USAGE_MBPS = { video: 25, conference: 15, game: 30, remoteWork: 10 };

const ROUTER_LIMIT_MBPS = { 4: 100, 5: 400, 6: 900 };
const PLAN_THROUGHPUT_MBPS = { "1G": 500, "10G": 2500 };

const THROUGHPUT_TABLE = {
  "5GHz": [
    [-92, 0],
    [-85, 5],
    [-78, 40],
    [-73, 110],
    [-68, 230],
    [-62, 420],
    [-55, 620],
    [-45, 880],
  ],
  "2.4GHz": [
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

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function wallLength(wall) {
  return distance(wall.start, wall.end);
}

function powerSumDb(dbValues) {
  if (dbValues.length === 0) return -Infinity;
  const totalPower = dbValues.reduce((sum, db) => sum + 10 ** (db / 10), 0);
  return 10 * Math.log10(totalPower);
}

// 2線分 (p1,p2) と (p3,p4) の交点を返す。交差しなければ null。
function segmentIntersection(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < EPSILON) return null; // 平行

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;

  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;

  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

function isPointWithinDoorOpening(wall, point) {
  if (!wall.doorOpening) return false;
  const distFromStart = distance(wall.start, point);
  return (
    distFromStart >= wall.doorOpening.start - EPSILON &&
    distFromStart <= wall.doorOpening.end + EPSILON
  );
}

function wallsCrossed(txPoint, evalPoint, walls, excludeWall) {
  const crossed = [];
  for (const wall of walls) {
    if (wall === excludeWall) continue;
    const intersection = segmentIntersection(txPoint, evalPoint, wall.start, wall.end);
    if (!intersection) continue;
    if (isPointWithinDoorOpening(wall, intersection)) continue;
    crossed.push(wall);
  }
  return crossed;
}

function directRssi(txPoint, evalPoint, walls, band, excludeWall) {
  const { p0, n, wallCoef } = BAND_PARAMS[band];
  const d = Math.max(distance(txPoint, evalPoint), 0.6);
  const pathLoss = 10 * n * Math.log10(d);
  const crossed = wallsCrossed(txPoint, evalPoint, walls, excludeWall);
  const wallLoss = crossed.reduce((sum, w) => sum + WALL_ATTENUATION_BASE[w.kind] * wallCoef, 0);
  return p0 - pathLoss - wallLoss;
}

// 反射に使う壁: 長さ1.5m以上のうち長い順に最大8枚（外壁を優先）
function selectReflectionWalls(walls) {
  return walls
    .filter((w) => wallLength(w) >= 1.5)
    .slice()
    .sort((a, b) => {
      const lenDiff = wallLength(b) - wallLength(a);
      if (Math.abs(lenDiff) > EPSILON) return lenDiff;
      const aExterior = a.kind === "exterior" ? 0 : 1;
      const bExterior = b.kind === "exterior" ? 0 : 1;
      return aExterior - bExterior;
    })
    .slice(0, 8);
}

function mirrorPoint(point, wall) {
  const isVertical = Math.abs(wall.start.x - wall.end.x) < EPSILON;
  const isHorizontal = Math.abs(wall.start.y - wall.end.y) < EPSILON;
  if (isVertical) {
    return { x: 2 * wall.start.x - point.x, y: point.y };
  }
  if (isHorizontal) {
    return { x: point.x, y: 2 * wall.start.y - point.y };
  }
  throw new Error("wall must be axis-aligned");
}

function reflectedPathsForTransmitter(txPoint, evalPoint, walls, band) {
  const candidates = selectReflectionWalls(walls);
  const paths = [];
  for (const wall of candidates) {
    const mirrored = mirrorPoint(txPoint, wall);
    const intersection = segmentIntersection(mirrored, evalPoint, wall.start, wall.end);
    if (!intersection) continue; // 反射点が壁の外 -> 成立しない
    if (isPointWithinDoorOpening(wall, intersection)) continue;
    const rssi = directRssi(mirrored, evalPoint, walls, band, wall) - REFLECTION_LOSS_BASE[wall.kind];
    paths.push(rssi);
  }
  return paths;
}

function transmitterOwnRssi(tx, evalPoint, walls, band, reflections) {
  const paths = [directRssi(tx.position, evalPoint, walls, band, null)];
  if (reflections) {
    paths.push(...reflectedPathsForTransmitter(tx.position, evalPoint, walls, band));
  }
  return powerSumDb(paths);
}

/**
 * 1点における合成RSSIを計算する（直接波 + 反射波、複数送信機の電力和）
 * @param {import('./types.js').Point} point
 * @param {import('./types.js').Transmitter[]} transmitters
 * @param {import('./types.js').Wall[]} walls
 * @param {import('./types.js').Band} band
 * @param {{reflections: boolean}} options
 * @returns {number} RSSI (dBm)
 */
export function calculateRssiAt(point, transmitters, walls, band, options = {}) {
  const reflections = Boolean(options.reflections);
  const router = transmitters.find((t) => t.role === "router");
  const repeater = transmitters.find((t) => t.role === "repeater");
  if (!router) throw new Error("router transmitter is required");

  const routerDb = transmitterOwnRssi(router, point, walls, band, reflections);
  if (!repeater) return routerDb;

  const rssiAtRepeaterFromRouter = transmitterOwnRssi(router, repeater.position, walls, band, reflections);
  const penalty = 4 + Math.max(0, (-58 - rssiAtRepeaterFromRouter) * 0.6);
  const repeaterDb = transmitterOwnRssi(repeater, point, walls, band, reflections) - penalty;

  // 反射を考慮する場合は電力和、しない場合は大きい方を採用する
  return reflections ? powerSumDb([routerDb, repeaterDb]) : Math.max(routerDb, repeaterDb);
}

/**
 * RSSIから実効速度(Mbps)を線形補間で求める
 * @param {number} rssi
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
 * 部屋ごとのRSSI・実効速度を評価する（3x3代表点の平均）
 * @param {import('./types.js').Room[]} rooms
 * @param {import('./types.js').Transmitter[]} transmitters
 * @param {import('./types.js').Wall[]} walls
 * @param {import('./types.js').Band} band
 * @param {{reflections: boolean}} options
 * @returns {import('./types.js').RoomEvaluation[]}
 */
export function evaluateRooms(rooms, transmitters, walls, band, options = {}) {
  return rooms.map((room) => {
    const samples = [];
    for (const fx of [0.25, 0.5, 0.75]) {
      for (const fy of [0.25, 0.5, 0.75]) {
        samples.push({ x: room.x + room.width * fx, y: room.y + room.depth * fy });
      }
    }
    const rssiValues = samples.map((p) => calculateRssiAt(p, transmitters, walls, band, options));
    const rssi = rssiValues.reduce((sum, v) => sum + v, 0) / rssiValues.length;
    return { roomId: room.id, rssi, throughput: rssiToThroughput(rssi, band) };
  });
}

/**
 * 必要帯域(Mbps)を算出する
 * @param {import('./types.js').DeviceConfig} deviceConfig
 * @returns {number} Mbps
 */
export function calculateRequiredBandwidth(deviceConfig) {
  const usageSum = deviceConfig.usages.reduce((sum, usage) => sum + (USAGE_MBPS[usage] ?? 0), 0);
  return (5 + usageSum) * deviceConfig.householdSize * 0.7;
}

function computeBounds(rooms) {
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.width));
  const maxY = Math.max(...rooms.map((r) => r.y + r.depth));
  return { minX, minY, maxX, maxY };
}

function findRoomContaining(rooms, point) {
  return rooms.find(
    (r) =>
      point.x >= r.x - EPSILON &&
      point.x <= r.x + r.width + EPSILON &&
      point.y >= r.y - EPSILON &&
      point.y <= r.y + r.depth + EPSILON
  );
}

/**
 * 親機/中継機の最適位置を探索する（居室内で最も弱い部屋のRSSIを最大化する点）
 * @param {import('./types.js').Room[]} rooms
 * @param {import('./types.js').Wall[]} walls
 * @param {import('./types.js').Transmitter[]} existingTransmitters
 * @param {import('./types.js').Band} band
 * @param {{excludeNearPoint?: import('./types.js').Point, excludeRadius?: number}} constraints
 * @returns {{point: import('./types.js').Point, minRssi: number}}
 */
export function findOptimalPosition(rooms, walls, existingTransmitters, band, constraints = {}) {
  const livableRooms = rooms.filter((r) => !EXCLUDED_FROM_DIAGNOSIS.has(r.type));
  if (livableRooms.length === 0) throw new Error("no livable rooms to evaluate");

  const role = existingTransmitters.some((t) => t.role === "router") ? "repeater" : "router";
  const bounds = computeBounds(rooms);
  const step = 0.6;

  let best = null;
  let bestScore = -Infinity;

  for (let x = bounds.minX; x <= bounds.maxX + EPSILON; x += step) {
    for (let y = bounds.minY; y <= bounds.maxY + EPSILON; y += step) {
      const point = { x, y };
      const room = findRoomContaining(rooms, point);
      if (!room || WET_ROOM_TYPES.has(room.type)) continue;

      if (constraints.excludeNearPoint) {
        const radius = constraints.excludeRadius ?? 0;
        if (distance(point, constraints.excludeNearPoint) < radius) continue;
      }

      const candidateTransmitters = [...existingTransmitters, { id: "__candidate__", role, position: point }];
      const evaluations = evaluateRooms(livableRooms, candidateTransmitters, walls, band, { reflections: true });
      const minRssi = Math.min(...evaluations.map((e) => e.rssi));

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
 * 間取り全体を診断し、ボトルネックと打ち手を決定する
 * @param {import('./types.js').Room[]} rooms
 * @param {import('./types.js').Wall[]} walls
 * @param {import('./types.js').Transmitter[]} transmitters
 * @param {import('./types.js').DeviceConfig} deviceConfig
 * @returns {import('./types.js').DiagnosisResult}
 */
export function diagnose(rooms, walls, transmitters, deviceConfig) {
  const livableRooms = rooms.filter((r) => !EXCLUDED_FROM_DIAGNOSIS.has(r.type));
  const roomEvaluations = evaluateRooms(livableRooms, transmitters, walls, deviceConfig.band, {
    reflections: true,
  });
  const weakest = roomEvaluations.reduce((min, e) => (e.rssi < min.rssi ? e : min), roomEvaluations[0]);

  const router = transmitters.find((t) => t.role === "router");
  const requiredBandwidth = calculateRequiredBandwidth(deviceConfig);
  const routerLimit = ROUTER_LIMIT_MBPS[deviceConfig.routerGeneration];
  const planThroughput = PLAN_THROUGHPUT_MBPS[deviceConfig.plan];
  const actualThroughput = Math.min(weakest.throughput, routerLimit, planThroughput);

  let bottleneck = "none";
  let action = {
    kind: "sufficient",
    description: "今の環境で十分です。追加のご契約は必要ありません",
    before: null,
    after: null,
  };

  if (weakest.rssi < -66) {
    const routerSearchTransmitters = transmitters.filter((t) => t.role !== "router");
    const routerMove = findOptimalPosition(rooms, walls, routerSearchTransmitters, deviceConfig.band, {});

    if (routerMove.minRssi >= -66) {
      bottleneck = "wifi";
      action = {
        kind: "move_router",
        description: `親機を(${routerMove.point.x.toFixed(1)}, ${routerMove.point.y.toFixed(1)})へ移動すると直ります（無料）`,
        before: weakest.rssi,
        after: routerMove.minRssi,
      };
    } else {
      const repeaterSearchTransmitters = transmitters.filter((t) => t.role !== "repeater");
      const repeaterPlacement = findOptimalPosition(rooms, walls, repeaterSearchTransmitters, deviceConfig.band, {
        excludeNearPoint: router.position,
        excludeRadius: 2,
      });

      if (repeaterPlacement.minRssi >= -68) {
        bottleneck = "wifi";
        action = {
          kind: "add_repeater",
          description: `(${repeaterPlacement.point.x.toFixed(1)}, ${repeaterPlacement.point.y.toFixed(1)})に中継機を置くと直ります。メッシュWi-Fi中継機（月額550円）`,
          before: weakest.rssi,
          after: repeaterPlacement.minRssi,
        };
      } else {
        bottleneck = "wifi";
        action = {
          kind: "onsite_support",
          description: "訪問サポートの予約をご検討ください",
          before: weakest.rssi,
          after: null,
        };
      }
    }
  } else if (routerLimit < requiredBandwidth) {
    bottleneck = "router";
    action = {
      kind: "upgrade_router",
      description: "ルーターの世代が原因です。Wi-Fi 6への交換（月額330円）をご検討ください",
      before: null,
      after: null,
    };
  } else if (planThroughput < requiredBandwidth) {
    bottleneck = "plan";
    action = {
      kind: "upgrade_plan",
      description: "10ギガプランへの変更をご検討ください",
      before: null,
      after: null,
    };
  }

  return { roomEvaluations, bottleneck, actualThroughput, requiredBandwidth, action };
}
