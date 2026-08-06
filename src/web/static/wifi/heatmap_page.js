// 画面4「ヒートマップ表示と改善提案」のUIイベント処理と描画（担当D）
//
// 計算は必ず engine.js（担当C）と heatmap.js（担当D の純粋関数）を呼ぶ。
// RSSIの式・しきい値・費用・ボトルネックの判定はこのファイルに書かない（仕様書 規則6）。
// メートル座標 <-> ピクセル座標の変換は floorplan_view.js の関数を使い、
// ピクセル座標をセッションやAPIへ出さない（規則2）。

import { SNAP_M, buildRoomLayout, findRoomAt, layoutBounds, resolveTransmitterPosition } from "./layout.js";
import { calculateRssiAt, rssiToLevel, runSimulation } from "./engine.js";
import { buildHeatmapGrid, buildSuggestion, findRoomIdAt, rssiToColor } from "./heatmap.js";
import {
  computeViewport,
  eventToCanvasPixel,
  isTransmitterHit,
  prepareCanvas,
  toMeters,
  toPixels,
} from "./floorplan_view.js";

// --- 表示文（IDと表示文を分離する。日本語文字列で分岐しない / 規則3） --------

const LEVEL_TEXT = {
  strong: "とても強い",
  good: "じゅうぶん",
  weak: "弱い",
  poor: "ほとんど届かない",
};

const BOTTLENECK_TEXT = {
  radio: "電波の届きぐあい",
  router: "ルーターの世代",
  plan: "ご契約のプラン",
  none: "なし（足りています）",
};

const TRANSMITTER_TEXT = {
  router: { mark: "親", label: "親機" },
  repeater: { mark: "中", label: "中継機" },
};

/** 提案が場所の変更をともなうかどうか（吹き出しと目印の出し分けに使う） */
const SUGGESTION_WITH_POSITION = new Set(["move_router", "add_repeater"]);

// --- 描画の見た目（ヒートマップだけ暗い盤面。キャンバスの内側のみ / 仕様書2章） ---

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
const COLOR_TARGET = "#ffd166";

const CANVAS_ASPECT = 0.75;
/** 凡例とカラースケールの範囲（-90dBm〜-42dBmの7段 / 描画要件） */
const LEGEND_STEPS = [-90, -82, -74, -66, -58, -50, -42];
/** ドラッグ中の格子（軽さ優先） */
const GRID_COARSE = { cols: 48, rows: 32 };
/** 手を止めているときの格子 */
const GRID_FINE = { cols: 96, rows: 64 };
/** 細かい格子にかけてよい時間(ms)。超えたら以降は粗い格子に落とす（描画要件） */
const FINE_BUDGET_MS = 100;

// --- 要素 -------------------------------------------------------------------

const root = document.getElementById("hm-page");
const canvas = document.getElementById("hm-canvas");
const bubble = document.getElementById("hm-bubble");
const legendEl = document.getElementById("hm-legend");
const legendScaleEl = document.getElementById("hm-legend-scale");
const reflectionsCheckbox = document.getElementById("hm-reflections");
const suggestionEl = document.getElementById("hm-suggestion");
const roomsEl = document.getElementById("hm-rooms");
const roomsNoteEl = document.getElementById("hm-rooms-note");
const peopleSelect = document.getElementById("hm-people");
const usesCheckboxes = Array.from(document.querySelectorAll('input[name="hm-use"]'));
const routerGenSelect = document.getElementById("hm-router-gen");
const planSelect = document.getElementById("hm-plan");
const bandSelect = document.getElementById("hm-band");
const detailsEl = document.getElementById("hm-details");
const detailsBodyEl = document.getElementById("hm-details-body");
const toast = document.getElementById("hm-toast");
const nextButton = document.getElementById("hm-next");

const API_URL = root.dataset.apiUrl;
const NEXT_URL = root.dataset.nextUrl || "";

const initialLayout = JSON.parse(document.getElementById("hm-initial-layout").textContent);

const state = {
  rooms: initialLayout.rooms,
  walls: initialLayout.walls,
  router: initialLayout.router,
  repeater: initialLayout.repeater ?? null,
  environment: initialLayout.environment,
  /** 反射の考慮（確認・デモ用のトグル） */
  reflections: true,
  /** キーボード操作の対象 */
  selected: "router",
  grid: null,
  simulation: null,
  suggestion: null,
  /** タップ地点の吹き出し。{point, pixel, rssi, roomId} */
  tap: null,
  /** 「くわしく」を開いているときだけ数値を出す（受入基準10） */
  showNumbers: false,
  isDragging: false,
  useCoarseGrid: false,
  lastGridMs: null,
};

const drag = { kind: null, pointerId: null };
let viewport = null;
let saveTimer = null;
let recomputeHandle = null;

// --- 共通 -------------------------------------------------------------------

function showToast(message, tone = "error") {
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
}

function hideToast() {
  toast.hidden = true;
}

function currentLayout() {
  return buildRoomLayout(state.rooms, {
    router: state.router,
    repeater: state.repeater,
    environment: state.environment,
  });
}

function gridOptions() {
  const size = state.isDragging || state.useCoarseGrid ? GRID_COARSE : GRID_FINE;
  return { cols: size.cols, rows: size.rows, reflections: state.reflections };
}

function roomById(roomId) {
  return state.rooms.find((room) => room.id === roomId) ?? null;
}

function roomNameAt(point) {
  const room = point ? findRoomAt(state.rooms, point) : null;
  return room ? room.name : null;
}

function formatDbm(value) {
  return `${value.toFixed(1)}dBm`;
}

function formatMbps(value) {
  return `${value.toFixed(1)}Mbps`;
}

// --- 計算（純粋関数の呼び出しに徹する） -------------------------------------

function rebuildGrid() {
  const started = performance.now();
  state.grid = buildHeatmapGrid(currentLayout(), gridOptions());
  state.lastGridMs = performance.now() - started;
  // 端末が遅い場合は以降ずっと粗い格子にする（描画要件「重ければ格子を粗く」）
  if (!state.isDragging && !state.useCoarseGrid && state.lastGridMs > FINE_BUDGET_MS) {
    state.useCoarseGrid = true;
  }
}

function rebuildSimulation() {
  const layout = currentLayout();
  state.simulation = runSimulation(layout);
  state.suggestion = buildSuggestion(layout, state.simulation);
}

// --- 描画 -------------------------------------------------------------------

function drawCells(ctx) {
  if (!state.grid) return;
  const bounds = layoutBounds(state.rooms);
  const cellW = (bounds.width / state.grid.cols) * viewport.scale;
  const cellH = (bounds.height / state.grid.rows) * viewport.scale;
  // 継ぎ目が出ないように1pxだけ広げて塗る
  const width = Math.ceil(cellW) + 1;
  const height = Math.ceil(cellH) + 1;

  for (const cell of state.grid.cells) {
    const center = toPixels(viewport, cell);
    ctx.fillStyle = cell.color;
    ctx.fillRect(Math.floor(center.x - cellW / 2), Math.floor(center.y - cellH / 2), width, height);
  }
}

function drawRooms(ctx) {
  const summaries = state.simulation ? state.simulation.room_summaries : [];
  // 機器の丸い印と部屋名が重なると読めなくなるので、機器がいる部屋は
  // 機器から遠い側の端へ文字を寄せる（画面3と同じ扱い）。
  const occupantsY = new Map();
  for (const point of [state.router, state.repeater]) {
    const room = point ? findRoomAt(state.rooms, point) : null;
    if (!room) continue;
    occupantsY.set(room.id, (occupantsY.get(room.id) ?? []).concat(point.y));
  }

  for (const room of state.rooms) {
    const topLeft = toPixels(viewport, room);
    const width = room.width * viewport.scale;
    const height = room.height * viewport.scale;

    ctx.strokeStyle = ROOM_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(topLeft.x + 0.5, topLeft.y + 0.5, width - 1, height - 1);

    // 狭い画面では入りきらない情報を省く（描画要件）
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
    let nameY = canStack ? centerY - 22 : centerY - 12;
    const occupants = occupantsY.get(room.id);
    if (occupants) {
      const meanY = occupants.reduce((total, value) => total + value, 0) / occupants.length;
      const inUpperHalf = meanY < room.y + room.height / 2;
      nameY = inUpperHalf ? topLeft.y + height - (canStack ? 30 : 14) : topLeft.y + 14;
    }
    ctx.strokeText(room.name, centerX, nameY, width - 8);
    ctx.fillText(room.name, centerX, nameY, width - 8);

    if (!canStack) continue;
    ctx.font = "12px system-ui, sans-serif";
    const levelText = LEVEL_TEXT[summary.level];
    ctx.strokeText(levelText, centerX, nameY + 16, width - 8);
    ctx.fillText(levelText, centerX, nameY + 16, width - 8);
  }
}

function drawWall(ctx, wall) {
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

function drawTransmitter(ctx, point, kind) {
  const center = toPixels(viewport, point);
  const color = kind === "repeater" ? COLOR_REPEATER : COLOR_ROUTER;
  const radius = 11;

  ctx.save();
  if (state.selected === kind) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius + 7, 0, Math.PI * 2);
    ctx.fillStyle = kind === "repeater" ? "rgba(224,138,30,0.30)" : "rgba(30,95,217,0.30)";
    ctx.fill();
  }

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
  ctx.fillText(TRANSMITTER_TEXT[kind].mark, center.x, center.y + 0.5);

  // 名札は原則マーカーの上。上端に近いときは下へ回して画面外に出さない
  const above = center.y - radius - 3 > 14;
  const labelY = above ? center.y - radius - 3 : center.y + radius + 3;
  ctx.textBaseline = above ? "bottom" : "top";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.lineJoin = "round";
  ctx.strokeStyle = TEXT_HALO;
  ctx.lineWidth = 3;
  ctx.strokeText(TRANSMITTER_TEXT[kind].label, center.x, labelY);
  ctx.fillStyle = TEXT_ON_BOARD;
  ctx.fillText(TRANSMITTER_TEXT[kind].label, center.x, labelY);
  ctx.restore();
}

function drawSuggestionTarget(ctx) {
  const suggestion = state.suggestion;
  if (!suggestion || !suggestion.target_position) return;
  if (!SUGGESTION_WITH_POSITION.has(suggestion.kind)) return;

  const center = toPixels(viewport, suggestion.target_position);
  ctx.save();
  ctx.strokeStyle = COLOR_TARGET;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.lineJoin = "round";
  ctx.strokeStyle = TEXT_HALO;
  ctx.lineWidth = 3;
  ctx.strokeText("おすすめの場所", center.x, center.y + 17);
  ctx.fillStyle = COLOR_TARGET;
  ctx.fillText("おすすめの場所", center.x, center.y + 17);
  ctx.restore();
}

function renderBoard() {
  const { ctx, cssWidth, cssHeight } = prepareCanvas(canvas, CANVAS_ASPECT);
  viewport = computeViewport(state.rooms, cssWidth, cssHeight);

  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = BOARD_COLOR;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  drawCells(ctx);
  drawRooms(ctx);
  for (const wall of state.walls) drawWall(ctx, wall);
  drawSuggestionTarget(ctx);
  if (state.repeater) drawTransmitter(ctx, state.repeater, "repeater");
  drawTransmitter(ctx, state.router, "router");
}

// --- 吹き出し ---------------------------------------------------------------

function renderBubble() {
  if (!state.tap) {
    bubble.hidden = true;
    return;
  }
  const room = roomById(state.tap.roomId);
  const level = rssiToLevel(state.tap.rssi);
  const value = state.showNumbers ? `<span class="hm-bubble-value">${formatDbm(state.tap.rssi)}</span>` : "";

  bubble.innerHTML =
    `<span class="hm-bubble-room">${room ? room.name : ""}</span>` +
    `<span class="hm-bubble-level">${LEVEL_TEXT[level]}</span>` +
    value;
  bubble.hidden = false;

  const pixel = toPixels(viewport, state.tap.point);
  const maxX = canvas.clientWidth - 8;
  bubble.style.left = `${Math.min(Math.max(pixel.x, 8), maxX)}px`;
  bubble.style.top = `${Math.max(pixel.y - 12, 8)}px`;
}

function updateTapValue() {
  if (!state.tap) return;
  const layout = currentLayout();
  state.tap.rssi = calculateRssiAt(
    state.tap.point,
    layout.walls,
    layout.router,
    layout.repeater,
    layout.environment.band,
    { reflections: state.reflections }
  );
}

// --- パネル -----------------------------------------------------------------

function renderLegend() {
  legendEl.innerHTML = LEGEND_STEPS.map((rssi) => `<li style="background:${rssiToColor(rssi)}"></li>`).join("");
  // dBmの数値は「くわしく」を開いたときだけ小さく添える（受入基準10）
  legendScaleEl.hidden = !state.showNumbers;
  if (state.showNumbers) {
    legendScaleEl.innerHTML =
      `<span>${LEGEND_STEPS[0]}dBm</span><span>${LEGEND_STEPS[LEGEND_STEPS.length - 1]}dBm</span>`;
  }
}

function renderRooms() {
  if (!state.simulation) return;
  const summaries = state.simulation.room_summaries;

  roomsEl.innerHTML = state.rooms
    .map((room) => {
      const summary = summaries.find((item) => item.room_id === room.id) ?? null;
      if (!summary) {
        return (
          `<li><i class="hm-room-swatch" style="background:#e9edf4"></i>` +
          `<span class="hm-room-name">${room.name}</span>` +
          `<span class="hm-room-level" data-level="none">対象外</span></li>`
        );
      }
      const isWorst = room.id === state.simulation.worst_room_id;
      return (
        `<li><i class="hm-room-swatch" style="background:${rssiToColor(summary.rssi_dbm)}"></i>` +
        `<span class="hm-room-name">${room.name}${isWorst ? "（いちばん弱い部屋）" : ""}</span>` +
        `<span class="hm-room-level" data-level="${summary.level}">${LEVEL_TEXT[summary.level]}</span></li>`
      );
    })
    .join("");

  roomsNoteEl.hidden = summaries.length === state.rooms.length;
}

function costLabel(suggestion) {
  if (suggestion.is_free) return `<span class="hm-cost" data-free="true">無料でできます</span>`;
  if (suggestion.monthly_cost_yen !== null) {
    return `<span class="hm-cost" data-free="false">月額 ${suggestion.monthly_cost_yen}円</span>`;
  }
  return `<span class="hm-cost" data-free="false">費用はご相談ください</span>`;
}

function renderSuggestion() {
  const suggestion = state.suggestion;
  if (!suggestion) {
    suggestionEl.innerHTML = `<p class="hm-suggestion-message">計算しています…</p>`;
    return;
  }

  const parts = [`<p class="hm-suggestion-message">${suggestion.message}</p>`];

  // 足りている利用者には何も勧めない（費用も置き場所も出さない）
  if (suggestion.kind === "sufficient") {
    suggestionEl.innerHTML = parts.join("");
    return;
  }

  const targetRoomName = suggestion.target_position ? roomNameAt(suggestion.target_position) : null;
  if (targetRoomName) {
    parts.push(`<p class="hm-suggestion-detail">置き場所の目安: ${targetRoomName}のあたり（図の黄色い円）</p>`);
  }

  // 改善の前後は言葉で示す。正確なdBmは「くわしく」に出す（受入基準10）
  if (suggestion.before_rssi_dbm !== null && suggestion.after_rssi_dbm !== null) {
    const before = LEVEL_TEXT[rssiToLevel(suggestion.before_rssi_dbm)];
    const after = LEVEL_TEXT[rssiToLevel(suggestion.after_rssi_dbm)];
    parts.push(`<p class="hm-suggestion-detail">いちばん弱い部屋: ${before} → ${after}</p>`);
  }

  parts.push(costLabel(suggestion));
  suggestionEl.innerHTML = parts.join("");
}

function renderDetails() {
  if (!detailsEl.open) return;
  const simulation = state.simulation;
  if (!simulation) {
    detailsBodyEl.innerHTML = "<p>計算しています…</p>";
    return;
  }

  const worstRoom = roomById(simulation.worst_room_id);
  const rows = [
    ["必要な速さ", formatMbps(simulation.required_mbps)],
    ["いまの見込み", formatMbps(simulation.actual_mbps)],
    ["足りない要因", BOTTLENECK_TEXT[simulation.bottleneck]],
    ["いちばん弱い部屋", `${worstRoom ? worstRoom.name : "―"} / ${formatDbm(simulation.worst_rssi_dbm)}`],
  ];

  const suggestion = state.suggestion;
  if (suggestion && suggestion.before_rssi_dbm !== null) {
    const after = suggestion.after_rssi_dbm === null ? "―" : formatDbm(suggestion.after_rssi_dbm);
    rows.push(["改善前後", `${formatDbm(suggestion.before_rssi_dbm)} → ${after}`]);
  }
  if (suggestion && suggestion.target_position) {
    const target = suggestion.target_position;
    rows.push(["おすすめ座標", `(${target.x.toFixed(1)}m, ${target.y.toFixed(1)}m)`]);
  }

  const grid = state.grid;
  rows.push(["ヒートマップの格子", grid ? `${grid.cols}×${grid.rows}（${grid.cells.length}点）` : "―"]);
  rows.push(["壁のはね返り", state.reflections ? "考える" : "考えない"]);
  if (state.lastGridMs !== null) rows.push(["計算にかかった時間", `${state.lastGridMs.toFixed(0)}ms`]);

  detailsBodyEl.innerHTML =
    `<dl>${rows.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join("")}</dl>` +
    `<p>${simulation.is_simulation ? "これらの数値はシミュレーションによる計算値です。" : ""}</p>`;
}

function renderPanels() {
  renderLegend();
  renderRooms();
  renderSuggestion();
  renderDetails();
}

// --- 保存 -------------------------------------------------------------------

async function saveLayout() {
  const response = await fetch(API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_layout: currentLayout() }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "設定を保存できませんでした。もう一度お試しください。");
  }
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveLayout().catch((error) => showToast(error.message));
  }, 600);
}

// --- 再計算の段取り ---------------------------------------------------------

/** ドラッグ中の軽い更新（格子だけ作り直してその場で追従させる） */
function refreshWhileDragging() {
  try {
    rebuildGrid();
    updateTapValue();
  } catch (error) {
    showToast("電波の計算に失敗しました。間取りを見直してください。");
    return;
  }
  renderBoard();
  renderBubble();
}

/** 手を止めたときの重い更新（細かい格子・部屋の評価・提案） */
function scheduleRecompute() {
  window.clearTimeout(recomputeHandle);
  // 部屋ごとの評価は前回値を残したまま、提案だけ「計算中」の表示にする
  state.suggestion = null;
  renderSuggestion();

  // 先に描画を反映させてから重い計算に入る
  recomputeHandle = window.setTimeout(() => {
    try {
      rebuildGrid();
      rebuildSimulation();
      updateTapValue();
      hideToast();
    } catch (error) {
      showToast("電波の計算に失敗しました。居室が1つもない間取りでは診断できません。");
      return;
    }
    renderBoard();
    renderBubble();
    renderPanels();
  }, 30);
}

// --- キャンバスの操作 -------------------------------------------------------

function tryPlace(kind, point) {
  const resolved = resolveTransmitterPosition(state.rooms, point);
  if (!resolved) return false;
  state[kind] = resolved;
  return true;
}

canvas.addEventListener("pointerdown", (event) => {
  if (!viewport) return;
  const pixel = eventToCanvasPixel(canvas, event);
  canvas.focus();

  const hitRepeater = state.repeater && isTransmitterHit(viewport, state.repeater, pixel);
  const hitRouter = isTransmitterHit(viewport, state.router, pixel);
  const kind = hitRepeater ? "repeater" : hitRouter ? "router" : null;

  if (kind) {
    drag.kind = kind;
    drag.pointerId = event.pointerId;
    state.selected = kind;
    state.isDragging = true;
    // 端末や環境によっては捕捉できないことがある。捕捉できなくてもドラッグは続けられる
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // 捕捉に失敗しても pointermove / pointerup で追従できるので何もしない
    }
    hideToast();
    renderBoard();
    return;
  }

  // 機器以外をタップしたら、その地点の届きぐあいを吹き出しで出す
  const point = toMeters(viewport, pixel);
  const roomId = findRoomIdAt(state.rooms, point);
  if (!roomId) {
    state.tap = null;
    renderBubble();
    return;
  }
  state.tap = { point, roomId, rssi: 0 };
  updateTapValue();
  renderBubble();
});

canvas.addEventListener("pointermove", (event) => {
  if (drag.kind === null || event.pointerId !== drag.pointerId) return;
  const point = toMeters(viewport, eventToCanvasPixel(canvas, event));
  if (tryPlace(drag.kind, point)) {
    hideToast();
  } else {
    showToast("機器は部屋の外には置けません。");
  }
  // ドラッグ中もその場でヒートマップが追従する（担当Dの作るもの2）
  refreshWhileDragging();
});

function endDrag(event) {
  if (drag.kind === null) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  drag.kind = null;
  drag.pointerId = null;
  state.isDragging = false;
  scheduleRecompute();
  scheduleSave();
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener("keydown", (event) => {
  const moves = {
    ArrowLeft: [-SNAP_M, 0],
    ArrowRight: [SNAP_M, 0],
    ArrowUp: [0, -SNAP_M],
    ArrowDown: [0, SNAP_M],
  };
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();

  const current = state[state.selected];
  if (!current) return;
  if (!tryPlace(state.selected, { x: current.x + move[0], y: current.y + move[1] })) {
    showToast("その向きには動かせません。部屋の外になります。");
    return;
  }
  hideToast();
  refreshWhileDragging();
  scheduleRecompute();
  scheduleSave();
});

// --- パネルの操作 -----------------------------------------------------------

reflectionsCheckbox.addEventListener("change", () => {
  state.reflections = reflectionsCheckbox.checked;
  scheduleRecompute();
});

detailsEl.addEventListener("toggle", () => {
  state.showNumbers = detailsEl.open;
  renderLegend();
  renderBubble();
  renderDetails();
});

function initEnvironmentControls() {
  peopleSelect.innerHTML = Array.from({ length: 10 }, (_, index) => index + 1)
    .map((people) => `<option value="${people}">${people}人</option>`)
    .join("");

  peopleSelect.value = String(state.environment.people);
  routerGenSelect.value = state.environment.router_gen;
  planSelect.value = state.environment.plan;
  bandSelect.value = state.environment.band;
  for (const checkbox of usesCheckboxes) {
    checkbox.checked = state.environment.uses.includes(checkbox.value);
  }
}

function applyEnvironmentChange() {
  state.environment = {
    ...state.environment,
    people: Number(peopleSelect.value),
    uses: usesCheckboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value),
    router_gen: routerGenSelect.value,
    plan: planSelect.value,
    band: bandSelect.value,
  };
  scheduleRecompute();
  scheduleSave();
}

for (const element of [peopleSelect, routerGenSelect, planSelect, bandSelect, ...usesCheckboxes]) {
  element.addEventListener("change", applyEnvironmentChange);
}

if (nextButton) {
  nextButton.addEventListener("click", async () => {
    nextButton.disabled = true;
    try {
      window.clearTimeout(saveTimer);
      await saveLayout();
      window.location.href = NEXT_URL;
    } catch (error) {
      showToast(error.message);
      nextButton.disabled = false;
    }
  });
}

// 親要素の幅に追従させる（描画要件）。スタイルの読み込みが描画より遅れて
// 初回だけ幅が取れない場合があるので、resizeイベントだけに頼らない。
const canvasWrap = document.getElementById("hm-canvas-wrap");
let lastBoardWidth = 0;

function renderBoardIfResized() {
  if (Math.abs(canvasWrap.clientWidth - lastBoardWidth) < 1) return;
  lastBoardWidth = canvasWrap.clientWidth;
  renderBoard();
  renderBubble();
}

if (typeof ResizeObserver === "function") {
  new ResizeObserver(renderBoardIfResized).observe(canvasWrap);
}
// ResizeObserver が使えない環境や、描画の更新が止まっている環境でも幅を合わせ直せるようにする
window.addEventListener("resize", renderBoardIfResized);
window.addEventListener("load", renderBoardIfResized);

// --- 初期表示 ---------------------------------------------------------------

initEnvironmentControls();
renderLegend();
renderBoard();
scheduleRecompute();
