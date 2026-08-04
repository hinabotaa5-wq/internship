// 間取りのひな形・壁とドアの自動生成（UIに依存しない純粋関数群）
// フェーズ1: シグネチャのみ。中身はフェーズ3で実装する。

/**
 * ひな形の間取りを生成する
 * @param {"1K"|"2LDK"|"3LDK"} presetName
 * @returns {import('./types.js').Room[]}
 */
export function createPresetRooms(presetName) {
  throw new Error("not implemented");
}

/**
 * 部屋の隣接関係から壁とドアを自動生成する
 * @param {import('./types.js').Room[]} rooms
 * @returns {import('./types.js').Wall[]}
 */
export function generateWalls(rooms) {
  throw new Error("not implemented");
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
  throw new Error("not implemented");
}
