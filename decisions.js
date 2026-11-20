"use strict";
function validFollowUpDate(date) {
  if (typeof date !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || date.startsWith("0000")) return false;
  const parsed = new Date(date + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

Object.assign(App, {
  applicationItems(company) { return this.companyRecord(company)?.applications || []; },
  applicationLabel(item) { return [item.year, item.track, item.role].filter(Boolean).join(" / "); },
  editApplicationFollowUp(company, application, postponing = false) {
    const previous = application.followUp;
    this.modal(postponing ? "確認日を延期" : "次に確認する日を設定", parent => {
      const date = this.field(parent, "確認日", previous?.date || "", "date");
      date.required = true;
      const note = this.field(parent, "メモ", previous?.note || "", "textarea");
      return () => ({ date: date.value, note: note.value.trim(), done: false });
    }, followUp => {
      if (!validFollowUpDate(followUp.date) || (postponing && followUp.date <= previous.date)) {
        this.message(postponing ? "元の確認日より後の日付を指定してください。" : "有効な確認日を指定してください。");
        return false;
      }
      application.followUp = followUp;
      this.companyRecord(company).updatedAt = this.now();
    });
  },
  dueApplicationFollowUps(now = new Date()) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return (this.data.companies || []).flatMap(company => (company.applications || [])
      .filter(application => application.followUp && !application.followUp.done
        && application.followUp.date <= today && !["内定", "不合格", "辞退"].includes(application.stage))
      .map(application => ({ company, application })))
      .sort((a, b) => a.application.followUp.date.localeCompare(b.application.followUp.date));
  },
  renderApplicationFollowUp(parent, company, application) {
    const followUp = application.followUp;
    if (followUp) {
      this.el("p", "確認日 " + followUp.date + (followUp.done ? "（確認済み）" : ""), parent);
      if (followUp.note) this.el("p", followUp.note, parent, "pre");
    }
    this.button(parent, followUp && !followUp.done ? "確認日を編集" : "次に確認する日を設定",
      () => this.editApplicationFollowUp(company, application));
    if (!followUp || followUp.done) return;
    this.button(parent, "延期", () => this.editApplicationFollowUp(company, application, true));
    this.button(parent, "確認済みにする", () => {
      followUp.done = true;
      this.companyRecord(company).updatedAt = this.now();
      this.changed();
      this.render();
    });
  },
  nextActions(company, applicationId = "") {
    const records = this.data.deadlines.filter(d => d.company === company && (d.applicationId || "") === applicationId);
    const open = records.filter(d => ["未着手", "進行中"].includes(d.status)).sort((a,b) => a.dueAt.localeCompare(b.dueAt));
    const actions = open.map(d => ({ text: d.kind + "：" + d.title + "（" + d.dueAt + "）", item: d }));
    if (records.some(d => d.kind === "ES" && d.status === "提出済") && !records.some(d => d.kind === "Webテスト"))
      actions.push({ text: "Webテストの案内・受験要否を確認（記録なし）" });
    return actions;
  },
  renderApplications(root, company) {
    const section = this.isNarrow()
      ? this.foldSection(root, "応募別の管理", "応募別の管理・次の一手", `${this.applicationItems(company).length}件`)
      : this.companySection(root, "応募別の管理・次の一手", "", "card applications");
    if (this.isNarrow()) section.className += " applications";
    this.button(section, "応募を追加", () => this.modal("応募を追加", parent => {
      const year = this.field(parent, "応募年度", String(new Date().getFullYear())); year.required = true; year.pattern = "[0-9]{4}";
      const track = this.field(parent, "応募区分", "本選考", "", ["本選考", "夏インターン", "冬インターン", "その他"]);
      const role = this.field(parent, "職種", ""); role.required = true;
      return () => ({ id: this.id(), year: year.value.trim(), track: track.value, role: role.value.trim(), stage: "未応募" });
    }, values => {
      const record = this.companyRecord(company, true);
      if (!/^\d{4}$/.test(values.year) || !values.role) { this.message("年度は4桁、職種は必須です。"); return false; }
      (record.applications ||= []).push(values); record.updatedAt = this.now();
    }));
    const groups = [{ id: "", label: "応募未設定（既存の記録）" }, ...this.applicationItems(company).map(a => ({ ...a, label: this.applicationLabel(a) }))];
    groups.forEach(group => {
      this.el("h4", group.label, section);
      if (group.id) {
        const application = this.applicationItems(company).find(item => item.id === group.id);
        this.button(section, "応募の年度・職種を編集", () => this.modal("応募を編集", parent => {
          const year = this.field(parent, "応募年度", group.year); year.required = true; year.pattern = "[0-9]{4}";
          const track = this.field(parent, "応募区分", group.track, "", ["本選考", "夏インターン", "冬インターン", "その他"]);
          const role = this.field(parent, "職種", group.role); role.required = true;
          return () => ({ year: year.value.trim(), track: track.value, role: role.value.trim() });
        }, values => {
          if (!/^\d{4}$/.test(values.year) || !values.role) return false;
          Object.assign(this.applicationItems(company).find(a => a.id === group.id), values);
          this.companyRecord(company).updatedAt = this.now();
        }));
        const stage = this.field(section, "この応募の選考状況", group.stage, "", this.stages);
        stage.onchange = () => {
          const a = this.applicationItems(company).find(a => a.id === group.id);
          if (a.stage !== stage.value) a.stageDetail = "";
          a.stage = stage.value;
          this.companyRecord(company).updatedAt = this.now(); this.changed(); this.render();
        };
        this.renderStageDetail(section, group.stageDetail, group.stage, detail => {
          const a = this.applicationItems(company).find(a => a.id === group.id);
          a.stageDetail = detail;
          this.companyRecord(company).updatedAt = this.now(); this.changed(); this.render();
        });
        this.el("p", this.stageLabel(group.stage, group.stageDetail), section, "muted stage-label");
        this.renderApplicationFollowUp(section, company, application);
      }
      const items = this.data.deadlines.filter(d => d.company === company && (d.applicationId || "") === group.id);
      items.forEach(d => {
        const row = this.el("div", null, section, "toolbar");
        this.el("span", d.title + " / " + d.status, row);
        const select = this.field(row, "応募先", d.applicationId || "", "", groups.map(g => ({ value:g.id, label:g.label })));
        select.onchange = () => { d.applicationId = select.value; d.updatedAt = this.now(); this.changed(); this.render(); };
      });
      this.data.esQuestions.forEach(q => (q.answers || []).filter(a => a.company === company && (a.applicationId || "") === group.id).forEach(a => {
        const row = this.el("div", null, section, "toolbar");
        this.el("span", "ES：" + q.question, row);
        const select = this.field(row, "この回答の応募先", a.applicationId || "", "", groups.map(g => ({ value: g.id, label: g.label })));
        select.onchange = () => { a.applicationId = select.value; a.updatedAt = this.now(); this.changed(); this.render(); };
      }));
      const actions = ["内定", "不合格", "辞退"].includes(group.stage) ? [] : this.nextActions(company, group.id);
      actions.forEach(action => { this.el("p", "次の一手：" + action.text, section); });
      if (!actions.length) this.el("p", "現在の記録から提案できる行動はありません。", section, "muted");
    });
  }
});

const originalTodayView = App.renderToday;
App.renderToday = function(root) {
  originalTodayView.call(this, root);
  const followUps = this.dueApplicationFollowUps();
  if (followUps.length) {
    const section = this.el("section", null, root, "card");
    this.el("h3", "今日の作業：応募の状況確認", section);
    for (const { company, application } of followUps) {
      const row = this.el("article", null, section, "card");
      this.el("h4", company.name + " / " + this.applicationLabel(application), row);
      this.renderApplicationFollowUp(row, company.name, application);
    }
  }

  this.allCompanyNames().forEach(company => ["", ...this.applicationItems(company).filter(a => !["内定", "不合格", "辞退"].includes(a.stage)).map(a => a.id)].forEach(id => {
    this.nextActions(company, id).filter(a => !a.item).forEach(a => this.el("p", company + " / " + (this.applicationItems(company).find(x => x.id === id) ? this.applicationLabel(this.applicationItems(company).find(x => x.id === id)) : "応募未設定") + "：" + a.text, root));
  }));
};
const originalDeadlineCard = App.deadlineCard;
App.deadlineCard = function(parent, item, now) {
  const card = originalDeadlineCard.call(this, parent, item, now);
  if (!["auto", "page", "paste"].includes(item.source)) return card;
  const more = Array.from(card.children).find(child => (child.className || "").split(/\s+/).includes("card-more"));
  const details = this.el("details", null, more || card, "card");
  this.el("summary", "取得の根拠・訂正：" + item.title, details);
  this.el("p", "出典URL：" + (item.evidence?.url || item.url || "記録なし"), details);
  this.el("p", "取得日時：" + (item.evidence?.foundAt || "記録なし"), details);
  this.el("p", "元の文章：" + (item.evidence?.text || "過去の記録には保存されていません"), details);
  this.el("p", "訂正理由：" + (item.correctionReason || "なし"), details);
  this.button(details, "企業・日付・種別を訂正", () => this.editDeadline(item));
  this.button(details, "訂正理由を記録", () => this.modal("訂正理由", p => {
    const reason = this.field(p, "理由（別企業・説明会の日付など）", item.correctionReason || "", "textarea");
    return () => reason.value;
  }, reason => { item.correctionReason = reason; item.updatedAt = this.now(); }));
  return card;
};

const originalCompanyView = App.renderCompany;
App.renderCompany = function(root, company) { originalCompanyView.call(this, root, company); this.renderApplications(root, company); };

// Optional fields preserve version 1 and reject malformed imported additions.
const validateBeforeDecisions = App.validate;
App.validate = function(data) {
  validateBeforeDecisions.call(this, data);
  
  for (const company of data.companies || []) {
    if (company.applications === undefined) continue;
    if (!Array.isArray(company.applications)) throw new Error("応募の形式が不正です。");
    const ids = new Set();
    for (const a of company.applications) {
      if (!a || !["id", "year", "track", "role", "stage"].every(k => typeof a[k] === "string") || !a.id || ids.has(a.id)
        || (a.stageDetail !== undefined && typeof a.stageDetail !== "string")
        || !/^\d{4}$/.test(a.year) || !a.role.trim() || !this.stages.includes(a.stage)) throw new Error("応募の形式が不正です。");
      ids.add(a.id);
      const followUp = a.followUp;
      if (followUp !== undefined && (!followUp || !validFollowUpDate(followUp.date)
        || typeof followUp.note !== "string" || typeof followUp.done !== "boolean")) {
        throw new Error("応募の確認日の形式が不正です。");
      }
    }

  }
  for (const item of [...data.deadlines, ...data.esQuestions.flatMap(q => q.answers || [])]) {
    if (item.applicationId !== undefined && typeof item.applicationId !== "string") throw new Error("応募先の形式が不正です。");
    if (item.evidence !== undefined && (!item.evidence || !["url", "text", "foundAt"].every(k => typeof item.evidence[k] === "string"))) throw new Error("取得根拠の形式が不正です。");
    if (item.correctionReason !== undefined && typeof item.correctionReason !== "string") throw new Error("訂正理由の形式が不正です。");
  }
  return data;
};
