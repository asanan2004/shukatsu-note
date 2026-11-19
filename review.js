"use strict";
Object.assign(App, {
  escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  },
  mobileHtml(now = new Date()) {
    const escape = text => this.escapeHtml(text);
    const tag = (name, text) => `<${name}>${escape(text)}</${name}>`;
    const heading = text => tag("h3", text);
    const paragraph = text => tag("p", text);
    const section = (title, body) => tag("h2", title) + (body || paragraph("記録はありません"));
    const names = this.allCompanyNames();
    const active = this.data.deadlines.filter(item => ["未着手", "進行中"].includes(item.status))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const deadlines = maximum => active.filter(item => {
      const days = this.remaining(item, now).days;
      return days >= 0 && days <= maximum;
    }).map(item => "<article>" + paragraph(`${item.dueAt.replace("T", " ")} · ${item.company} · ${item.title} · ${item.kind}`) + "</article>").join("");
    const questions = this.data.reverseQuestions || [];
    const notes = names.map(name => {
      const record = this.companyRecord(name);
      let body = heading("志望動機") + paragraph(record?.motive?.text || "未記入");
      body += heading("提出したES");
      this.data.esQuestions.forEach(question => question.answers.filter(answer => answer.company === name)
        .forEach(answer => { body += heading(question.question) + paragraph(answer.submitted ? answer.submitted.text : answer.text); }));
      body += heading("面接ログの反省点");
      [...(record?.interviews || [])].sort((a, b) => b.date.localeCompare(a.date)).forEach(log => {
        if (log.reflection.trim()) body += paragraph(`${log.date} · ${log.stage}`) + paragraph(log.reflection);
      });
      body += heading("逆質問");
      questions.filter(item => item.company === name).forEach(item => { body += paragraph(item.text); });
      body += heading("企業研究");
      (record?.research || []).filter(item => item.text.trim()).forEach(item => {
        body += heading(item.label) + paragraph(item.text);
      });
      return "<details>" + tag("summary", name) + body + "</details>";
    }).join("");
    const pipeline = names.filter(name => this.stages.slice(1, 6).includes(this.companyStage(name)))
      .map(name => "<article>" + paragraph(`${name} · ${this.companyStage(name)} · 志望度:${this.companyRecord(name)?.rank || "未設定"}`) + "</article>").join("");
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
      + tag("title", "就活ノート(スマホ用)")
      + '<style>body{font:16px/1.7 sans-serif;margin:0;padding:16px;background:#f4f6fa;color:#172338;overflow-wrap:anywhere}main{max-width:720px;margin:auto}article,details{background:#fff;border:1px solid #ccd3df;border-radius:12px;padding:16px;margin:12px 0}summary{cursor:pointer;font-weight:bold}details[open] summary{border-bottom:1px solid #ccd3df;padding-bottom:8px}p{white-space:pre-wrap}h2{margin-top:32px}h3{font-size:16px}</style></head><body><main>'
      + tag("h1", "就活ノート(スマホ用)") + paragraph(`書き出した日時:${now.toLocaleString("ja-JP")}`)
      + section("今日・明日", deadlines(1)) + section("今週", deadlines(7))
      + section("選考中の企業", pipeline) + section("企業ごとのメモ", notes)
      + section("逆質問(共通)", questions.filter(item => !item.company && !item.used).map(item => paragraph(item.text)).join(""))
      + "</main></body></html>";
  },
  isoWeek(date) {
    const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
    const year = day.getUTCFullYear();
    const first = new Date(Date.UTC(year, 0, 1));
    return `${year}-W${String(Math.ceil(((day - first) / 86400000 + 1) / 7)).padStart(2, "0")}`;
  },
  renderWeek(parent, now = new Date()) {
    const key = this.isoWeek(now);
    const section = this.el("section", null, parent, "weekly-goals");
    this.el("h3", "今週の目標", section);
    const current = () => (this.data.weeks || []).find(item => item.week === key);
    const ensure = () => {
      if (!this.data.weeks) this.data.weeks = [];
      if (!current()) this.data.weeks.push({ week: key, goals: [], review: "" });
      return current();
    };
    const refresh = () => { this.changed(); section.remove(); this.renderWeek(parent, now); };
    const add = (text, target) => { ensure().goals.push({ text, target, done: 0 }); };
    this.button(section, "＋ 目標を追加", () => {
      this.modal("目標を追加", fields => {
        const text = this.field(fields, "文", ""); text.required = true;
        const target = this.field(fields, "数", 3, "number"); target.min = "0"; target.required = true;
        return () => ({ text: text.value.trim(), target: Number(target.value) });
      }, values => {
        if (!values.text || !Number.isFinite(values.target) || values.target < 0) return false;
        add(values.text, values.target);
      });
    });
    const suggestions = this.el("div", null, section, "actions");
    ["ESを出す", "Webテストを受ける", "企業研究をする", "OB訪問をする"].forEach(text => {
      this.button(suggestions, text, () => { add(text, 3); refresh(); });
    });
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const end = new Date(monday); end.setDate(end.getDate() + 7);
    const auto = this.data.deadlines.filter(item => item.kind === "ES" && item.status === "提出済"
      && new Date(item.updatedAt) >= monday && new Date(item.updatedAt) < end).length;
    const goals = current()?.goals || [];
    goals.forEach(goal => {
      const row = this.el("div", null, section, "card deadline-meta");
      this.el("span", `${goal.text} · 目標${goal.target} · 進んだ数${goal.done}`, row);
      if (goal.text === "ESを出す") this.el("small", `自動:${auto}`, row);
      const actions = this.el("div", null, row, "deadline-actions");
      this.button(actions, "＋1", () => { goal.done++; refresh(); });
      this.button(actions, "−1", () => { goal.done = Math.max(0, goal.done - 1); refresh(); });
      this.button(actions, "削除", () => this.remove(goals, goal));
    });
    if (now.getDay() === 0 || (goals.length > 0 && goals.every(goal => goal.done >= goal.target))) {
      const review = this.field(section, "振り返り", current()?.review || "", "textarea");
      review.onchange = () => { ensure().review = review.value; this.changed(); };
    }
    const previousDate = new Date(monday); previousDate.setDate(previousDate.getDate() - 7);
    const previous = (this.data.weeks || []).find(item => item.week === this.isoWeek(previousDate));
    if (previous) this.el("small", `先週:達成${previous.goals.filter(goal => goal.done >= goal.target).length}/${previous.goals.length}`, section);
  },
  webtestFormats: ["SPI", "玉手箱", "TG-WEB", "GAB", "CAB", "eF-1G", "その他"],
  webtestFeelings: ["よい", "ふつう", "不安"],
  webtestDefaultDate(company) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.data.deadlines.filter(item => item.company === company && item.kind === "Webテスト")
      .sort((a, b) => Math.abs(new Date(a.dueAt) - today) - Math.abs(new Date(b.dueAt) - today)
        || a.dueAt.localeCompare(b.dueAt))[0]?.dueAt.slice(0, 10) || "";
  },
  editWebtest(company, item) {
    this.modal("Webテストを記録", parent => {
      const format = this.field(parent, "形式", item?.format || this.webtestFormats[0], "", this.webtestFormats);
      const date = this.field(parent, "受検日(予約した日)", item ? item.date : this.webtestDefaultDate(company), "date");
      const start = this.field(parent, "受検期間の始まり", item?.start || "", "date");
      const deadlineValue = item?.deadline || "";
      const deadline = this.field(parent, "受検期限", deadlineValue.length === 10 ? deadlineValue + "T00:00" : deadlineValue, "datetime-local");
      const center = this.field(parent, "テストセンター", "", "checkbox");
      center.checked = item?.center || false;
      const reusable = this.field(parent, "前回の結果を送れる", "", "checkbox");
      reusable.checked = item?.reusable || false;
      const done = this.field(parent, "受験済み", "", "checkbox");
      done.checked = item?.done || false;
      const feeling = this.field(parent, "手応え", item?.feeling || "ふつう", "", this.webtestFeelings);
      const note = this.field(parent, "メモ", item?.note || "", "textarea");
      return () => ({ format: format.value, date: date.value, done: done.checked,
        start: start.value, deadline: deadline.value === deadlineValue + "T00:00" ? deadlineValue : deadline.value,
        center: center.checked, reusable: reusable.checked,
        feeling: feeling.value, note: note.value });
    }, values => {
      const record = this.companyRecord(company, true);
      if (!record.webtests) record.webtests = [];
      if (item) Object.assign(item, values);
      else record.webtests.push({ id: this.id(), ...values });
      record.updatedAt = this.now();
    });
  },
  renderWebtests(parent, company) {
    const section = this.el("section", null, parent, "webtests");
    this.el("h3", "Webテスト", section);
    this.button(section, "＋ Webテストを記録", () => this.editWebtest(company));
    const items = this.companyRecord(company)?.webtests || [];
    [...items].sort((a, b) => b.date.localeCompare(a.date)).forEach(item => {
      const card = this.el("article", null, section, "card webtest-card");
      const meta = this.el("div", null, card, "deadline-meta");
      [item.format, item.date || "日付未指定", item.done ? "受験済み" : "未受験", item.feeling]
        .forEach(text => this.el("span", text, meta, "label"));
      if (item.center) this.el("span", "テストセンター", meta, "label");
      if (item.reusable) this.el("span", "前回結果OK", meta, "label");
      if (item.deadline) {
        const shortDate = value => value.slice(5, 10).replace("-", "/");
        const text = item.start ? `期間 ${shortDate(item.start)}〜${shortDate(item.deadline)}`
          : `期限 ${shortDate(item.deadline)}${item.deadline.includes("T") ? " " + item.deadline.slice(11, 16) : ""}`;
        const overdue = !item.done && new Date(item.deadline) < new Date();
        this.el("span", text, meta, overdue ? "label danger" : "label");
      }
      this.el("p", item.note, card, "pre");
      const actions = this.el("div", null, meta, "deadline-actions");
      this.button(actions, "編集", () => this.editWebtest(company, item));
      this.button(actions, "削除", () => this.remove(items, item));
    });
  },
  rejectionStage(company) {
    const record = this.companyRecord(company);
    return record?.rejection?.stage ?? [...(record?.stageHistory || [])].reverse()
      .find(item => item.stage !== "不合格")?.stage ?? "未応募";
  },
  renderRejection(parent, company) {
    if (this.companyStage(company) !== "不合格") return;
    const section = this.el("section", null, parent, "rejection");
    this.el("h3", "振り返り", section);
    const value = this.rejectionStage(company);
    const stage = this.field(section, "落ちた段階", value, "", [...new Set([
      ...this.stages.filter(item => item !== "不合格"), value])]);
    const hypothesis = this.field(section, "自分の仮説(なぜ落ちたと思うか)",
      this.companyRecord(company)?.rejection?.hypothesis || "", "textarea");
    const save = () => {
      const record = this.companyRecord(company, true);
      record.rejection = { stage: stage.value, hypothesis: hypothesis.value };
      record.updatedAt = this.now();
      this.changed();
    };
    stage.onchange = save;
    hypothesis.onchange = save;
  },
  renderReviewStats(parent, names) {
    const tests = names.flatMap(name => this.companyRecord(name)?.webtests || []);
    if (tests.length) {
      const stats = this.el("div", null, parent, "webtest-stats");
      this.el("h3", "Webテストの形式別", stats);
      [...new Set([...this.webtestFormats, ...tests.map(item => item.format)])].forEach(format => {
        const items = tests.filter(item => item.format === format);
        if (items.length) this.el("p", `${format} 受験${items.filter(item => item.done).length}・不安${items.filter(item => item.feeling === "不安").length}`, stats);
      });
    }
    const counts = new Map();
    names.filter(name => this.companyStage(name) === "不合格").forEach(name => {
      const stage = this.rejectionStage(name);
      counts.set(stage, (counts.get(stage) || 0) + 1);
    });
    if (counts.size) {
      const stats = this.el("div", null, parent, "rejection-stats");
      this.el("h3", "落ちた段階", stats);
      const maximum = Math.max(...counts.values());
      counts.forEach((count, stage) => this.el("p", `${stage} ${count}件`
        + (count >= 3 && count === maximum ? " ここで落ちやすい傾向があります" : ""), stats));
    }
  }
});
