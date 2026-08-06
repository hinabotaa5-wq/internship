// 画面2「住宅レイアウト作成」のUIイベント処理（担当B）
//
// データ生成は layout.js、描画は floorplan_view.js に任せる。
// このファイルはイベントと画面表示の橋渡しだけを行う。

import {
  ROOM_TYPES,
  SNAP_M,
  addRoom,
  buildRoomLayout,
  createPresetRooms,
  describeRoomSize,
  findRoomAt,
  listPresets,
  moveRoom,
  removeRoom,
  renameRoom,
  resizeRoomBySteps,
} from "./layout.js";
import {
  computeViewport,
  drawFloorplan,
  eventToCanvasPixel,
  prepareCanvas,
  toMeters,
} from "./floorplan_view.js";

const root = document.getElementById("fp-layout-page");
const canvas = document.getElementById("fp-canvas");
const toast = document.getElementById("fp-toast");
const presetRow = document.getElementById("fp-presets");
const roomTypeSelect = document.getElementById("fp-room-type");
const addButton = document.getElementById("fp-add-room");
const roomListEl = document.getElementById("fp-room-list");
const selectedPanel = document.getElementById("fp-selected");
const emptyPanel = document.getElementById("fp-selected-empty");
const nameInput = document.getElementById("fp-room-name");
const sizeEl = document.getElementById("fp-room-size");
const deleteButton = document.getElementById("fp-delete-room");
const nextButton = document.getElementById("fp-next");

const API_URL = root.dataset.apiUrl;
const NEXT_URL = root.dataset.nextUrl;
/** キャンバスの縦横比（縦長すぎると狭い画面で間取りが小さくなるため4:3にする） */
const CANVAS_ASPECT = 0.75;

const initialLayout = JSON.parse(document.getElementById("fp-initial-layout").textContent);

const state = {
  rooms: initialLayout?.rooms ?? [],
  router: initialLayout?.router ?? null,
  repeater: initialLayout?.repeater ?? null,
  environment: initialLayout?.environment,
  selectedRoomId: null,
  /** ドラッグ中に重なって移動できなかったことを示す（枠を赤くする） */
  isBlocked: false,
};

const drag = { roomId: null, offsetX: 0, offsetY: 0, pointerId: null };
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
    selectedRoomId: state.selectedRoomId,
    isInvalid: state.isBlocked,
    showTransmitters: false,
  });
}

function renderRoomList() {
  roomListEl.replaceChildren();
  for (const room of state.rooms) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fp-btn";
    button.textContent = room.name;
    button.setAttribute("aria-pressed", String(room.id === state.selectedRoomId));
    button.addEventListener("click", () => selectRoom(room.id));
    item.append(button);
    roomListEl.append(item);
  }
}

function renderSelected() {
  const room = state.rooms.find((r) => r.id === state.selectedRoomId);
  const hasSelection = Boolean(room);
  selectedPanel.hidden = !hasSelection;
  emptyPanel.hidden = hasSelection;
  if (!room) return;

  if (nameInput.value !== room.name) nameInput.value = room.name;
  const size = describeRoomSize(room);
  sizeEl.innerHTML =
    `よこ <b>約${size.steps_x}歩</b> × たて <b>約${size.steps_y}歩</b><br>` +
    `${size.area_sqm.toFixed(1)}㎡（約${size.tatami}畳）`;
}

function render() {
  renderCanvas();
  renderRoomList();
  renderSelected();
  nextButton.disabled = state.rooms.length === 0;
}

function selectRoom(roomId) {
  state.selectedRoomId = roomId;
  state.isBlocked = false;
  render();
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
    throw new Error(body.error ?? "間取りを保存できませんでした。もう一度お試しください。");
  }
  return response.json();
}

// 入力のたびに送らないよう少し待ってから保存する（戻っても入力が消えないようにする）
function scheduleSave() {
  if (state.rooms.length === 0) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveLayout().catch((error) => showToast(error.message));
  }, 600);
}

function commit({ keepToast = false } = {}) {
  if (!keepToast) hideToast();
  render();
  scheduleSave();
}

// --- 部屋の操作 -------------------------------------------------------------

function applyPreset(presetId) {
  state.rooms = createPresetRooms(presetId);
  state.router = null;
  state.repeater = null;
  state.selectedRoomId = null;
  commit();
}

function handleAddRoom() {
  const updated = addRoom(state.rooms, roomTypeSelect.value);
  if (!updated) {
    showToast("置ける場所が見つかりませんでした。部屋を動かして空きを作ってください。");
    return;
  }
  state.rooms = updated;
  state.selectedRoomId = updated[updated.length - 1].id;
  commit();
}

function handleDeleteRoom() {
  if (!state.selectedRoomId) return;
  state.rooms = removeRoom(state.rooms, state.selectedRoomId);
  state.selectedRoomId = null;
  commit();
}

function handleResize(axis, stepDelta) {
  if (!state.selectedRoomId) return;
  const updated = resizeRoomBySteps(state.rooms, state.selectedRoomId, axis, stepDelta);
  if (!updated) {
    showToast(
      stepDelta > 0
        ? "これ以上広げると隣の部屋と重なります。先に隣の部屋を動かしてください。"
        : "これ以上狭くできません。"
    );
    return;
  }
  state.rooms = updated;
  commit();
}

function tryMove(roomId, x, y) {
  const updated = moveRoom(state.rooms, roomId, x, y);
  if (!updated) {
    state.isBlocked = true;
    return false;
  }
  state.rooms = updated;
  state.isBlocked = false;
  return true;
}

// --- キャンバスの操作 -------------------------------------------------------

canvas.addEventListener("pointerdown", (event) => {
  if (!viewport) return;
  const point = toMeters(viewport, eventToCanvasPixel(canvas, event));
  const room = findRoomAt(state.rooms, point);
  canvas.focus();

  if (!room) {
    selectRoom(null);
    return;
  }

  state.selectedRoomId = room.id;
  drag.roomId = room.id;
  drag.pointerId = event.pointerId;
  drag.offsetX = point.x - room.x;
  drag.offsetY = point.y - room.y;
  canvas.setPointerCapture(event.pointerId);
  hideToast();
  render();
});

canvas.addEventListener("pointermove", (event) => {
  if (drag.roomId === null || event.pointerId !== drag.pointerId) return;
  const point = toMeters(viewport, eventToCanvasPixel(canvas, event));
  const moved = tryMove(drag.roomId, point.x - drag.offsetX, point.y - drag.offsetY);
  if (!moved) {
    showToast("部屋は重ねて置けません。");
  } else {
    hideToast();
  }
  renderCanvas();
});

function endDrag(event) {
  if (drag.roomId === null) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  drag.roomId = null;
  drag.pointerId = null;
  state.isBlocked = false;
  commit({ keepToast: true });
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// キーボードでも部屋を動かせるようにする
canvas.addEventListener("keydown", (event) => {
  if (!state.selectedRoomId) return;
  const room = state.rooms.find((r) => r.id === state.selectedRoomId);
  if (!room) return;

  const moves = {
    ArrowLeft: [-SNAP_M, 0],
    ArrowRight: [SNAP_M, 0],
    ArrowUp: [0, -SNAP_M],
    ArrowDown: [0, SNAP_M],
  };
  const move = moves[event.key];
  if (move) {
    event.preventDefault();
    if (tryMove(room.id, room.x + move[0], room.y + move[1])) {
      hideToast();
      commit();
    } else {
      showToast("その向きには動かせません。隣の部屋と重なります。");
      render();
    }
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    handleDeleteRoom();
  }
});

// --- 初期化 -----------------------------------------------------------------

for (const preset of listPresets()) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fp-btn";
  button.textContent = preset.label;
  button.title = preset.description;
  button.addEventListener("click", () => {
    if (state.rooms.length > 0 && !window.confirm(`いま作った間取りを${preset.label}のひな形で置き換えます。よろしいですか？`)) {
      return;
    }
    applyPreset(preset.id);
  });
  presetRow.append(button);
}

for (const type of ROOM_TYPES) {
  const option = document.createElement("option");
  option.value = type.id;
  option.textContent = type.label;
  roomTypeSelect.append(option);
}

addButton.addEventListener("click", handleAddRoom);
deleteButton.addEventListener("click", handleDeleteRoom);

nameInput.addEventListener("input", () => {
  if (!state.selectedRoomId) return;
  const name = nameInput.value.trim() || "部屋";
  state.rooms = renameRoom(state.rooms, state.selectedRoomId, name);
  renderCanvas();
  renderRoomList();
  scheduleSave();
});

for (const button of document.querySelectorAll("[data-fp-resize]")) {
  const [axis, delta] = button.dataset.fpResize.split(":");
  button.addEventListener("click", () => handleResize(axis, Number(delta)));
}

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

window.addEventListener("resize", renderCanvas);

if (state.rooms.length === 0) {
  // 初回は迷わせないよう、標準的な間取りを表示しておく
  applyPreset("2ldk");
} else {
  render();
}
