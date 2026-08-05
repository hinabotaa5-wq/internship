// ヒートマップ表示と提案（UIに依存しない純粋関数群）
// Canvas描画・DOMイベント処理はテンプレート側で行う。ここでは描画に必要なデータと
// 提案ロジックのみを提供する。計算は必ず engine.js の関数を呼ぶ（式を複製しない）。

import { calculateRssiAt, findOptimalPosition, runSimulation } from "./engine.js";

// 弱→強のカラースケール。-90dBm〜-42dBmの範囲に等間隔で対応させる
const COLOR_STOPS = [
  { rssi: -90, hex: "#0C1826" },
  { rssi: -82, hex: "#123A5C" },
  { rssi: -74, hex: "#1A6B87" },
  { rssi: -66, hex: "#2FA189" },
  { rssi: -58, hex: "#94CC79" },
  { rssi: -50, hex: "#F0CB68" },
  { rssi: -42, hex: "#FFF6D6" },
];

const REPEATER_EXCLUDE_RADIUS_M = 2;
const UPGRADE_ROUTER_COST_YEN = 330;
const ADD_REPEATER_COST_YEN = 550;

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function rgbToHex(r, g, b) {
  const toHex = (v) => Math.round(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * RSSI(dBm)をヒートマップの色（弱→強の7段階カラースケール）に変換する
 * -90dBm〜-42dBmの範囲にマッピングする
 * @param {number} rssi
 * @returns {string} "#rrggbb"
 */
export function rssiToColor(rssi) {
  const clamped = Math.min(Math.max(rssi, COLOR_STOPS[0].rssi), COLOR_STOPS[COLOR_STOPS.length - 1].rssi);

  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const lower = COLOR_STOPS[i];
    const upper = COLOR_STOPS[i + 1];
    if (clamped >= lower.rssi && clamped <= upper.rssi) {
      const ratio = (clamped - lower.rssi) / (upper.rssi - lower.rssi);
      const [r0, g0, b0] = hexToRgb(lower.hex);
      const [r1, g1, b1] = hexToRgb(upper.hex);
      return rgbToHex(r0 + (r1 - r0) * ratio, g0 + (g1 - g0) * ratio, b0 + (b1 - b0) * ratio);
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1].hex;
}

/**
 * 指定した地点(m単位)がどの部屋に属するかを返す（タップ地点の吹き出し用）
 * @param {import('./types.js').Room[]} rooms
 * @param {import('./types.js').Point} point
 * @returns {string|null} room_id。部屋の外はnull
 */
export function findRoomIdAt(rooms, point) {
  const room = rooms.find(
    (r) => point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height
  );
  return room ? room.id : null;
}

function computeBounds(rooms) {
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.width));
  const maxY = Math.max(...rooms.map((r) => r.y + r.height));
  return { minX, minY, maxX, maxY };
}

/**
 * ヒートマップ用の格子データを生成する（部屋の内側のみ、外側はセルを持たない）
 * @param {import('./types.js').RoomLayout} roomLayout
 * @param {{cols: number, rows: number, reflections: boolean}} options - colsは横方向のセル数(例:48/96)、rowsは縦方向(例:32/64)
 * @returns {import('./types.js').HeatmapGrid}
 */
export function buildHeatmapGrid(roomLayout, options) {
  const { rooms, walls, router, repeater, environment } = roomLayout;
  const { cols, rows, reflections } = options;
  const bounds = computeBounds(rooms);
  const cellWidth = (bounds.maxX - bounds.minX) / cols;
  const cellHeight = (bounds.maxY - bounds.minY) / rows;

  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const point = {
        x: bounds.minX + (col + 0.5) * cellWidth,
        y: bounds.minY + (row + 0.5) * cellHeight,
      };
      const roomId = findRoomIdAt(rooms, point);
      if (!roomId) continue; // 部屋の内側だけを塗る。外側は塗らない

      const rssi = calculateRssiAt(point, walls, router, repeater, environment.band, { reflections });
      cells.push({ x: point.x, y: point.y, rssi_dbm: rssi, color: rssiToColor(rssi), room_id: roomId });
    }
  }

  return { cells, cols, rows };
}

/**
 * 診断結果から改善提案を1件決定する（提案ロジックの表を上から順に判定し、最初に当てはまったものだけ返す）
 * @param {import('./types.js').RoomLayout} roomLayout
 * @param {import('./types.js').SimulationResult} simulationResult - engine.runSimulation()の結果（suggested_*は未設定でよい）
 * @returns {import('./types.js').Suggestion}
 */
export function buildSuggestion(roomLayout, simulationResult) {
  const { rooms, walls, router, repeater, environment } = roomLayout;
  const worstRssi = simulationResult.worst_rssi_dbm;

  // ボトルネックの種類は engine.runSimulation() が算出済み（最弱居室の速度・ルーター上限・
  // プラン実効値のうち最小のものと必要帯域を比較した結果）。ここで再判定・複製しない。
  // 移動/設置候補が有効かも、同じ runSimulation() を候補位置で再実行し bottleneck が
  // 解消するかで判定する（固定dBmしきい値を別途持たない）。
  if (simulationResult.bottleneck === "radio") {
    const routerMove = findOptimalPosition(rooms, walls, environment.band, {
      role: "router",
      otherPoint: repeater,
    });
    const afterRouterMove = runSimulation({ rooms, walls, router: routerMove.point, repeater, environment });

    if (afterRouterMove.bottleneck !== "radio") {
      return {
        kind: "move_router",
        message: `親機を(${routerMove.point.x.toFixed(1)}, ${routerMove.point.y.toFixed(1)})へ移動すると直ります（無料）`,
        is_free: true,
        monthly_cost_yen: null,
        before_rssi_dbm: worstRssi,
        after_rssi_dbm: routerMove.minRssi,
        target_position: routerMove.point,
      };
    }

    const repeaterPlacement = findOptimalPosition(rooms, walls, environment.band, {
      role: "repeater",
      otherPoint: router,
      excludeNearPoint: router,
      excludeRadius: REPEATER_EXCLUDE_RADIUS_M,
    });
    const afterRepeater = runSimulation({
      rooms,
      walls,
      router,
      repeater: repeaterPlacement.point,
      environment,
    });

    if (afterRepeater.bottleneck !== "radio") {
      return {
        kind: "add_repeater",
        message: `(${repeaterPlacement.point.x.toFixed(1)}, ${repeaterPlacement.point.y.toFixed(1)})に中継機を置くと直ります`,
        is_free: false,
        monthly_cost_yen: ADD_REPEATER_COST_YEN,
        before_rssi_dbm: worstRssi,
        after_rssi_dbm: repeaterPlacement.minRssi,
        target_position: repeaterPlacement.point,
      };
    }

    return {
      kind: "onsite_support",
      message: "訪問サポートの予約をご検討ください",
      is_free: false,
      monthly_cost_yen: null,
      before_rssi_dbm: worstRssi,
      after_rssi_dbm: null,
      target_position: null,
    };
  }

  // 電波は足りている。ルーター上限・プランがボトルネックかどうかは
  // engine.runSimulation() が返す bottleneck（ルーター上限/プラン実効値と
  // 必要帯域の比較を内部で行った結果）を用いる。ここで上限値テーブルを複製しない。
  if (simulationResult.bottleneck === "router") {
    return {
      kind: "upgrade_router",
      message: `ルーターの世代が原因です。Wi-Fi 6への交換をご検討ください（月額${UPGRADE_ROUTER_COST_YEN}円）`,
      is_free: false,
      monthly_cost_yen: UPGRADE_ROUTER_COST_YEN,
      before_rssi_dbm: null,
      after_rssi_dbm: null,
      target_position: null,
    };
  }

  if (simulationResult.bottleneck === "plan") {
    return {
      kind: "upgrade_plan",
      message: "10ギガプランへの変更をご検討ください",
      is_free: false,
      monthly_cost_yen: null,
      before_rssi_dbm: null,
      after_rssi_dbm: null,
      target_position: null,
    };
  }

  return {
    kind: "sufficient",
    message: "今のままで十分です。追加のご契約は必要ありません",
    is_free: true,
    monthly_cost_yen: null,
    before_rssi_dbm: null,
    after_rssi_dbm: null,
    target_position: null,
  };
}
