// 各モジュールが受け渡すデータの形（JSDoc型定義のみ。実行時の処理は持たない）
// 仕様書4章「共通データ契約」に準拠。キーはすべて snake_case。

/**
 * 部屋の種類
 * @typedef {"ldk"|"bedroom"|"room"|"tatami"|"study"|"kitchen"|"wash"|"bath"|"toilet"|"entrance"|"hall"} RoomType
 */

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} name
 * @property {RoomType} type
 * @property {number} x - 左上のx座標(m)
 * @property {number} y - 左上のy座標(m)
 * @property {number} width - 幅(m) 0.5m刻み
 * @property {number} height - 奥行き(m) 0.5m刻み
 */

/**
 * 壁の材質
 * @typedef {"concrete"|"wood"|"water"} WallMaterial
 * - concrete: 外壁
 * - wood: 間仕切り
 * - water: 水回りの壁
 */

/**
 * @typedef {Object} Wall
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {WallMaterial} material
 * @property {{start: number, end: number}|null} [door] - 壁始点(x1,y1)からの距離(m)区間。ドアなしはnull/省略。4章の必須項目ではない拡張フィールド
 */

/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * 周波数帯
 * @typedef {"b5"|"b24"} Band
 */

/**
 * ルーター世代
 * @typedef {"wifi4"|"wifi5"|"wifi6"} RouterGeneration
 */

/**
 * 契約プラン
 * @typedef {"giga1"|"giga10"} Plan
 */

/**
 * 同時に使う用途
 * @typedef {"video"|"meeting"|"game"|"work"} UsageKind
 */

/**
 * @typedef {Object} Environment
 * @property {RouterGeneration} router_gen
 * @property {Plan} plan
 * @property {Band} band
 * @property {number} people - 1〜8
 * @property {UsageKind[]} uses
 */

/**
 * @typedef {Object} RoomLayout
 * @property {Room[]} rooms
 * @property {Wall[]} walls
 * @property {Point} router
 * @property {Point|null} repeater
 * @property {Environment} environment
 */

/**
 * RSSIの快適度レベル
 * @typedef {"strong"|"good"|"weak"|"poor"} RssiLevel
 * - strong: >= -55dBm
 * - good: >= -65dBm
 * - weak: >= -72dBm
 * - poor: < -72dBm
 */

/**
 * @typedef {Object} RoomSummary
 * @property {string} room_id
 * @property {number} rssi_dbm
 * @property {number} estimated_mbps
 * @property {RssiLevel} level
 */

/**
 * ボトルネックの種類
 * @typedef {"radio"|"router"|"plan"|"none"} BottleneckKind
 */

/**
 * engine.runSimulation() が返す部分（担当C）に、担当Dの提案ロジックが
 * suggested_router_pos / suggested_repeater_pos を合成して完成させる。
 * @typedef {Object} SimulationResult
 * @property {RoomSummary[]} room_summaries
 * @property {string} worst_room_id
 * @property {number} worst_rssi_dbm
 * @property {number} required_mbps
 * @property {number} actual_mbps
 * @property {BottleneckKind} bottleneck
 * @property {Point|null} suggested_router_pos
 * @property {Point|null} suggested_repeater_pos
 * @property {true} is_simulation
 */

/**
 * 提案の種類（表の上から順に対応）
 * @typedef {"move_router"|"add_repeater"|"onsite_support"|"upgrade_router"|"upgrade_plan"|"sufficient"} SuggestionKind
 */

/**
 * @typedef {Object} Suggestion
 * @property {SuggestionKind} kind
 * @property {string} message - 日本語の提案文（表示文とIDを分離する規則3に従い、UI側は kind でも分岐できる）
 * @property {boolean} is_free - 無料での対応かどうか
 * @property {number|null} monthly_cost_yen - 月額費用(円)。無料/不明はnull
 * @property {number|null} before_rssi_dbm - 改善前のdBm。対象なしはnull
 * @property {number|null} after_rssi_dbm - 改善後のdBm。対象なしはnull
 * @property {Point|null} target_position - 移動/設置先の座標。対象なしはnull
 */

/**
 * @typedef {Object} HeatmapCell
 * @property {number} x - セル中心のx座標(m)
 * @property {number} y - セル中心のy座標(m)
 * @property {number} rssi_dbm
 * @property {string} color - "#rrggbb"
 * @property {string|null} room_id - セルが属する部屋のID。部屋の外はnull（描画時に塗らない）
 */

/**
 * @typedef {Object} HeatmapGrid
 * @property {HeatmapCell[]} cells
 * @property {number} cols
 * @property {number} rows
 */

export {};
