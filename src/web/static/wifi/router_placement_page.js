// 画面3「ルーター配置」のUIイベント処理（担当B）
//
// 親機・中継機をドラッグまたはキーボードで動かす。部屋の外には置けない。
// 判定は layout.js、描画は floorplan_view.js に任せる。

import {
  SNAP_M,
  buildRoomLayout,
  defaultRepeaterPosition,
  defaultRouterPosition,
  findRoomAt,
  resolveTransmitterPosition,
} from "./layout.js";
import {
  computeViewport,
  drawFloorplan,
  eventToCanvasPixel,
  isTransmitterHit,
  prepareCanvas,
  toMeters,
} from "./floorplan_view.js";

const root = document.getElementById("fp-router-page");
const canvas = document.getElementById("fp-canvas");
const toast = document.getElementById("fp-toast");
const routerButton = document.getElementById("fp-select-router");
const repeaterButton = document.getElementById("fp-select-repeater");
const toggleRepeaterButton = document.getElementById("fp-toggle-repeater");
const placementEl = document.getElementById("fp-placement");
const nextButton = document.getElementById("fp-next");

const API_URL = root.dataset.apiUrl;
const NEXT_URL = root.dataset.nextUrl || "";
const CANVAS_ASPECT = 0.75;

const initialLayout = JSON.parse(document.getElementById("fp-initial-layout").textContent);

const state = {
  rooms: initialLayout.rooms,
  router: initialLayout.router ?? defaultRouterPosition(initialLayout.rooms),
  repeater: initialLayout.repeater ?? null,
  environment: initialLayout.environment,
  /** キーボード操作の対象 */
  selected: "router",
};

const drag = { kind: null, pointerId: null };
let viewport = null;
let saveTimer = null;

// --- 表示 -------------------------------------------------------------------

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

function renderCanvas() {
  const { ctx, cssWidth, cssHeight } = prepareCanvas(canvas, CANVAS_ASPECT);
  viewport = computeViewport(state.rooms, cssWidth, cssHeight);
  drawFloorplan(ctx, viewport, currentLayout(), {
    cssWidth,
    cssHeight,
    showTransmitters: true,
    selectedTransmitter: state.selected,
  });
}

function roomNameAt(point) {
  const room = point ? findRoomAt(state.rooms, point) : null;
  return room ? room.name : "―";
}

function renderPanel() {
  const hasRepeater = state.repeater !== null;
  repeaterButton.hidden = !hasRepeater;
  toggleRepeaterButton.textContent = hasRepeater ? "中継機を外す" : "中継機を置く";
  routerButton.setAttribute("aria-pressed", String(state.selected === "router"));
  repeaterButton.setAttribute("aria-pressed", String(state.selected === "repeater"));

  placementEl.innerHTML =
    `親機の場所: <b>${roomNameAt(state.router)}</b>` +
    (hasRepeater ? `<br>中継機の場所: <b>${roomNameAt(state.repeater)}</b>` : "");
}

function render() {
  renderCanvas();
  renderPanel();
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
    throw new Error(body.error ?? "配置を保存できませんでした。もう一度お試しください。");
  }
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveLayout().catch((error) => showToast(error.message));
  }, 600);
}

// --- 機器の移動 -------------------------------------------------------------

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
  const hitRouter = state.router && isTransmitterHit(viewport, state.router, pixel);
  const kind = hitRepeater ? "repeater" : hitRouter ? "router" : null;
  if (!kind) return;

  drag.kind = kind;
  drag.pointerId = event.pointerId;
  state.selected = kind;
  canvas.setPointerCapture(event.pointerId);
  hideToast();
  render();
});

canvas.addEventListener("pointermove", (event) => {
  if (drag.kind === null || event.pointerId !== drag.pointerId) return;
  const point = toMeters(viewport, eventToCanvasPixel(canvas, event));
  if (tryPlace(drag.kind, point)) {
    hideToast();
  } else {
    showToast("機器は部屋の外には置けません。");
  }
  render();
});

function endDrag(event) {
  if (drag.kind === null) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  drag.kind = null;
  drag.pointerId = null;
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
  if (tryPlace(state.selected, { x: current.x + move[0], y: current.y + move[1] })) {
    hideToast();
    scheduleSave();
  } else {
    showToast("その向きには動かせません。部屋の外になります。");
  }
  render();
});

// --- パネルの操作 -----------------------------------------------------------

routerButton.addEventListener("click", () => {
  state.selected = "router";
  canvas.focus();
  render();
});

repeaterButton.addEventListener("click", () => {
  state.selected = "repeater";
  canvas.focus();
  render();
});

toggleRepeaterButton.addEventListener("click", () => {
  if (state.repeater) {
    state.repeater = null;
    state.selected = "router";
  } else {
    const position = defaultRepeaterPosition(state.rooms, state.router);
    if (!position) {
      showToast("中継機を置ける場所が見つかりませんでした。");
      return;
    }
    state.repeater = position;
    state.selected = "repeater";
  }
  hideToast();
  render();
  scheduleSave();
});

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

window.addEventListener("resize", renderCanvas);

render();
// 画面2から来た直後でも、この画面での既定位置がセッションに入るようにする
scheduleSave();
