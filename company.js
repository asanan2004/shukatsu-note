"use strict";
Object.assign(App, {
  companySection(parent, title, extra = "", className = "") {
    if (this.isNarrow()) {
      const section = this.foldSection(parent, title, title, extra);
      if (className) section.className += " " + className;
      return section;
    }
    const section = this.el("section", null, parent, className);
    this.el("h3", title, section);
    return section;
  },
  stages: ["未応募", "ES", "Webテスト", "面接1", "面接2", "最終", "内定", "不合格", "辞退"],
  ranks: ["S", "A", "B", "C"],
  stageDetailOptions(stage) {
    if (stage === "未応募") return ["情報収集中", "エントリー予定"];
    if (stage === "ES") return ["作成中", "提出済", "結果待ち"];
    if (stage === "Webテスト") return ["受験前", "受験済", "結果待ち"];
    if (["面接1", "面接2", "最終"].includes(stage)) return ["日程調整中", "日程確定", "実施済", "結果待ち"];
    if (stage === "内定") return ["承諾検討中", "承諾", "辞退予定"];
    return [];
  },
  stageLabel(stage, detail) {
    return detail ? stage + " · " + detail : stage;
  },
  renderStageDetail(parent, current, stage, onChange) {
    const input = this.field(parent, "詳細", current || "");
    input.setAttribute("aria-label", "詳細");
    const list = this.el("datalist", null, input.parentNode);
    list.id = "stage-detail-" + this.id();
    input.setAttribute("list", list.id);
    this.stageDetailOptions(stage).forEach(value => { this.el("option", value, list).value = value; });
    input.onchange = () => onChange(input.value);
    return input;
  },
  setCompanyStageDetail(name, detail) {
    if (typeof detail !== "string") return;
    const record = this.companyRecord(name, true);
    record.stageDetail = detail;
    record.updatedAt = this.now();
    this.changed();
  },
  companyPinOrder(a, b) {
    return Number(this.companyRecord(b)?.pinned === true) - Number(this.companyRecord(a)?.pinned === true);
  },
  companyPinButton(parent, name) {
    const button = this.button(parent, this.companyRecord(name)?.pinned === true ? "★" : "☆", () => {
      const record = this.companyRecord(name, true);
      record.pinned = record.pinned !== true;
      record.updatedAt = this.now();
      this.changed();
      this.render();
    });
    button.setAttribute("aria-label", "ピン留め");
    button.setAttribute("aria-pressed", String(this.companyRecord(name)?.pinned === true));
    return button;
  },
  companyStage(name) {
    return this.companyRecord(name)?.stage || "未応募";
  },
  setCompanyStage(name, stage, date) {
    if (!this.stages.includes(stage) || this.companyStage(name) === stage) return;
    if (date === undefined) {
      const today = new Date();
      date = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    }
    const record = this.companyRecord(name, true);
    if (stage === "不合格") record.rejection = {
      stage: record.stage || "未応募", hypothesis: record.rejection?.hypothesis || ""
    };
    record.stage = stage;
    record.stageDetail = "";
    if (!record.stageHistory) record.stageHistory = [];
    record.stageHistory.push({ stage, date });
    record.updatedAt = this.now();
  },
  nextStage(stage) {
    if (stage === "未応募") return "Webテスト";
    const index = this.stages.indexOf(stage);
    return index >= 1 && index < 5 ? this.stages[index + 1] : stage;
  },
  setCompanyRank(name, rank) {
    if (rank !== "" && !this.ranks.includes(rank)) return;
    if ((this.companyRecord(name)?.rank || "") === rank) return;
    const record = this.companyRecord(name, true);
    record.rank = rank;
    record.updatedAt = this.now();
  },
  companyRecord(name, create = false) {
    const record = (this.data.companies || []).find(item => item.name === name);
    if (record || !create) return record;
    if (!this.data.companies) this.data.companies = [];
    const now = this.now();
    const item = { id: this.id(), name, officialUrl: "", industry: "", research: [], createdAt: now, updatedAt: now };
    this.data.companies.push(item);
    return item;
  },
  selectionProgress(parent, company) {
    const row = this.el("div", null, parent, "selection-progress");
    ["説明会", "ES", "Webテスト", "面接"].forEach(kind => {
      const items = this.data.deadlines.filter(d => d.company === company &&
        (d.kind === kind || kind === "ES" && d.kind === "インターン応募"));
      const count = items.filter(d => d.status === "提出済").length;
      const state = count ? "済" : items.some(d => ["未着手", "進行中"].includes(d.status)) ? "進行中" : "なし";
      const step = this.el("span", null, row, "selection-step " + (count ? "done" : state === "進行中" ? "active" : "empty"));
      step.title = kind + " " + state + (kind === "面接" && count > 0 ? " " + count + "件" : "");
      step.setAttribute("aria-label", step.title);
      const mark = this.el("span", count ? "✓" : state === "進行中" ? "○" : "·", step, "step-mark");
      mark.setAttribute("aria-hidden", "true");
      this.el("span", kind + (kind === "面接" && count > 0 ? " " + count : ""), step);
    });
    return row;
  },
  companyInitial(name) {
    const plain = name.replace(/株式会社|\(株\)|（株）|㈱|有限会社|合同会社|\s/g, "");
    return (Array.from(plain)[0] || "?").toUpperCase();
  },
  companyAvatarIndex(name) {
    const plain = name.replace(/株式会社|\(株\)|（株）|㈱|有限会社|合同会社|\s/g, "");
    return Array.from(plain).reduce((sum, character) => sum + character.codePointAt(0), 0) % 8;
  },
  logoUrlFor(name) {
    return this.companyRecord(name)?.officialUrl ||
      (this.data.mypages || []).find(item => item.company === name && /^https?:[/][/]/.test(item.url))?.url || "";
  },
  faviconSrc(pageUrl) {
    if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return "";
    return chrome.runtime.getURL("/_favicon/?pageUrl=" + encodeURIComponent(pageUrl) + "&size=64");
  },
  faviconData(src) {
    return new Promise(resolve => {
      if (!src || typeof Image === "undefined") { resolve(""); return; }
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const context = canvas.getContext?.("2d");
        if (!context || typeof canvas.toDataURL !== "function") { resolve(""); return; }
        const image = new Image();
        image.onload = () => {
          try { context.drawImage(image, 0, 0, 64, 64); resolve(canvas.toDataURL()); }
          catch { resolve(""); }
        };
        image.onerror = () => resolve("");
        image.src = src;
      } catch { resolve(""); }
    });
  },
  companyAvatar(parent, name) {
    const avatar = document.createElement("span");
    avatar.className = "avatar avatar-" + this.companyAvatarIndex(name);
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = this.companyInitial(name);
    parent.append(avatar);
    const pageUrl = this.logoUrlFor(name);
    const src = pageUrl ? this.faviconSrc(pageUrl) : "";
    if (src) {
      if (!this.defaultFaviconData) this.defaultFaviconData = this.faviconData(this.faviconSrc("https://example.invalid/"));
      Promise.all([this.defaultFaviconData, this.faviconData(src)]).then(([fallback, logo]) => {
        if (!fallback || !logo || fallback === logo) return;
        const image = document.createElement("img");
        image.className = "avatar-logo";
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        image.src = src;
        avatar.textContent = "";
        avatar.replaceChildren();
        avatar.append(image);
        avatar.className += " has-logo";
      }).catch(() => {});
    }
    return avatar;
  },
  editOfficialUrl(name) {
    this.modal("公式サイトのURL", parent => {
      const url = this.field(parent, "公式サイトのURL", this.companyRecord(name)?.officialUrl || "");
      return () => url.value.trim();
    }, url => {
      const record = this.companyRecord(name, true);
      record.officialUrl = /^https?:[/][/]/.test(url) ? url : "";
      record.updatedAt = this.now();
    });
  },
  companyLink(parent, company) {
    const link = this.button(parent, company, () => { location.hash = "#company/" + encodeURIComponent(company); });
    link.className = "company-link";
    return link;
  },
  companyRecords(company) {
    return {
      mypages: (this.data.mypages || []).filter(p => p.company === company),
      deadlines: this.data.deadlines.filter(d => d.company === company).sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
      answers: this.data.esQuestions.flatMap(question => question.answers.filter(a => a.company === company).map(answer => ({ question, answer }))),
      episodes: this.data.gakuchika.flatMap(episode => episode.usedIn.filter(u => u.company === company).map(use => ({ episode, use })))
    };
  },
  renameCompany(company) {
    let name;
    this.modal("企業名を変更", parent => {
      name = this.field(parent, "新しい企業名", company);
      name.required = true;
      return () => name.value;
    }, () => {});
    // modal の通常の保存処理を使わず、承認したときだけ保存する。
    document.getElementById("edit-form").onsubmit = event => {
      event.preventDefault();
      const next = name.value.trim();
      if (!next || next === company) return;
      const records = this.companyRecords(company);
      const target = this.companyRecords(next);
      const sourceCompany = this.companyRecord(company);
      const targetCompany = this.companyRecord(next);
      const merge = targetCompany || Object.values(target).some(items => items.length) ? `\n${next}と統合されます。` : "";
      if (!confirm(`締め切り${records.deadlines.length}件・マイページ${records.mypages.length}件・ES回答${records.answers.length}件・ガクチカ使用記録${records.episodes.length}件を変更します。${merge}`)) return;
      const now = this.now();
      const touch = item => { if (Object.hasOwn(item, "updatedAt")) item.updatedAt = now; };
      const rename = item => { item.company = next; touch(item); };
      records.deadlines.forEach(rename);
      records.mypages.forEach(rename);
      records.answers.forEach(({ question, answer }) => { rename(answer); touch(question); });
      records.episodes.forEach(({ episode, use }) => { rename(use); touch(episode); });
      if (sourceCompany) {
        if (targetCompany) {
          const labels = new Set(targetCompany.research.map(item => item.label));
          sourceCompany.research.forEach(item => {
            if (!labels.has(item.label)) { targetCompany.research.push(item); labels.add(item.label); }
          });
          if (!targetCompany.officialUrl) targetCompany.officialUrl = sourceCompany.officialUrl;
          if (!targetCompany.industry) targetCompany.industry = sourceCompany.industry;
          targetCompany.updatedAt = now;
          this.data.companies.splice(this.data.companies.indexOf(sourceCompany), 1);
        } else {
          sourceCompany.name = next;
          sourceCompany.updatedAt = now;
        }
      }
      this.changed();
      location.hash = "#company/" + encodeURIComponent(next);
      document.getElementById("editor").close();
      this.render();
    };
  },
  renderCompanyPlans(root, company) {
    this.el("h3", "予定", root);
    this.button(root, "＋ 予定を追加", () => this.editPlan(null, { company }));
    const planToday = this.planDateKey(new Date());
    const companyPlans = (this.data.plans || []).filter(item =>
      item.company === company && (item.end || item.start) >= planToday)
      .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 10);
    if (!companyPlans.length) this.el("p", "予定はありません", root, "muted");
    companyPlans.forEach(item => {
      const row = this.el("div", null, root, "plan-row");
      this.el("span", this.planDateLabel(item), row);
      this.el("span", item.status, row, "label");
      this.el("span", `${item.kind} ${item.title}`, row);
      this.button(row, "編集", () => this.editPlan(item));
    });
  },
  renderCompany(root, company) {
    const head = this.el("div", null, root, "page-head");
    const heading = this.el("h2", null, head, "company-heading");
    this.companyAvatar(heading, company);
    heading.append(document.createTextNode(company));
    this.button(head, "この企業の締め切りを追加", () => this.editDeadline(null, { company })).className = "primary";
    this.button(head, "＋ 日程を追加", () => this.addInternPlan(company));
    this.companyPinButton(head, company);
    const now = new Date();
    const nextSteps = this.companyNextSteps(company, now);
    const next = this.el("p", "次: ", root, "company-next");
    const dateLabel = value => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`
      + (value.includes("T") ? " " + value.slice(11, 16) : "");
    if (nextSteps.steps.length) {
      nextSteps.steps.forEach((step, index) => {
        if (index) this.el("span", " → ", next, "muted");
        const days = this.remaining(step, now).days;
        this.el(index === 0 ? "strong" : "span", `${dateLabel(step.dueAt)} ${step.text}`, next,
          days === 0 || days === 1 ? "danger" : "");
      });
    } else if (nextSteps.waiting) {
      const { stage, since } = nextSteps.waiting;
      this.el("span", `結果待ち(${stage}${since ? `、${dateLabel(since)} から` : ""})`, next);
    } else {
      next.className += " muted";
      this.el("span", "なし(締め切りか予定を追加してください)", next);
    }
    const metaParent = this.isNarrow()
      ? this.foldSection(root, "company-meta", "選考の状態・志望度",
        this.stageLabel(this.companyStage(company), this.companyRecord(company)?.stageDetail)) : root;
    const meta = this.el("div", null, metaParent, "company-meta");
    const stage = this.field(meta, "選考ステージ", this.companyStage(company), "", this.stages);
    this.renderStageDetail(meta, this.companyRecord(company)?.stageDetail, stage.value,
      detail => { this.setCompanyStageDetail(company, detail); this.render(); });
    this.el("span", this.stageLabel(stage.value, this.companyRecord(company)?.stageDetail), meta, "muted stage-label");
    const rank = this.field(meta, "志望度", this.companyRecord(company)?.rank || "", "",
      [{ value: "", label: "未設定" }, ...this.ranks]);
    stage.onchange = () => {
      const advanced = this.stages.indexOf(stage.value) > this.stages.indexOf(this.companyStage(company))
        && !["不合格", "辞退"].includes(stage.value);
      this.setCompanyStage(company, stage.value);
      this.changed();
      this.render();
      if (advanced) this.offerPlanAfterPass(company);
    };
    rank.onchange = () => { this.setCompanyRank(company, rank.value); this.changed(); this.render(); };
    const internLabel = this.el("label", "インターン参加済み", meta);
    const intern = this.el("input", null, internLabel);
    intern.type = "checkbox";
    intern.checked = this.companyRecord(company)?.intern === true;
    const earlyRoute = this.field(meta, "早期選考ルートのメモ", this.companyRecord(company)?.earlyRoute || "");
    intern.onchange = () => {
      const record = this.companyRecord(company, true);
      record.intern = intern.checked;
      record.updatedAt = this.now();
      this.changed();
    };
    earlyRoute.onchange = () => {
      const record = this.companyRecord(company, true);
      record.earlyRoute = earlyRoute.value;
      record.updatedAt = this.now();
      this.changed();
    };
    const history = this.companyRecord(company)?.stageHistory;
    if (history?.length) this.el("span", history.map(item =>
      item.stage + " " + Number(item.date.slice(5, 7)) + "/" + Number(item.date.slice(8, 10))).join(" → "), meta, "muted");
    this.renderRejection(metaParent, company);
    const records = this.companyRecords(company);
    const unfinished = records.deadlines.filter(item => ["未着手", "進行中"].includes(item.status)).length;
    this.el("p", `未完了の締め切り${unfinished}件・マイページ${records.mypages.length}件・ES回答${records.answers.length}件`, root, "muted note");
    const officialUrl = this.companyRecord(company)?.officialUrl;
    if (officialUrl) this.el("p", officialUrl, root, "muted note");
    this.el("p", "ロゴは、Chromeでそのサイトを一度開くと表示されます", root, "muted note");
    const toolbar = this.el("div", null, root, "toolbar");
    this.selectionProgress(head, company);
    this.button(toolbar, "戻る", () => window.history.back());
    this.button(toolbar, "企業名を変更", () => this.renameCompany(company));
    this.button(toolbar, "公式サイトのURL", () => this.editOfficialUrl(company));
    this.button(toolbar, "面接直前ビュー", () => { location.hash = "#prep/" + encodeURIComponent(company); });
    this.button(toolbar, "日程の返信文", () => this.editReply(company));
    if (Object.values(records).every(items => !items.length)) {
      this.el("p", "この企業の記録はありません", root);
      this.renderCompanyPlans(root, company);
      this.renderWebtests(root, company);
      this.renderInterviews(root, company);
      this.renderMeetings(root, company);
      this.renderDocuments(root, company);
      this.renderMotive(root, company);
      this.renderResearch(root, company);
      return;
    }
    if (records.mypages.length) this.el("h3", "マイページ", root);
    records.mypages.forEach(item => {
      const card = this.el("article", null, root, "card");
      const meta = this.el("div", null, card, "deadline-meta");
      if (/^https?:[/][/]/.test(item.url)) {
        const link = this.el("a", item.url, meta); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      } else if (item.url) this.el("span", item.url, meta, "pre");
      this.el("span", item.status, meta, "label mypage-status status-" + this.mypageStatuses.indexOf(item.status));
      if (item.loginId) this.el("span", item.loginId, meta, "pre");
      const actions = this.el("div", null, meta, "deadline-actions");
      this.button(actions, "編集", () => this.editMypage(item));
      if (item.note) this.el("p", item.note, card, "pre");
    });
    this.renderCompanyPlans(root, company);
    if (records.deadlines.length) this.el("h3", "締め切り", root);
    const active = records.deadlines.length ? this.el("div", null, root) : null;
    const closed = records.deadlines.length ? this.el("details", null, root) : null;
    if (closed) this.el("summary", "提出済・見送り（クリックで展開）", closed);
    records.deadlines.forEach(item => {
      const card = this.el("article", null, ["提出済", "見送り"].includes(item.status) ? closed : active, "card");
      this.el("h3", item.title, card);
      const meta = this.el("div", null, card, "deadline-meta");
      const remaining = this.remaining(item);
      this.el("span", item.kind, meta, "label kind-" + this.kinds.indexOf(item.kind));
      this.checklistLabel(meta, item);
      this.el("span", remaining.text, meta, "label " + (remaining.expired ? "expired" : remaining.days <= 1 ? "urgent" : ""));
      this.el("span", `${item.dueAt.replace("T", " ")} · ${item.status}`, meta);
      const actions = this.el("div", null, meta, "deadline-actions");
      const deadlineLink = this.deadlineLinkFor(item);
      if (deadlineLink) {
        const link = this.el("a", deadlineLink.label, actions, "button-link");
        if (typeof ShukatsuIcons !== "undefined") link.prepend(ShukatsuIcons.make("external"));
        link.href = deadlineLink.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      }
      if (["未着手", "進行中"].includes(item.status)) this.button(actions, "提出済にする", () => {
        item.status = "提出済";
        item.updatedAt = this.now();
        this.changed();
        this.render();
      });
      this.button(actions, "編集", () => this.editDeadline(item));
      this.renderChecklist(card, item);
      if (item.note) this.el("p", item.note, card, "pre");
    });
    const answers = records.answers.length && this.isNarrow()
      ? this.foldSection(root, "提出したES", "提出したES") : root;
    if (records.answers.length && !this.isNarrow()) this.el("h3", "提出したES", root);
    records.answers.forEach(({ question, answer }) => {
      const card = this.el("article", null, answers, "card");
      this.el("h4", question.question, card); this.el("p", answer.text, card, "pre");
      this.el("p", `${this.count(answer.text)}字 · ${answer.date}`, card); this.button(card, "コピー", () => this.copy(answer.text));
    });
    const episodes = records.episodes.length && this.isNarrow()
      ? this.foldSection(root, "ガクチカの使用記録", "ガクチカの使用記録") : root;
    if (records.episodes.length && !this.isNarrow()) this.el("h3", "ガクチカの使用記録", root);
    records.episodes.forEach(({ episode, use }) => this.el("p", `${episode.title} · ${use.date}`, episodes, "card"));
    this.renderWebtests(root, company);
    this.renderInterviews(root, company);
    this.renderMeetings(root, company);
    this.renderDocuments(root, company);
    this.renderMotive(root, company);
    this.renderResearch(root, company);
  }
});
