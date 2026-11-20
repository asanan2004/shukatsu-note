"use strict";
const App = {
  isNarrow() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 599px)").matches);
  },
  foldSection(parent, key, title, summaryExtra = "") {
    const section = this.el("details", null, parent, "fold-section");
    section.setAttribute("data-key", key);
    this.foldOpen ||= {};
    section.open = Object.prototype.hasOwnProperty.call(this.foldOpen, key) ? this.foldOpen[key] : !this.isNarrow();
    const summary = this.el("summary", title, section);
    if (summaryExtra) this.el("small", summaryExtra, summary, "muted");
    section.addEventListener("toggle", () => { this.foldOpen[key] = section.open; });
    return section;
  },
  compactCard(card, { line1, line2, key }) {
    card.className += " compact-card";
    const main = this.el("div", null, card, "card-main");
    const first = this.el("div", null, main, "card-line1");
    line1.forEach(node => first.append(node));
    const second = this.el("div", null, main, "card-line2");
    line2.forEach(node => second.append(node));
    const more = this.el("div", null, card, "card-more");
    this.expandedCards ||= new Set();
    const update = () => {
      const open = this.expandedCards.has(key);
      card.className = card.className.replace(/\s+expanded\b/g, "") + (open ? " expanded" : "");
      toggle.setAttribute("aria-expanded", String(open));
    };
    const toggle = this.button(first, "詳細", () => {
      if (this.expandedCards.has(key)) this.expandedCards.delete(key);
      else this.expandedCards.add(key);
      update();
    });
    toggle.className = "card-toggle";
    update();
    return more;
  },
  data: { version: 1, deadlines: [], gakuchika: [], esQuestions: [] },
  genres: ["志望動機", "自己PR", "ガクチカ", "長所・短所", "挫折経験", "将来像", "研究・ゼミ", "その他"],
  kinds: ["ES", "Webテスト", "面接", "説明会", "インターン応募", "その他"],
  statuses: ["未着手", "進行中", "提出済", "見送り"],
  id: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
  count: text => Array.from(text.replace(/[\r\n]/g, "")).length,
  companyMatches(name, query) {
    const normalize = value => String(value).normalize("NFKC").toLowerCase().replace(/\s/g, "");
    const normalizedQuery = normalize(query);
    return normalizedQuery === "" || normalize(name).includes(normalizedQuery);
  },
  message(text) { document.getElementById("message").textContent = text; },
  el(tag, text, parent, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    if (parent) parent.append(node);
    return node;
  },
  iconFor(text) {
    if (/^[＋+]/.test(text)) return "";
    if (text.includes(".ics書き出し")) return "download";
    const names = {
      "編集": "pencil", "企業名を変更": "pencil",
      "削除": "trash", "設問を削除": "trash", "コピー": "copy",
      "提出済にする": "check", "貼り付けて追加": "clipboard", "貼り付け登録": "clipboard",
      "月カレンダーを表示": "calendar", "リストを表示": "list",
      "JSONの書き出し": "download", "今すぐ書き出す": "download", "戻る": "arrow-left"
    };
    return Object.prototype.hasOwnProperty.call(names, text) ? names[text] : "";
  },
  button(parent, text, action) {
    const node = this.el("button", text, parent);
    node.type = "button";
    const name = this.iconFor(text);
    if (name && typeof ShukatsuIcons !== "undefined") {
      node.prepend(ShukatsuIcons.make(name));
      node.setAttribute("data-icon", name);
    }
    if (/^[＋+] .*を追加$/.test(text)) node.className = "primary";
    node.addEventListener("click", action);
    return node;
  },
  field(parent, label, value = "", type = "text", options) {
    const wrap = this.el("label", label, parent);
    const node = this.el(options ? "select" : type === "textarea" ? "textarea" : "input", null, wrap);
    if (options) options.forEach(option => {
      const item = this.el("option", option.label === undefined ? option : option.label, node);
      item.value = option.value === undefined ? option : option.value;
    });
    else if (type !== "textarea") node.type = type;
    node.value = value;
    return node;
  },
  modal(title, build, save) {
    document.getElementById("editor").className = "";
    const fields = document.getElementById("fields");
    document.querySelector('#edit-form button[type="submit"]').disabled = false;
    document.querySelector('#edit-form button[type="submit"]').textContent = "変更を反映";
    fields.replaceChildren();
    this.el("h2", title, fields);
    const read = build(fields);
    document.getElementById("edit-form").onsubmit = event => {
      event.preventDefault();
      if (save(read()) === false) return;
      this.changed();
      document.getElementById("editor").close();
      this.render();
    };
    document.getElementById("editor").showModal();
  },
  remove(array, item) {
    if (!confirm("この項目を削除しますか？")) return;
    const index = array.indexOf(item);
    if (index < 0) return;
    const trashId = typeof this.toTrash === "function" ? this.toTrash(array, item) : null;
    array.splice(index, 1);
    this.changed();
    this.render();
    if (trashId && typeof this.showUndoToast === "function") this.showUndoToast(trashId);
  },
  copy(text) {
    const fallback = () => {
      this.modal("コピーするテキスト（Ctrl+C）", parent => {
        const field = this.field(parent, "本文", text, "textarea");
        setTimeout(() => { field.focus(); field.select(); }, 0);
        return () => null;
      }, () => {});
    };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(text).then(() => this.message("コピーしました。"), fallback);
  },
  download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = this.el("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  meter(parent, input, limit) {
    const output = this.el("small", "", parent);
    const update = () => {
      const count = this.count(input.value);
      const max = typeof limit === "function" ? limit() : limit;
      const diff = max - count;
      output.textContent = `${count}字（改行を除く）` + (max ? ` / ${max}字：${diff < 0 ? -diff + "字オーバー" : "あと" + diff + "字"}` : "");
      output.className = diff < 0 ? "over" : "good";
    };
    input.addEventListener("input", update);
    update();
    return update;
  }
};
