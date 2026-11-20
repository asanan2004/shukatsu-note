"use strict";
Object.assign(App, {
  mergePlan(current, incoming) {
    const copy = value => JSON.parse(JSON.stringify(value));
    const data = copy(current), counts = {};
    for (const key of ["deadlines", "mypages", "esQuestions", "gakuchika", "reverseQuestions", "companies", "genres", "availability", "weeks", "plans"]) {
      const count = counts[key] = { added: 0, updated: 0 };
      const identity = item => key === "genres" ? item : item[key === "companies" ? "name" : key === "availability" ? "date" : key === "weeks" ? "week" : "id"];
      const time = item => {
        const value = Date.parse(key === "companies" ? item.updatedAt : item.updatedAt || item.createdAt);
        return Number.isFinite(value) ? value : -Infinity;
      };
      for (const item of incoming[key] || []) {
        const list = data[key] || [];
        const index = list.findIndex(existing => identity(existing) === identity(item));
        if (index < 0) {
          (data[key] ||= []).push(copy(item));
          count.added++;
        } else if (!["genres", "availability", "weeks"].includes(key) && time(item) > time(list[index])) {
          list[index] = copy(item);
          count.updated++;
        }
      }
    }
    return { data, counts };
  },
  mergeImport(incoming) {
    const plan = this.mergePlan(this.data, incoming);
    const labels = { deadlines: "締め切り", mypages: "マイページ", esQuestions: "ES設問", gakuchika: "ガクチカ",
      reverseQuestions: "逆質問", companies: "企業", genres: "ジャンル", availability: "希望日", weeks: "週次の目標", plans: "予定" };
    const summary = Object.entries(plan.counts).filter(([, count]) => count.added || count.updated)
      .map(([key, count]) => `${labels[key]} 追加${count.added}件・更新${count.updated}件`).join("、");
    if (!summary) { this.message("取り込む新しい記録はありませんでした"); return; }
    this.modal("統合して取り込む", fields => {
      this.el("p", summary, fields);
      return () => null;
    }, () => {
      this.lastMergeBackup = JSON.parse(JSON.stringify(this.data));
      this.data = plan.data;
      this.clearUndoToast();
      const toast = this.el("div", null, document.body, "undo-toast");
      toast.setAttribute("role", "status");
      this.el("span", "取り込みました", toast);
      this.button(toast, "元に戻す", () => {
        if (!this.lastMergeBackup) return;
        this.data = this.lastMergeBackup;
        this.lastMergeBackup = null;
        this.clearUndoToast();
        this.changed();
        this.render();
      });
      this.undoToast = toast;
      this.undoTimer = setTimeout(() => this.clearUndoToast(), 10000);
    });
    document.querySelector('#edit-form button[type="submit"]').textContent = "取り込む";
  },
  commonDocuments: ["成績証明書", "卒業見込証明書", "履歴書", "証明写真", "健康診断書", "ES", "作品/ポートフォリオ"],
  renderDocuments(parent, company) {
    const documents = this.companyRecord(company)?.documents || [];
    const section = this.companySection(parent, "提出物", `済 ${documents.filter(item => item.done).length}/${documents.length}`, "documents");
    const save = () => {
      this.companyRecord(company, true).updatedAt = this.now();
      this.changed();
      this.render();
    };
    this.button(section, "よくある書類を足す", () => {
      const record = this.companyRecord(company, true);
      const documents = record.documents ||= [];
      const missing = this.commonDocuments.filter(name => !documents.some(item => item.name === name));
      if (!missing.length) return;
      missing.forEach(name => documents.push({ id: this.id(), name, done: false }));
      save();
    });
    this.button(section, "＋ 書類を追加", () => {
      this.modal("書類を追加", fields => {
        const name = this.field(fields, "名前", "");
        name.required = true;
        return () => name.value.trim();
      }, name => {
        if (!name) return false;
        const record = this.companyRecord(company, true);
        (record.documents ||= []).push({ id: this.id(), name, done: false });
        record.updatedAt = this.now();
      });
    });
    (this.companyRecord(company)?.documents || []).forEach(item => {
      const row = this.el("div", null, section, "document-row");
      const label = this.el("label", null, row);
      const check = this.el("input", null, label);
      check.type = "checkbox";
      check.checked = item.done;
      this.el("span", item.name, label);
      check.onchange = () => { item.done = check.checked; save(); };
      this.button(row, "削除", () => {
        if (!confirm("この書類を削除しますか？")) return;
        const documents = this.companyRecord(company, true).documents;
        const index = documents.indexOf(item);
        if (index < 0) return;
        documents.splice(index, 1);
        save();
      });
    });
  },
  searchAll(query) {
    const normalize = value => value.normalize("NFKC").toLowerCase().replace(/\s/g, "");
    const needle = normalize(String(query));
    const results = [];
    if (!needle) return results;
    const add = (type, label, value, go) => {
      if (results.length >= 50 || typeof value !== "string") return;
      const start = normalize(value).indexOf(needle);
      if (start < 0) return;
      const chars = Array.from(value);
      // 正規化で文字数が変わっても、元の本文の一致箇所を切り出す。
      const boundary = offset => {
        let low = 0, high = chars.length;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (normalize(chars.slice(0, mid).join("")).length < offset) low = mid + 1;
          else high = mid;
        }
        return low;
      };
      const from = boundary(start + 1) - 1, to = boundary(start + needle.length);
      results.push({ type, label, text: chars.slice(Math.max(0, from - 30), to + 30).join(""), go });
    };
    for (const item of this.data.deadlines || []) {
      for (const key of ["company", "title", "note"]) add("締め切り", [item.company, item.title].filter(Boolean).join("・"), item[key], "#deadlines");
    }
    for (const item of this.data.mypages || []) {
      for (const key of ["company", "note"]) add("マイページ", item.company, item[key], "#mypages");
    }
    for (const item of this.data.esQuestions || []) {
      add("ES", item.question, item.question, "#es");
      add("ES", item.question, item.note, "#es");
      for (const answer of item.answers || []) {
        for (const key of ["text", "note"]) add("ES", [answer.company, item.question].filter(Boolean).join("・"), answer[key], "#es");
      }
    }
    for (const item of this.data.gakuchika || []) {
      add("ガクチカ", item.title, item.title, "#gakuchika");
      for (const key of ["conclusion", "situation", "problem", "action", "result", "learning"]) add("ガクチカ", item.title, item.structure?.[key], "#gakuchika");
      for (const version of item.versions || []) add("ガクチカ", item.title, version.text, "#gakuchika");
    }
    for (const item of this.data.companies || []) {
      const go = "#company/" + encodeURIComponent(item.name);
      for (const field of item.research || []) add("企業研究", item.name + "・" + field.label, field.text, go);
      for (const key of ["area", "customer", "goal", "role", "strength", "why", "text"]) add("志望動機", item.name, item.motive?.[key], go);
      for (const log of item.interviews || []) {
        for (const key of ["date", "stage", "questions", "answers", "reflection", "reverse"]) add("面接ログ", item.name, log[key], go);
      }
      for (const log of item.meetings || []) add("説明会・OB訪問", item.name, log.notes, go);
    }
    return results;
  },
  async maybeBackup(now = new Date()) {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    if (this.backupPending) return this.backupPending;
    const data = JSON.parse(JSON.stringify(this.data));
    this.backupPending = (async () => {
      try {
        const { backups = [] } = await chrome.storage.local.get("backups");
        const time = new Date(now).getTime();
        const latest = Math.max(...backups.map(item => Date.parse(item.at)).filter(Number.isFinite));
        if (!Number.isFinite(time) || time - latest < 86400000) return;
        await chrome.storage.local.set({ backups: [{ at: new Date(time).toISOString(), data }, ...backups].slice(0, 7) });
      } catch (error) { this.message("控えを保存できませんでした：" + error.message); }
    })();
    try { await this.backupPending; } finally { this.backupPending = null; }
  },
  async restoreBackup(at) {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    try {
      const { backups = [] } = await chrome.storage.local.get("backups");
      const backup = backups.find(item => item.at === at);
      if (!backup) return;
      const data = this.validate(JSON.parse(JSON.stringify(backup.data)));
      if (!confirm("この控えで今のデータを置き換えますか？")) return;
      this.data = data;
      this.changed();
      this.render();
    } catch (error) { this.message("控えを戻せませんでした：" + error.message); }
  },
  async renderLocalBackups(root) {
    const section = this.el("section", null, root);
    if (!root?.setStatus) this.el("h2", "このChromeの中の控え", section);
    this.el("p", "1日1回、自動で控えを残します(最大7日分)。拡張機能を削除すると控えも消えるので、JSONの書き出しも続けてください", section, "muted note");
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    try {
      const { backups = [] } = await chrome.storage.local.get("backups");
      const latest = [...backups].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
      const date = latest && new Date(latest.at);
      if (root?.setStatus) root.setStatus(date && Number.isFinite(date.getTime()) ? `最新 ${date.getMonth() + 1}/${date.getDate()}` : "なし");
      if (!backups.length) this.el("p", "控えはまだありません", section, "muted");
      [...backups].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).forEach(backup => {
        const row = this.el("div", null, section, "card");
        this.el("p", `${new Date(backup.at).toLocaleString("ja-JP")}・締め切り${backup.data.deadlines.length}件`, row);
        this.button(row, "この控えに戻す", () => this.restoreBackup(backup.at));
      });
    } catch (error) { this.el("p", "控えを読み込めませんでした", section, "muted"); }
  },
  exportReminderDue(now = new Date()) {
    const at = Date.parse(this.lastExportAt);
    return !Number.isFinite(at) || new Date(now).getTime() - at >= 7 * 86400000;
  },
  finishDeadlineSelection(remove = false) {
    const selected = this.data.deadlines.filter(item => this.deadlineSelection && this.deadlineSelection.has(item.id));
    if (!selected.length) return;
    if (remove && !confirm(`${selected.length}件の締め切りを削除しますか?`)) return;
    let trashId;
    if (remove) {
      selected.forEach(item => { trashId = this.toTrash(this.data.deadlines, item); });
      this.data.deadlines = this.data.deadlines.filter(item => !selected.includes(item));
    } else selected.forEach(item => { item.status = "提出済"; item.updatedAt = this.now(); });
    this.deadlineSelection = null;
    this.changed();
    this.render();
    if (trashId) this.showUndoToast(trashId);
  },
  trashTypeOf(array, item) {
    for (const [key, type] of [["plans", "plan"], ["deadlines", "deadline"], ["mypages", "mypage"],
      ["esQuestions", "question"], ["gakuchika", "gakuchika"], ["reverseQuestions", "reverse"], ["preparation", "preparation"]]) {
      if (Array.isArray(array) && this.data[key] === array) return { type, parentId: null };
    }
    for (const [key, child, type] of [["esQuestions", "answers", "answer"],
      ["gakuchika", "versions", "version"], ["gakuchika", "usedIn", "use"],
      ["companies", "interviews", "interview"], ["companies", "meetings", "meeting"]]) {
      const parent = (this.data[key] || []).find(parent => Array.isArray(array) && parent[child] === array);
      if (parent) return { type, parentId: parent.id || null };
    }
    return { type: "other", parentId: null };
  },
  toTrash(array, item) {
    const entry = { id: this.id(), ...this.trashTypeOf(array, item),
      item: JSON.parse(JSON.stringify(item)), index: array.indexOf(item), deletedAt: this.now() };
    if (!this.data.trash) this.data.trash = [];
    this.data.trash.unshift(entry);
    this.data.trash.length = Math.min(this.data.trash.length, 200);
    return entry.id;
  },
  restoreTrash(id) {
    const entry = (this.data.trash || []).find(item => item.id === id);
    if (!entry) return;
    const top = { plan: "plans", deadline: "deadlines", mypage: "mypages", question: "esQuestions",
      gakuchika: "gakuchika", reverse: "reverseQuestions", preparation: "preparation" };
    const nested = { answer: ["esQuestions", "answers"], version: ["gakuchika", "versions"],
      use: ["gakuchika", "usedIn"], interview: ["companies", "interviews"], meeting: ["companies", "meetings"] };
    let array;
    if (Object.prototype.hasOwnProperty.call(top, entry.type)) {
      array = this.data[top[entry.type]] ||= [];
    } else if (Object.prototype.hasOwnProperty.call(nested, entry.type)) {
      const [key, child] = nested[entry.type];
      const parent = entry.parentId === null ? null : (this.data[key] || []).find(item => item.id === entry.parentId);
      if (parent) array = parent[child] ||= [];
    }
    if (!array) { this.message("元の場所がないため戻せません"); return; }
    const index = Number.isInteger(entry.index) && entry.index >= 0 && entry.index <= array.length
      ? entry.index : array.length;
    array.splice(index, 0, JSON.parse(JSON.stringify(entry.item)));
    this.data.trash.splice(this.data.trash.indexOf(entry), 1);
    if (this.undoTrashId === id) this.clearUndoToast();
    this.changed();
    this.render();
  },
  cleanTrash(now = new Date()) {
    if (!this.data.trash) return false;
    const before = this.data.trash.length;
    this.data.trash = this.data.trash.filter(entry => new Date(now).getTime() - Date.parse(entry.deletedAt) <= 30 * 86400000);
    return before !== this.data.trash.length;
  },
  clearUndoToast() {
    clearTimeout(this.undoTimer);
    if (this.undoToast) this.undoToast.remove();
    this.undoToast = null;
    this.undoTrashId = null;
  },
  showUndoToast(id) {
    this.clearUndoToast();
    const toast = this.el("div", null, document.body, "undo-toast");
    toast.setAttribute("role", "status");
    this.el("span", "削除しました", toast);
    this.button(toast, "元に戻す", () => this.restoreTrash(id));
    this.undoToast = toast;
    this.undoTrashId = id;
    this.undoTimer = setTimeout(() => this.clearUndoToast(), 5000);
  },
  renderTrash(root) {
    if (!root?.setStatus) this.el("h2", "ゴミ箱", root);
    const labels = { deadline: "締め切り", mypage: "マイページ", question: "ES設問", answer: "ES回答",
      gakuchika: "ガクチカ", version: "字数別の版", use: "使用記録", reverse: "逆質問", interview: "面接ログ", meeting: "説明会・OB訪問" };
    const entries = [...(this.data.trash || [])].sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt));
    if (!entries.length) this.el("p", "ゴミ箱は空です", root, "muted");
    entries.forEach(entry => {
      const row = this.el("div", null, root, "card");
      this.el("span", Object.prototype.hasOwnProperty.call(labels, entry.type) ? labels[entry.type] : "その他", row, "label");
      const item = entry.item;
      const summary = [item.title, item.company, item.question, item.text, item.questions, item.notes, item.stage, item.kind, item.date]
        .find(value => typeof value === "string" && value.trim()) || "内容なし";
      this.el("span", Array.from(summary.replace(/\s+/g, " ")).slice(0, 30).join(""), row);
      this.el("small", new Date(entry.deletedAt).toLocaleString("ja-JP"), row);
      this.button(row, "元に戻す", () => this.restoreTrash(entry.id));
    });
    this.button(root, "ゴミ箱を空にする", () => {
      if (!confirm("ゴミ箱を空にしますか？元に戻せなくなります。")) return;
      this.data.trash = [];
      this.clearUndoToast();
      this.changed();
      this.render();
    });
  }
});
