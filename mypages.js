"use strict";
Object.assign(App, {
  mypageStatuses: ["未登録", "登録済", "選考中", "内定", "終了"],
  recordMailResult(values) {
    const company = values.company.trim();
    const status = { "通過": "選考中", "内定": "内定", "不合格": "終了" }[values.result];
    if (!this.data.mypages) this.data.mypages = [];
    const item = this.data.mypages.find(page => page.company === company);
    const now = this.now();
    if (item) {
      item.status = status;
      item.note = (item.note ? item.note + "\n" : "") + values.note;
      item.updatedAt = now;
    } else {
      this.data.mypages.push({ id: this.id(), company, url: "", loginId: "", status,
        note: values.note, createdAt: now, updatedAt: now });
    }
    this.setCompanyStage(company, values.result === "通過" ? this.nextStage(this.companyStage(company)) : values.result);
    this.changed();
    this.render();
    if (values.result === "通過") this.offerPlanAfterPass(company, true);
  },
  editMailResult(pending) {
    this.modal("メールから選考結果", parent => {
      if (pending.reason) this.el("p", `判定の理由: ${pending.reason}`, parent, "muted notice-detail");
      if (pending.guessed) this.el("p", "企業名はメールから推測しました。確かめてください", parent, "muted notice-detail");
      const company = this.field(parent, "企業名", pending.company); company.required = true;
      this.companySuggestions(parent, company, "mail-result-companies");
      const result = this.field(parent, "結果", pending.result, "", ["通過", "内定", "不合格"]);
      const today = new Date();
      const date = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
      const prefix = date + " 件名:" + (typeof pending.subject === "string" ? pending.subject : "") + " → ";
      let automaticNote = prefix + result.value + "(メールから)";
      const note = this.field(parent, "メモに足す文", automaticNote, "textarea");
      result.onchange = () => {
        const next = prefix + result.value + "(メールから)";
        if (note.value === automaticNote) note.value = next;
        automaticNote = next;
      };
      return () => ({ company: company.value.trim(), result: result.value, note: note.value });
    }, values => {
      document.getElementById("editor").close();
      this.recordMailResult(values);
      return false;
    });
  },
  mypageFilter: { company: "", status: "", sort: "added" },
  mypageUrlFor(company) {
    const item = (this.data.mypages || []).filter(m => m.company === company && /^https?:[/][/]/.test(m.url))
      .sort((a, b) => a.company.localeCompare(b.company, "ja"))[0];
    return item ? item.url : "";
  },
  deadlineLinkFor(item) {
    const companyUrl = this.mypageUrlFor(item.company);
    if (companyUrl) return { url: companyUrl, label: "マイページ" };
    let url;
    try { url = new URL(item.url); } catch { return null; }
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const matches = ShukatsuShared.matchMypages(item.url, this.data.mypages || []);
    if (matches.length) return { url: matches[0].url, label: "マイページ" };
    return { url: item.url, label: /mypage/i.test(url.pathname) ? "マイページ" : "ページを開く" };
  },
  companyNames() {
    return [...new Set([...this.data.deadlines.map(d => d.company), ...(this.data.mypages || []).map(m => m.company)])].sort((a,b) => a.localeCompare(b,"ja"));
  },
  companySuggestions(parent, input, id) {
    input.setAttribute("list", id); const list = this.el("datalist", null, parent); list.id = id;
    this.companyNames().forEach(name => { this.el("option", name, list).value = name; });
  },
  editMypage(item, initial = {}) {
    const current = item || initial;
    this.modal(item ? "マイページを編集" : "マイページを追加", parent => {
      const company = this.field(parent, "企業名", current.company || ""); company.required = true;
      this.companySuggestions(parent, company, "mypage-companies");
      const url = this.field(parent, "URL", current.url || "");
      const loginId = this.field(parent, "ログインIDのメモ（任意）", item ? item.loginId : "");
      this.el("small", "パスワードは入力しないでください。Chromeのパスワードマネージャーを使ってください", parent);
      const status = this.field(parent, "状態", current.status || "未登録", "", this.mypageStatuses);
      const note = this.field(parent, "メモ", item ? item.note : "", "textarea");
      return () => ({ company: company.value.trim(), url: url.value, loginId: loginId.value, status: status.value, note: note.value });
    }, values => {
      if (item) Object.assign(item, values, { updatedAt: this.now() });
      else { if (!this.data.mypages) this.data.mypages = [];
        this.data.mypages.push(Object.assign(values, { id: this.id(), createdAt: this.now(), updatedAt: this.now() })); }
    });
  },
  mypageDeadlineCount(company) {
    return this.data.deadlines.filter(d => d.company === company && ["未着手", "進行中"].includes(d.status)).length;
  },
  renderMypages(root) {
    const head = this.el("div", null, root, "page-head");
    this.el("h2", "マイページ", head);
    this.button(head, "+ マイページを追加", () => this.editMypage());
    const filters = this.el("div", null, root, "toolbar");
    const company = this.field(filters, "企業名検索", this.mypageFilter.company);
    company.placeholder = "企業名・URL・メモ";
    company.setAttribute("aria-label", "企業名・URL・メモを検索");
    const status = this.field(filters, "状態", this.mypageFilter.status, "", [{ label: "すべて", value: "" }, ...this.mypageStatuses]);
    const sort = this.field(filters, "並び順", this.mypageFilter.sort || "added", "", [
      { label: "追加が新しい順", value: "added" },
      { label: "企業名順", value: "name" }, { label: "次の締め切りが近い順", value: "next" }
    ]);
    [company, status, sort].forEach(input => { input.onchange = () => { this.mypageFilter = { company: company.value, status: status.value, sort: sort.value }; this.render(); }; });
    const nextDates = new Map();
    if (this.mypageFilter.sort === "next") {
      ShukatsuShared.activeDeadlines(this.data.deadlines).forEach(d => {
        if (!nextDates.has(d.company)) nextDates.set(d.company, d.dueAt);
      });
    }
    const items = (this.data.mypages || []).filter(m => [m.company, m.url || "", m.note || ""].some(value => this.companyMatches(value, this.mypageFilter.company)) && (!this.mypageFilter.status || m.status === this.mypageFilter.status)).sort((a, b) => {
      const pinned = this.companyPinOrder ? this.companyPinOrder(a.company, b.company) : 0;
      if (pinned) return pinned;
      if ((this.mypageFilter.sort || "added") === "added") {
        return (b.createdAt || "").localeCompare(a.createdAt || "") || a.company.localeCompare(b.company, "ja");
      }
      const aDate = nextDates.get(a.company), bDate = nextDates.get(b.company);
      if (aDate && bDate) return aDate.localeCompare(bDate) || a.company.localeCompare(b.company, "ja");
      if (aDate || bDate) return aDate ? -1 : 1;
      return a.company.localeCompare(b.company, "ja");
    });
    if (!items.length) this.el("p", "該当するマイページはありません。", root);
    items.forEach(item => {
      const row = this.el("div", null, root, "card mypage-card");
      this.companyAvatar(row, item.company);
      const content = this.el("div", null, row, "mypage-content");
      const top = this.el("div", null, content, "mypage-heading");
      const heading = this.el("h3", null, top, "company-heading");
      this.companyLink(heading, item.company);
      if (this.companyPinButton) this.companyPinButton(top, item.company);
      this.button(top, "削除", () => this.remove(this.data.mypages, item));
      const urls = this.el("div", null, content, "mypage-url-row");
      const url = this.el("span", item.url || "", urls, "mypage-url");
      url.title = item.url || "";
      if (/^https?:[/][/]/i.test(item.url)) { const link = this.el("a", "開く", urls, "button-link"); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; }
      this.button(urls, "URL編集", () => this.modal("URLを編集", parent => {
        const input = this.field(parent, "URL", item.url || "");
        return () => ({ url: input.value });
      }, values => { item.url = values.url; item.updatedAt = this.now(); }));
      if (item.loginId) this.el("small", item.loginId, content, "pre muted");
      this.selectionProgress(content, item.company);
      if (this.stageLabel) this.el("p", this.stageLabel(this.companyStage(item.company), this.companyRecord(item.company)?.stageDetail), content, "muted stage-label");
      const meta = this.el("div", null, content, "deadline-meta");
      this.el("span", item.status, meta, "label mypage-status status-" + this.mypageStatuses.indexOf(item.status));
      this.el("span", "締め切り" + this.mypageDeadlineCount(item.company) + "件", meta);
      const next = ShukatsuShared.activeDeadlines(this.data.deadlines.filter(d => d.company === item.company))[0];
      if (next) {
        const remaining = this.remaining(next);
        const date = next.dueAt.slice(0, 10).split("-");
        const time = next.dueAt.length > 10 ? " " + next.dueAt.slice(11, 16) : "";
        this.el("span", `次:${Number(date[1])}/${Number(date[2])}${time} ${next.kind}(${remaining.text})`, meta, remaining.expired ? "danger" : "");
      }
      const actions = this.el("div", null, meta, "deadline-actions");
      this.button(actions, "編集", () => this.editMypage(item));
      if (item.note) this.el("p", item.note, content, "pre");
    });
  }
});
