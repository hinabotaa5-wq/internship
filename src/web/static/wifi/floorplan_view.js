// 間取りのCanvas描画（担当B）
//
// 描画だけを担当する。UIイベントの処理・データの生成は行わない（layout.js / 各ページ側の責務）。
// メートル座標 <-> ピクセル座標の変換はこのモジュールの内部で完結させ、
// ピクセル座標を外（セッション・API）へ出さない（仕様書 規則2）。

import { SNAP_M, describeRoomSize, layoutBounds } from "./layout.js";

/** devicePixelRatio の上限（高解像度端末で描画コストが跳ねないように抑える） */
const MAX_PIXEL_RATIO = 2;
/** 間取りの外側に取る余白(px) */
const MARGIN_PX = 18;

// 部屋の塗り分け。ライトテーマのみ（仕様書2章）
const ROOM_FILL = {
  ldk: "#e3edfb",
  bedroom: "#e9f0f8",
  room: "#e9f0f8",
  tatami: "#eaf3e6",
  study: "#eef0f8",
  kitchen: "#e2f1f2",
  wash: "#dfeef2",
  bath: "#dfeef2",
  toilet: "#dfeef2",
  entrance: "#f0f1f4",
  hall: "#f5f6f8",
};
const ROOM_FILL_DEFAULT = "#eef2f7";

const WALL_STYLE = {
  concrete: { color: "#1a2b4c", width: 5 },
  wood: { color: "#7c8aa5", width: 3 },
  water: { color: "#2f7f9f", width: 3 },
};

const COLOR_TEXT = "#1a2b4c";
const COLOR_TEXT_WEAK = "#5b6b87";
const COLOR_SELECTED = "#1e5fd9";
const COLOR_GRID = "#e4e9f2";
const COLOR_ROUTER = "#1e5fd9";
const COLOR_REPEATER = "#e08a1e";
const COLOR_INVALID = "#c62828";

/**
 * キャンバスを親要素の幅に合わせ、devicePixelRatio を考慮して解像度を設定する。
 * @param {HTMLCanvasElement} canvas
 * @param {number} aspectRatio - 高さ/幅
 * @returns {{ctx: CanvasRenderingContext2D, cssWidth: number, cssHeight: number}}
 */
export function prepareCanvas(canvas, aspectRatio) {
  const cssWidth = Math.max(240, canvas.clientWidth || canvas.parentElement.clientWidth);
  const cssHeight = Math.round(cssWidth * aspectRatio);
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, cssWidth, cssHeight };
}

/**
 * 間取りがキャンバスに収まるような表示倍率と原点を求める
 * @param {import('./types.js').Room[]} rooms
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @returns {{scale: number, originX: number, originY: number}}
 */
export function computeViewport(rooms, cssWidth, cssHeight) {
  const bounds = layoutBounds(rooms);
  const drawableWidth = Math.max(1, cssWidth - MARGIN_PX * 2);
  const drawableHeight = Math.max(1, cssHeight - MARGIN_PX * 2);
  const scale = Math.min(drawableWidth / Math.max(bounds.width, 1), drawableHeight / Math.max(bounds.height, 1));

  return {
    scale,
    originX: (cssWidth - bounds.width * scale) / 2 - bounds.min_x * scale,
    originY: (cssHeight - bounds.height * scale) / 2 - bounds.min_y * scale,
  };
}

/**
 * メートル座標をキャンバス上のピクセル座標へ変換する
 * @param {{scale: number, originX: number, originY: number}} viewport
 * @param {import('./types.js').Point} point
 * @returns {{x: number, y: number}}
 */
export function toPixels(viewport, point) {
  return { x: viewport.originX + point.x * viewport.scale, y: viewport.originY + point.y * viewport.scale };
}

/**
 * ポインタ位置（キャンバス左上基準のCSSピクセル）をメートル座標へ変換する
 * @param {{scale: number, originX: number, originY: number}} viewport
 * @param {{x: number, y: number}} pixel
 * @returns {import('./types.js').Point}
 */
export function toMeters(viewport, pixel) {
  return { x: (pixel.x - viewport.originX) / viewport.scale, y: (pixel.y - viewport.originY) / viewport.scale };
}

/**
 * イベントからキャンバス内のCSSピクセル座標を取り出す
 * @param {HTMLCanvasElement} canvas
 * @param {PointerEvent|MouseEvent} event
 * @returns {{x: number, y: number}}
 */
export function eventToCanvasPixel(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function drawGrid(ctx, viewport, rooms, cssWidth, cssHeight) {
  const bounds = layoutBounds(rooms);
  ctx.save();
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  // 0.5m格子は細かすぎて潰れる場合があるので、線の間隔が6px未満なら1m格子にする
  const stepM = viewport.scale * SNAP_M < 6 ? SNAP_M * 2 : SNAP_M;

  for (let x = bounds.min_x; x <= bounds.max_x + 1e-6; x += stepM) {
    const px = toPixels(viewport, { x, y: 0 }).x;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, cssHeight);
    ctx.stroke();
  }
  for (let y = bounds.min_y; y <= bounds.max_y + 1e-6; y += stepM) {
    const py = toPixels(viewport, { x: 0, y }).y;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(cssWidth, py);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoom(ctx, viewport, room, options) {
  const topLeft = toPixels(viewport, room);
  const width = room.width * viewport.scale;
  const height = room.height * viewport.scale;

  ctx.fillStyle = ROOM_FILL[room.type] ?? ROOM_FILL_DEFAULT;
  ctx.fillRect(topLeft.x, topLeft.y, width, height);

  if (options.isSelected) {
    ctx.save();
    ctx.strokeStyle = options.isInvalid ? COLOR_INVALID : COLOR_SELECTED;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(topLeft.x + 1.5, topLeft.y + 1.5, width - 3, height - 3);
    ctx.restore();
  }

  // 狭い画面では入りきらない情報を省く（文字を小さくして詰め込まない）
  if (width < 46 || height < 26) return;

  const centerX = topLeft.x + width / 2;
  const centerY = topLeft.y + height / 2;
  const canStack = height >= 46;
  // 機器のマーカーは部屋の中央付近に来るので、重なる画面では部屋名を上寄せにする
  const nameY = canStack ? (options.labelAtTop ? topLeft.y + 15 : centerY - 8) : centerY;

  ctx.fillStyle = COLOR_TEXT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillText(room.name, centerX, nameY, width - 8);
  if (!canStack) return;

  ctx.fillStyle = COLOR_TEXT_WEAK;
  ctx.font = "12px system-ui, sans-serif";
  const size = describeRoomSize(room);
  ctx.fillText(`${size.tatami}畳`, centerX, nameY + 17, width - 8);
}

function drawWall(ctx, viewport, wall) {
  const style = WALL_STYLE[wall.material] ?? WALL_STYLE.wood;
  const start = toPixels(viewport, { x: wall.x1, y: wall.y1 });
  const end = toPixels(viewport, { x: wall.x2, y: wall.y2 });

  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineCap = "butt";

  if (!wall.door) {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // ドアの開口ぶんは壁を描かず、開口位置に細い線を引いて「出入りできる」ことを示す
  const lengthM = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const ux = (end.x - start.x) / lengthM;
  const uy = (end.y - start.y) / lengthM;
  const doorStart = { x: start.x + ux * wall.door.start, y: start.y + uy * wall.door.start };
  const doorEnd = { x: start.x + ux * wall.door.end, y: start.y + uy * wall.door.end };

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(doorStart.x, doorStart.y);
  ctx.moveTo(doorEnd.x, doorEnd.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.strokeStyle = "#b9c4d6";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(doorStart.x, doorStart.y);
  ctx.lineTo(doorEnd.x, doorEnd.y);
  ctx.stroke();
  ctx.restore();
}

function drawTransmitter(ctx, viewport, point, kind, options = {}) {
  const center = toPixels(viewport, point);
  const color = kind === "repeater" ? COLOR_REPEATER : COLOR_ROUTER;
  const radius = 11;

  ctx.save();
  if (options.isSelected) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius + 7, 0, Math.PI * 2);
    ctx.fillStyle = kind === "repeater" ? "rgba(224,138,30,0.18)" : "rgba(30,95,217,0.18)";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(kind === "repeater" ? "中" : "親", center.x, center.y + 0.5);

  // 名札は原則マーカーの上。上端に近いときは下へ回して画面外に出さない
  const above = center.y - radius - 3 > 14;
  const labelY = above ? center.y - radius - 3 : center.y + radius + 3;
  const label = kind === "repeater" ? "中継機" : "親機";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textBaseline = above ? "bottom" : "top";
  // 部屋名や壁と重なっても読めるように白フチを付ける
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeText(label, center.x, labelY);
  ctx.fillStyle = COLOR_TEXT;
  ctx.fillText(label, center.x, labelY);
  ctx.restore();
}

/**
 * 間取り一式を描画する
 * @param {CanvasRenderingContext2D} ctx
 * @param {{scale: number, originX: number, originY: number}} viewport
 * @param {{rooms: import('./types.js').Room[], walls: import('./types.js').Wall[], router: import('./types.js').Point|null, repeater: import('./types.js').Point|null}} layout
 * @param {{cssWidth: number, cssHeight: number, selectedRoomId?: string|null, isInvalid?: boolean, showGrid?: boolean, showTransmitters?: boolean, selectedTransmitter?: "router"|"repeater"|null}} options
 */
export function drawFloorplan(ctx, viewport, layout, options) {
  const { cssWidth, cssHeight } = options;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  if (layout.rooms.length === 0) {
    ctx.fillStyle = COLOR_TEXT_WEAK;
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ひな形を選ぶか、部屋を追加してください", cssWidth / 2, cssHeight / 2);
    return;
  }

  if (options.showGrid !== false) drawGrid(ctx, viewport, layout.rooms, cssWidth, cssHeight);

  for (const room of layout.rooms) {
    drawRoom(ctx, viewport, room, {
      isSelected: room.id === options.selectedRoomId,
      isInvalid: Boolean(options.isInvalid) && room.id === options.selectedRoomId,
      labelAtTop: Boolean(options.showTransmitters),
    });
  }

  for (const wall of layout.walls) drawWall(ctx, viewport, wall);

  if (options.showTransmitters) {
    if (layout.repeater) {
      drawTransmitter(ctx, viewport, layout.repeater, "repeater", {
        isSelected: options.selectedTransmitter === "repeater",
      });
    }
    if (layout.router) {
      drawTransmitter(ctx, viewport, layout.router, "router", {
        isSelected: options.selectedTransmitter === "router",
      });
    }
  }
}

/**
 * 機器のマーカーがタップされたか判定する（ピクセル距離で判定する）
 * @param {{scale: number, originX: number, originY: number}} viewport
 * @param {import('./types.js').Point} point - 機器の位置(m)
 * @param {{x: number, y: number}} pixel - タップ位置(px)
 * @returns {boolean}
 */
export function isTransmitterHit(viewport, point, pixel) {
  const center = toPixels(viewport, point);
  return Math.hypot(center.x - pixel.x, center.y - pixel.y) <= 22;
}
