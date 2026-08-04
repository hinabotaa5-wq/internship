// 各モジュールが受け渡すデータの形（JSDoc型定義のみ。実行時の処理は持たない）

/**
 * @typedef {Object} Point
 * @property {number} x - m単位
 * @property {number} y - m単位
 */

/**
 * 部屋の種類
 * @typedef {"LDK"|"寝室"|"洋室"|"和室"|"書斎"|"キッチン"|"洗面"|"浴室"|"トイレ"|"玄関"|"廊下"} RoomType
 */

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {RoomType} type
 * @property {number} x - 左上のx座標(m)
 * @property {number} y - 左上のy座標(m)
 * @property {number} width - 幅(m) 0.5m刻み
 * @property {number} depth - 奥行き(m) 0.5m刻み
 */

/**
 * 壁の種類
 * @typedef {"exterior"|"partition"|"wet"} WallKind
 * - exterior: 外壁(コンクリート)
 * - partition: 間仕切り(木)
 * - wet: 水回りの壁
 */

/**
 * @typedef {Object} Wall
 * @property {Point} start
 * @property {Point} end
 * @property {WallKind} kind
 * @property {{start: number, end: number}|null} doorOpening - 壁始点からの距離(m)区間。ドアなしはnull
 */

/**
 * @typedef {Object} HouseLayout
 * @property {Room[]} rooms
 * @property {Wall[]} walls
 */

/**
 * 周波数帯
 * @typedef {"5GHz"|"2.4GHz"} Band
 */

/**
 * 送信機（親機 or 中継機）
 * @typedef {Object} Transmitter
 * @property {string} id
 * @property {"router"|"repeater"} role
 * @property {Point} position
 */

/**
 * 用途（同時に使うもの）
 * @typedef {"video"|"conference"|"game"|"remoteWork"} UsageKind
 */

/**
 * @typedef {Object} DeviceConfig
 * @property {4|5|6} routerGeneration
 * @property {"1G"|"10G"} plan
 * @property {Band} band
 * @property {number} householdSize - 1〜8
 * @property {UsageKind[]} usages
 */

/**
 * @typedef {Object} RoomEvaluation
 * @property {string} roomId
 * @property {number} rssi - dBm
 * @property {number} throughput - Mbps
 */

/**
 * ボトルネックの種類
 * @typedef {"wifi"|"router"|"plan"|"none"} BottleneckKind
 */

/**
 * @typedef {Object} DiagnosisResult
 * @property {RoomEvaluation[]} roomEvaluations
 * @property {BottleneckKind} bottleneck
 * @property {number} actualThroughput - Mbps
 * @property {number} requiredBandwidth - Mbps
 * @property {{kind: string, description: string, before: number|null, after: number|null}} action
 */

export {};
