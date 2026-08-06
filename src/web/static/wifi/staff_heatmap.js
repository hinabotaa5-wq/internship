// コールセンター向け問い合わせ照会画面のヒートマップ描画（読み取り専用）。
//
// 計算は engine.js / heatmap.js の純粋関数を、座標変換は floorplan_view.js を
// そのまま利用する（担当D・担当Bのロジックを複製しない / 仕様書 規則6）。
// ここで新しく書くのは「保存済みのroom_layoutを一度だけ描く」ための描画処理のみ。
// ドラッグ操作・保存・環境設定フォームは持たない（画面4はユーザー側の担当）。

import { layoutBounds } from "./layout.js";
import { runSimulation } from "./engine.js";
import { buildHeatmapGrid, buildSuggestion } from "./heatmap.js";
import { computeViewport, prepareCanvas, toPixels } from "./floorplan_view.js";

export const LEVEL_TEXT = {
  strong: "とても強い",
  good: "じゅうぶん",
  weak: "弱い",
  poor: "ほとんど届かない",
};

const CANVAS_ASPECT = 0.75;
const GRID = { cols: 72, rows: 48 };

const BOARD_COLOR = "#0b1524";
const ROOM_EDGE = "rgba(255,255,255,0.22)";
const TEXT_ON_BOARD = "#ffffff";
const TEXT_HALO = "rgba(11,21,36,0.85)";
const WALL_STYLE_ON_BOARD = {
  concrete: { color: "#e8eefb", width: 5 },
  wood: { color: "#93a4c2", width: 3 },
  water: { color: "#5fc7e3", width: 3 },
};
const DOOR_COLOR = "rgba(255,255,255,0.35)";
const COLOR_ROUTER = "#1e5fd9";
const COLOR_REPEATER = "#e08a1e";

function drawCells(ctx, viewport, rooms, grid) {
  const bounds = layoutBounds(rooms);
  const cellW = (bounds.width / grid.cols) * viewport.scale;
  const cellH = (bounds.height / grid.rows) * viewport.scale;
  const width = Math.ceil(cellW) + 1;
  const height = Math.ceil(cellH) + 1;

  for (const cell of grid.cells) {
    const center = toPixels(viewport, cell);
    ctx.fillStyle = cell.color;
    ctx.fillRect(Math.floor(center.x - cellW / 2), Math.floor(center.y - cellH / 2), width, height);
  }
}

function drawRooms(ctx, viewport, rooms, summaries) {
  for (const room of rooms) {
    const topLeft = toPixels(viewport, room);
    const width = room.width * viewport.scale;
    const height = room.height * viewport.scale;

    ctx.strokeStyle = ROOM_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, width - 1, height - 1);

    if (width < 52 || height < 30) continue;

    const centerX = topLeft.x + width / 2;
    const centerY = topLeft.y + height / 2;
    const summary = summaries.find((item) => item.room_id === room.id) ?? null;
    const canStack = height >= 50 && summary !== null;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = TEXT_HALO;
    ctx.lineWidth = 3;
    ctx.fillStyle = TEXT_ON_BOARD;

    ctx.font = "600 13px system-ui, sans-serif";
    const nameY = canStack ? centerY - 12 : centerY;
    ctx.strokeText(room.name, centerX, nameY, width - 8);
    ctx.fillText(room.name, centerX, nameY, width - 8);

    if (!canStack) continue;
    ctx.font = "12px system-ui, sans-serif";
    const levelText = LEVEL_TEXT[summary.level];
    ctx.strokeText(levelText, centerX, nameY + 16, width - 8);
    ctx.fillText(levelText, centerX, nameY + 16, width - 8);
  }
}

function drawWall(ctx, viewport, wall) {
  const style = WALL_STYLE_ON_BOARD[wall.material] ?? WALL_STYLE_ON_BOARD.wood;
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

  ctx.strokeStyle = DOOR_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(doorStart.x, doorStart.y);
  ctx.lineTo(doorEnd.x, doorEnd.y);
  ctx.stroke();
  ctx.restore();
}

function drawTransmitter(ctx, viewport, point, kind) {
  const center = toPixels(viewport, point);
  const color = kind === "repeater" ? COLOR_REPEATER : COLOR_ROUTER;
  const radius = 11;

  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillText(kind === "repeater" ? "中" : "親", center.x, center.y + 0.5);

  const above = center.y - radius - 3 > 14;
  const labelY = above ? center.y - radius - 3 : center.y + radius + 3;
  const label = kind === "repeater" ? "中継機" : "親機";
  ctx.textBaseline = above ? "bottom" : "top";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.lineJoin = "round";
  ctx.strokeStyle = TEXT_HALO;
  ctx.lineWidth = 3;
  ctx.strokeText(label, center.x, labelY);
  ctx.fillStyle = TEXT_ON_BOARD;
  ctx.fillText(label, center.x, labelY);
  ctx.restore();
}

/**
 * 問い合わせの room_layout から読み取り専用のヒートマップを描画する。
 * @param {HTMLCanvasElement} canvas
 * @param {import('./types.js').RoomLayout} roomLayout
 * @returns {{simulation: import('./types.js').SimulationResult, suggestion: import('./types.js').Suggestion}}
 */
export function renderStaffHeatmap(canvas, roomLayout) {
  const { ctx, cssWidth, cssHeight } = prepareCanvas(canvas, CANVAS_ASPECT);
  const viewport = computeViewport(roomLayout.rooms, cssWidth, cssHeight);
  const grid = buildHeatmapGrid(roomLayout, { cols: GRID.cols, rows: GRID.rows, reflections: true });
  const simulation = runSimulation(roomLayout);
  const suggestion = buildSuggestion(roomLayout, simulation);

  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = BOARD_COLOR;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  drawCells(ctx, viewport, roomLayout.rooms, grid);
  drawRooms(ctx, viewport, roomLayout.rooms, simulation.room_summaries);
  for (const wall of roomLayout.walls) drawWall(ctx, viewport, wall);
  if (roomLayout.repeater) drawTransmitter(ctx, viewport, roomLayout.repeater, "repeater");
  drawTransmitter(ctx, viewport, roomLayout.router, "router");

  return { simulation, suggestion };
}
