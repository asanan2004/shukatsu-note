"use strict";
Object.assign(App, {
  frequentQuestions() {
    const groups = [];
    (this.data.companies || []).forEach(company => {
      (company.interviews || []).forEach(log => {
        (log.questions || "").split(/\r\n|[\r\n]/).forEach(line => {
          const text = Array.from(line.trim().replace(/^(?:(?:[・●○▪■◆◇*＊\-－–—]+|[0-9０-９]+[.．、)）]|[(（][0-9０-９]+[)）])\s*)+/u, "").trim()).slice(0, 120).join("");
          if (!text) return;
          let group = groups.find(item => this.similarity(item.text, text) >= 0.5);
          if (!group) {
            group = { text, count: 0, companies: [], latest: "" };
            groups.push(group);
          }
          if (Array.from(text).length < Array.from(group.text).length) group.text = text;
          group.count++;
          if (!group.companies.includes(company.name)) group.companies.push(company.name);
          if ((log.date || "") > group.latest) group.latest = log.date;
        });
      });
    });
    return groups.sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest))
      .slice(0, 15).map(group => ({ ...group, es: this.similarQuestions(group.text)[0]?.question || null }));
  },
  renderPrep(root, company) {
    const record = this.companyRecord(company);
    const head = this.el("div", null, root, "page-head");
    const heading = this.el("h2", null, head, "company-heading");
    this.companyAvatar(heading, company);
    heading.append(document.createTextNode(company));
    this.button(head, "戻る", () => window.history.back());
    this.button(head, "印刷", () => window.print());
    this.el("p", `ステージ: ${this.companyStage(company)}・志望度: ${record?.rank || "未設定"}`, root);
    const section = title => {
      const node = this.el("section", null, root);
      this.el("h3", title, node);
      return node;
    };
    const motive = section("志望動機"), text = record?.motive?.text || "";
    this.el("p", text.trim() ? text : "まだありません", motive, text.trim() ? "pre" : "muted");
    const es = section("提出したES");
    this.data.esQuestions.forEach(question => {
      question.answers.filter(answer => answer.company === company).forEach(answer => {
        this.el("h4", question.question, es);
        this.el("p", answer.submitted ? answer.submitted.text : answer.text, es, "pre");
        if (answer.submitted && this.showAnswerDiff) this.button(es, "提出版との差分", () => this.modal("提出版と最新原稿", p => { this.showAnswerDiff(p, answer); return () => null; }, () => {}));
      });
    });
    const episodes = section("使ったガクチカ");
    this.data.gakuchika.filter(item => item.usedIn.some(use => use.company === company)).forEach(item => {
      this.el("h4", item.title, episodes);
      [["conclusion", "結論"], ["action", "行動"], ["result", "結果"]].forEach(([key, label]) => {
        this.el("h4", label, episodes);
        this.el("p", item.structure?.[key] || "未記入", episodes, "pre");
      });
    });
    const logs = [...(record?.interviews || [])].sort((a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const reflections = section("前回の反省");
    logs.filter(log => log.reflection.trim()).forEach(log => this.el("p", log.reflection, reflections, "pre"));
    const interviews = section("面接ログ");
    logs.forEach(log => {
      this.el("h4", `${log.date || "日付未指定"}・${log.stage}`, interviews);
      this.el("p", log.questions, interviews, "pre");
    });
    const reverse = section("逆質問");
    (this.data.reverseQuestions || []).filter(item => item.company === company || (!item.company && !item.used))
      .forEach(item => this.el("p", item.text, reverse, "pre"));
    const research = section("企業研究");
    (record?.research || []).filter(item => item.text.trim()).forEach(item => {
      this.el("h4", item.label, research);
      this.el("p", item.text, research, "pre");
    });
  },
  reverseFilter: { company: "", stage: "" },
  addReverseQuestions(company, stage, text) {
    const lines = text.split(/\r\n|[\r\n]/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return;
    if (!this.data.reverseQuestions) this.data.reverseQuestions = [];
    lines.forEach(line => {
      if (this.data.reverseQuestions.some(item => item.company === company && item.text === line)) return;
      this.data.reverseQuestions.push({ id: this.id(), text: line, company, stage,
        used: false, createdAt: this.now() });
    });
  },
  renderReverseBank(parent) {
    const section = this.el("section", null, parent, "reverse-bank");
    this.el("h3", "逆質問バンク", section);
    const items = this.data.reverseQuestions || [];
    const companies = [...new Set([...this.allCompanyNames(), ...items.map(item => item.company)])].filter(Boolean);
    const filters = this.el("div", null, section, "toolbar");
    // 値は企業名を添字で指定し、空文字の「すべて」と共通を区別する。
    const company = this.field(filters, "企業", this.reverseFilter.company, "", [
      { label: "すべて", value: "" }, { label: "共通", value: "common" },
      ...companies.map(name => ({ label: name, value: "company:" + name }))]);
    const stage = this.field(filters, "段階", this.reverseFilter.stage, "", [
      { label: "すべて", value: "" }, ...this.stages]);
    company.onchange = () => { this.reverseFilter.company = company.value; this.render(); };
    stage.onchange = () => { this.reverseFilter.stage = stage.value; this.render(); };
    this.button(section, "＋ 逆質問を追加", () => {
      this.modal("逆質問を追加", fields => {
        const text = this.field(fields, "文（1行1件）", "", "textarea");
        text.required = true;
        const name = this.field(fields, "企業（任意・空なら共通）", "");
        const list = this.el("datalist", null, fields);
        list.id = "reverse-company-options";
        name.setAttribute("list", list.id);
        companies.forEach(value => { this.el("option", value, list).value = value; });
        const step = this.field(fields, "段階（任意）", "", "", [
          { label: "未指定", value: "" }, ...this.stages]);
        return () => ({ text: text.value, company: name.value.trim(), stage: step.value });
      }, values => {
        if (!values.text.trim()) return false;
        this.addReverseQuestions(values.company, values.stage, values.text);
      });
    });
    const selected = items.filter(item => (!this.reverseFilter.company
      || (this.reverseFilter.company === "common" ? item.company === ""
        : "company:" + item.company === this.reverseFilter.company))
      && (!this.reverseFilter.stage || item.stage === this.reverseFilter.stage));
    if (!selected.length) this.el("p", "該当する逆質問はありません。", section, "muted");
    selected.forEach(item => {
      const card = this.el("article", null, section, "card");
      this.el("p", item.text, card, "pre");
      const meta = this.el("div", null, card, "deadline-meta");
      this.el("span", item.company || "共通", meta, "label");
      this.el("span", item.stage || "段階未指定", meta, "label");
      const used = this.field(meta, "使った", "", "checkbox");
      used.checked = item.used;
      used.onchange = () => { item.used = used.checked; this.changed(); };
      this.button(meta, "削除", () => this.remove(this.data.reverseQuestions, item));
    });
  },
  editMeeting(company, item) {
    this.modal("説明会・OB訪問", parent => {
      const date = this.field(parent, "日付", item?.date || "", "date");
      const kind = this.field(parent, "種類", item?.kind || "説明会", "", ["説明会", "OB訪問", "座談会", "その他"]);
      const person = this.field(parent, "相手", item?.person || "");
      this.el("small", "氏名ではなく、役割(例:人事の方、営業の若手社員)で書いてください", person.parentNode);
      const notes = this.field(parent, "内容", item?.notes || "", "textarea");
      const thanked = this.field(parent, "お礼の連絡済み", "", "checkbox");
      thanked.checked = item?.thanked || false;
      return () => ({ date: date.value, kind: kind.value, person: person.value,
        notes: notes.value, thanked: thanked.checked });
    }, values => {
      const record = this.companyRecord(company, true), now = this.now();
      if (!record.meetings) record.meetings = [];
      if (item) Object.assign(item, values, { updatedAt: now });
      else record.meetings.push({ ...values, id: this.id(), createdAt: now, updatedAt: now });
      record.updatedAt = now;
    });
  },
  renderMeetings(parent, company) {
    const section = this.el("section", null, parent, "meetings");
    this.el("h3", "説明会・OB訪問", section);
    this.button(section, "＋ 記録を追加", () => this.editMeeting(company));
    const record = this.companyRecord(company), items = record?.meetings || [];
    [...items].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).forEach(item => {
      const card = this.el("article", null, section, "card meeting-card");
      const meta = this.el("div", null, card, "deadline-meta");
      this.el("span", item.date || "日付未指定", meta, "label");
      this.el("span", item.kind, meta, "label");
      this.el("span", item.thanked ? "お礼済み" : "お礼がまだ", meta, "label");
      const actions = this.el("div", null, meta, "deadline-actions");
      this.button(actions, "編集", () => this.editMeeting(company, item));
      this.button(actions, "削除", () => this.remove(items, item));
      this.el("p", item.person, card, "pre");
      this.el("p", item.notes, card, "pre");
      const thanked = this.field(card, "お礼の連絡済み", "", "checkbox");
      thanked.checked = item.thanked;
      thanked.onchange = () => {
        item.thanked = thanked.checked;
        item.updatedAt = this.now(); record.updatedAt = item.updatedAt;
        this.changed(); this.render();
      };
    });
  },
  interviewFields: [["questions", "聞かれたこと"], ["answers", "答えたこと"],
    ["reflection", "反省点"], ["reverse", "逆質問"]],
  editInterview(company, log) {
    this.modal("面接ログ", parent => {
      const date = this.field(parent, "日付", log?.date || "", "date");
      const stage = this.field(parent, "ステージ", log ? log.stage : this.companyStage(company), "", this.stages);
      const inputs = this.interviewFields.map(([key, label]) =>
        [key, this.field(parent, label, log?.[key] || "", "textarea")]);
      return () => Object.fromEntries([["date", date.value], ["stage", stage.value],
        ...inputs.map(([key, input]) => [key, input.value])]);
    }, values => {
      const record = this.companyRecord(company, true);
      if (!record.interviews) record.interviews = [];
      const now = this.now();
      if (log) Object.assign(log, values, { updatedAt: now });
      else record.interviews.push({ ...values, id: this.id(), createdAt: now, updatedAt: now });
      record.updatedAt = now;
      this.addReverseQuestions(company, values.stage, values.reverse);
    });
  },
  renderInterviews(parent, company) {
    const section = this.el("section", null, parent, "interviews");
    this.el("h3", "面接ログ", section);
    this.button(section, "＋ 面接ログを追加", () => this.editInterview(company));
    const logs = this.companyRecord(company)?.interviews || [];
    [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).forEach(log => {
      const card = this.el("article", null, section, "card interview-card");
      const meta = this.el("div", null, card, "deadline-meta");
      this.el("span", log.date || "日付未指定", meta, "label");
      this.el("span", log.stage, meta, "label");
      const actions = this.el("div", null, meta, "deadline-actions");
      this.button(actions, "編集", () => this.editInterview(company, log));
      this.button(actions, "削除", () => this.remove(logs, log));
      this.interviewFields.forEach(([key, label]) => {
        if (!log[key].trim()) return;
        this.el("h4", label, card);
        this.el("p", log[key], card, "pre");
      });
    });
  }
});
