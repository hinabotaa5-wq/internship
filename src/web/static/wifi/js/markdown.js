// Q&A履歴・診断結果を見やすく表示するための、最小限のMarkdown→HTML変換。
//
// 対応する記法は「## 見出し」「- リスト」「**強調**」「空行区切りの段落」のみ。
// これらはこのファイルの呼び出し側（qaHistoryToMarkdown / diagnosisResultToMarkdown）
// が組み立てるMarkdownで実際に使うものだけに絞っている。
//
// 使い方の例：
//   import { markdownToHtml } from "./markdown.js";
//   container.innerHTML = markdownToHtml("## 見出し\n- 項目1\n- 項目2");

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  let html = "";
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      closeList();
      html += `<h6 class="markdown-heading">${renderInline(line.slice(3))}</h6>`;
    } else if (line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${renderInline(line.slice(2))}</li>`;
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      html += `<p>${renderInline(line)}</p>`;
    }
  }
  closeList();

  return html;
}

export function renderMarkdown(container, markdown) {
  container.innerHTML = markdownToHtml(markdown);
}

const CONFIDENCE_TEXT = { high: "高い", medium: "中程度", low: "低い" };

// qa_history（診断の質問・回答履歴）をMarkdownテキストに変換する。
// [{question_id, answer_id, question_text, answer_label}, ...] の形式を前提にしている。
// question_text/answer_label が無い古いデータ（日本語化前に保存されたticket）は
// question_id/answer_idのIDをそのまま表示する。
export function qaHistoryToMarkdown(qaHistory) {
  if (!qaHistory || !qaHistory.length) {
    return "## Q&A回答履歴\n\n回答履歴はありません。";
  }
  const items = qaHistory
    .map((entry) => `- **${entry.question_text ?? entry.question_id}**: ${entry.answer_label ?? entry.answer_id}`)
    .join("\n");
  return `## Q&A回答履歴\n\n${items}`;
}

// diagnosis_result（原因切り分け診断の結果）をMarkdownテキストに変換する。
export function diagnosisResultToMarkdown(diagnosisResult) {
  if (!diagnosisResult) {
    return "## 診断結果\n\n診断を経ていない問い合わせです。";
  }

  const lines = [
    "## 診断結果",
    "",
    `**考えられる原因**: ${diagnosisResult.cause_name}`,
    "",
    `**確信度**: ${CONFIDENCE_TEXT[diagnosisResult.confidence] ?? diagnosisResult.confidence}`,
    "",
    `**判断理由**: ${diagnosisResult.reason}`,
    "",
    "**試してほしいこと**",
    "",
    ...(diagnosisResult.recommended_action ?? []).map((action) => `- ${action}`),
  ];

  if (diagnosisResult.support_required) {
    lines.push("", `**サポート窓口への申告内容**: ${diagnosisResult.support_message}`);
  }

  lines.push("", `**診断ID**: ${diagnosisResult.diagnosis_id}`);

  return lines.join("\n");
}
