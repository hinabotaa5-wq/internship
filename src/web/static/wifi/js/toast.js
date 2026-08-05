// このファイルは「トースト（画面上部中央に一時的に出る通知メッセージ）」を
// 表示するための最小限のJavaScriptです。
//
// 使う側（他の画面のJS）は、このファイルの showToast() という関数だけを
// 呼び出せばよいようにしています。内部でどうやってDOM（HTML要素）を
// 作っているかを、使う側は知らなくてよい、という考え方です
// （これを「関心の分離」と呼びます）。
//
// 使い方の例（他のJSファイルから）：
//   import { showToast } from "./toast.js";
//   showToast("コピーしました", "success");
//
// この仕組みは ES Modules という、JavaScriptの標準的な「ファイル分割」の
// 機能を使っています。HTML側では
//   <script type="module" src="...のURL"></script>
// のように type="module" を付けて読み込む必要があります。

// トーストが自動的に消えるまでの時間（ミリ秒）。
// 1000ミリ秒 = 1秒なので、3000ミリ秒 = 3秒。
// フェーズ1で「3秒で消える」と決めたので、ここに定数として書いておく。
// マジックナンバー（意味のわからない謎の数字）を直接あちこちに書かず、
// 名前付きの定数にすることで、後で時間を変えたいときにここ1箇所を直せばよくなる。
const TOAST_DURATION_MS = 3000;

// フェードアウト（消えるアニメーション）にかける時間。
// components.css の --transition-fast (0.2s = 200ms) と合わせている。
// アニメーションが終わる前にDOMから消してしまうと、見た目がガタつくため、
// 「フェードアウトが終わるのを待ってから要素を消す」ために使う。
const TOAST_FADE_OUT_MS = 200;

/**
 * トースト（通知メッセージ）を画面上部中央に表示する関数。
 *
 * @param {string} message - 表示したい日本語のメッセージ（例：「コピーしました」）
 * @param {"info"|"success"|"warning"|"error"} level - メッセージの種類。
 *   種類によって色が変わる（components.css の .toast--info などに対応）。
 *   何も指定しなければ "info"（通常の情報）として扱う。
 */
export function showToast(message, level = "info") {
  // まず、トーストを並べて置いておく「入れ物」の要素を用意する。
  // 1回目の呼び出しでは入れ物がまだ存在しないので作り、
  // 2回目以降はすでにある入れ物を再利用する。
  const container = getOrCreateToastContainer();

  // トースト1個分の <div> 要素を新しく作る。
  const toastElement = document.createElement("div");

  // components.css で用意した .toast クラスと、
  // レベルごとの色を決める .toast--info / .toast--success などを付ける。
  // level に想定外の値が来た場合でも "toast--info" のクラスにフォールバックする。
  const allowedLevels = ["info", "success", "warning", "error"];
  const safeLevel = allowedLevels.includes(level) ? level : "info";
  toastElement.className = `toast toast--${safeLevel}`;

  // textContent を使うことで、message に含まれる文字を
  // 「そのままの文字」として表示する（HTMLタグとして解釈させない）。
  // これはセキュリティ上の理由でも重要：innerHTML を使うと、
  // messageの中に <script> のような文字列が入っていた場合に
  // 実行されてしまう危険（XSS）があるため、必ず textContent を使う。
  toastElement.textContent = message;

  // 作ったトースト要素を、入れ物の中に追加する。
  container.appendChild(toastElement);

  // 追加した直後はまだ「非表示の状態（opacity: 0）」になっている
  // （components.css で .toast の初期状態が透明に指定されているため）。
  // ここで is-visible クラスを付けることで、CSSのtransitionが働き、
  // ふわっと表示される（フェードイン）。
  //
  // 注意点：クラスを追加するタイミングを、要素をDOMに追加した直後の
  // 同期処理の中で行うと、ブラウザがアニメーションを認識できず
  // 「一瞬で表示される」だけになってしまうことがある。
  // そのため、次の描画タイミングまで少し待つ（requestAnimationFrame）ことで、
  // 確実にフェードインのアニメーションを発生させている。
  requestAnimationFrame(() => {
    toastElement.classList.add("is-visible");
  });

  // 指定した時間（3秒）が経過したら、自動的にトーストを消す処理を予約する。
  setTimeout(() => {
    // is-visible を外すと、CSSのtransitionによってフェードアウトが始まる。
    toastElement.classList.remove("is-visible");

    // フェードアウトのアニメーションが終わるのを待ってから、
    // 実際にDOMから要素を取り除く（remove）。
    // アニメーション中に消してしまうと、見た目が「パッ」と消えてしまうため、
    // アニメーションの時間だけ待ってから削除する。
    setTimeout(() => {
      toastElement.remove();
    }, TOAST_FADE_OUT_MS);
  }, TOAST_DURATION_MS);
}

/**
 * トーストを並べておく「入れ物」の要素を取得する。
 * まだ存在しない場合は新しく作って <body> に追加する。
 *
 * この関数を用意することで、showToast() が呼ばれるたびに
 * 入れ物を重複して作ってしまう問題を防いでいる。
 *
 * @returns {HTMLElement} トーストの入れ物となるDOM要素
 */
function getOrCreateToastContainer() {
  // すでに入れ物が存在するかどうかを、id属性で探す。
  const existingContainer = document.getElementById("wifi-toast-container");
  if (existingContainer !== null) {
    return existingContainer;
  }

  // 存在しない場合は新しく作る。
  const newContainer = document.createElement("div");

  // components.css の .toast-container クラスに対応する見た目
  // （画面上部中央に固定表示）を適用するためのクラスを付ける。
  newContainer.className = "toast-container";

  // 次回呼び出したときに同じ入れ物を再利用できるように、idを付けておく。
  newContainer.id = "wifi-toast-container";

  // 作った入れ物を、ページ全体（body）の末尾に追加する。
  document.body.appendChild(newContainer);

  return newContainer;
}
