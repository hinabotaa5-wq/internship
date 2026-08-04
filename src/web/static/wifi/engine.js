// 電波計算エンジン（UIに依存しない純粋関数群）
// フェーズ1: シグネチャのみ。中身はフェーズ2で実装する。

/**
 * 1点における合成RSSIを計算する（直接波 + 反射波、複数送信機の電力和）
 * @param {import('./types.js').Point} point - 評価点
 * @param {import('./types.js').Transmitter[]} transmitters
 * @param {import('./types.js').Wall[]} walls
 * @param {import('./types.js').Band} band
 * @param {{reflections: boolean}} options - 反射ON/OFF
 * @returns {number} RSSI (dBm)
 */
export function calculateRssiAt(point, transmitters, walls, band, options) {
  throw new Error("not implemented");
}

/**
 * RSSIから実効速度(Mbps)を線形補間で求める
 * @param {number} rssi - dBm
 * @param {import('./types.js').Band} band
 * @returns {number} Mbps
 */
export function rssiToThroughput(rssi, band) {
  throw new Error("not implemented");
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
export function evaluateRooms(rooms, transmitters, walls, band, options) {
  throw new Error("not implemented");
}

/**
 * 必要帯域(Mbps)を算出する
 * @param {import('./types.js').DeviceConfig} deviceConfig
 * @returns {number} Mbps
 */
export function calculateRequiredBandwidth(deviceConfig) {
  throw new Error("not implemented");
}

/**
 * 親機/中継機の最適位置を探索する（居室内で最も弱い部屋のRSSIを最大化する点）
 * @param {import('./types.js').Room[]} rooms
 * @param {import('./types.js').Wall[]} walls
 * @param {import('./types.js').Transmitter[]} existingTransmitters - 探索対象以外の既存送信機
 * @param {import('./types.js').Band} band
 * @param {{excludeNearPoint?: import('./types.js').Point, excludeRadius?: number}} constraints
 * @returns {import('./types.js').Point}
 */
export function findOptimalPosition(rooms, walls, existingTransmitters, band, constraints) {
  throw new Error("not implemented");
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
  throw new Error("not implemented");
}
