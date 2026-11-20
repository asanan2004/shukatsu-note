"use strict";
Object.assign(App, {
  companyNextSteps(company, now = new Date()) {
    const steps = [];
    const checklistText = (item, word) => {
      const list = item.checklist || [];
      return list.some(entry => entry.done === false)
        ? `(${word} ${list.filter(entry => entry.done).length}/${list.length})` : "";
    };
    this.data.deadlines.filter(item => item.company === company
      && ["未着手", "進行中"].includes(item.status) && !this.remaining(item, now).expired)
      .forEach(item => steps.push({ dueAt: item.dueAt, text: item.title + checklistText(item, "提出物") }));
    const record = this.companyRecord(company);
    (record?.webtests || []).filter(item => item.done === false && item.deadline)
      .forEach(item => steps.push({ dueAt: item.deadline,
        text: `${item.format}受検${item.center ? "(テストセンター)" : ""}` }));
    const today = this.planDateKey(now);
    (this.data.plans || []).filter(item => item.company === company && item.status === "確定" && item.start >= today)
      .forEach(item => steps.push({ dueAt: item.start + (item.time ? "T" + item.time : ""),
        text: item.title + checklistText(item, "準備") }));
    steps.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const stage = this.companyStage(company);
    const history = record?.stageHistory || [];
    const waiting = !steps.length && ["ES", "Webテスト", "面接1", "面接2", "最終"].includes(stage)
      ? { stage, since: history[history.length - 1]?.date || "" } : null;
    return { steps: steps.slice(0, 4), waiting };
  },
  todayReasons(item, now = new Date()) {
    const days = this.remaining(item, now).days;
    const reasons = [days <= 0 ? "今日が締切" : days === 1 ? "明日が締切" : `${days}日後が締切`];
    const rank = this.companyRecord(item.company)?.rank;
    if (["S", "A", "B"].includes(rank)) reasons.push(`志望度${rank}`);
    if (["ES", "Webテスト"].includes(item.kind)) reasons.push(`${item.kind}の準備を優先`);
    const draft = this.draftDate(item);
    if (draft && new Date(draft + "T00:00") <= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      reasons.push("下書きの目安日を迎えています");
    }
    return reasons;
  },
  todayPreparation(item) {
    const needsSubmission = ["ES", "インターン応募"].includes(item.kind);
    const answers = this.data.esQuestions.flatMap(question => question.answers
      .filter(answer => answer.company === item.company && (answer.applicationId || "") === (item.applicationId || ""))
      .map(answer => ({ question, answer })));
    const documents = this.companyRecord(item.company)?.documents || [];
    const notes = [];
    if (needsSubmission) {
      if (!answers.length) notes.push("この応募のES回答は未登録（要否を確認）");
      const empty = answers.filter(({ answer }) => !answer.text.trim()).length;
      const over = answers.filter(({ question, answer }) => question.limit > 0 && this.count(answer.text) > question.limit).length;
      if (empty) notes.push(`回答が空欄：${empty}件`);
      if (over) notes.push(`字数超過：${over}件`);
      if (answers.length && !empty && !over) notes.push("登録済み回答の空欄・字数超過なし（内容は要確認）");
      if (!documents.length) notes.push("提出書類は未登録（要否を確認）");
      else {
        const left = documents.filter(document => !document.done).length;
        notes.push(left ? `企業共通の提出書類：未完了${left}件` : "企業共通の提出書類：登録分は完了");
      }
    }
    return { needsSubmission, answers, documents, notes };
  },
  todayTaskCard(parent, item, now, recommended = false) {
    const card = this.deadlineCard(parent, item, now);
    if (!["未着手", "進行中"].includes(item.status)) return card;
    const more = Array.from(card.children).find(child => child.className === "card-more");
    if (recommended) this.el("p", "おすすめの理由：" + this.todayReasons(item, now).join("・"), more);
    const state = this.todayPreparation(item);
    const application = this.applicationItems(item.company).find(entry => entry.id === item.applicationId);
    this.el("small", application ? `応募：${this.applicationLabel(application)}`
      : item.applicationId ? "応募：登録情報を確認してください" : "応募：未設定の記録", more, "muted");
    state.notes.forEach(note => this.el("p", note, more, "muted"));
    if (state.needsSubmission) {
      const check = this.el("details", null, more);
      this.el("summary", "提出前確認・ESを編集", check);
      this.el("p", "記録からの確認です。提出先の案内と照合してください。", check, "muted");
      state.answers.forEach(({ question, answer }) => {
        const row = this.el("div", null, check, "card");
        this.el("h4", question.question, row);
        this.el("p", `${this.count(answer.text)}字${question.limit ? ` / 上限${question.limit}字` : " / 字数指定なし"}`, row);
        if (question.requirements) this.el("p", "提出条件：\n" + question.requirements, row, "pre");
        else this.el("p", "提出条件の記録なし（要確認）", row, "muted");
        this.button(row, "このES回答を編集", () => this.editAnswer(question, answer));
      });
      if (!state.answers.length) {
        this.el("p", "ES設問バンクで回答を登録し、企業画面の「応募別の管理」で応募先を設定してください。", check);
        this.button(check, "ES設問バンクを開く", () => {
          this.esFilter = { genre: "", company: item.company, text: "" };
          location.hash = "#es";
        });
      }
      this.el("h4", "提出書類（企業共通）", check);
      state.documents.forEach(document => this.el("p", `${document.done ? "完了" : "未完了"}：${document.name}`, check));
      if (!state.documents.length) this.el("p", "書類の記録なし。必要書類を確認してください。", check);
      this.button(check, "企業の書類・応募を確認", () => { location.hash = "#company/" + encodeURIComponent(item.company); });
    }
    return card;
  },
  todayScore(item, now = new Date()) {
    const days = this.remaining(item, now).days;
    const urgency = days <= 0 ? 100 : days === 1 ? 80 : days <= 3 ? 60 : days <= 7 ? 40 : 10;
    const rank = this.companyRecord(item.company)?.rank || "";
    const draft = this.draftDate(item);
    const draftDue = draft && new Date(draft + "T00:00") <= new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return urgency + ({ S: 30, A: 20, B: 10, C: 0 }[rank] || 0)
      + (["ES", "Webテスト"].includes(item.kind) ? 5 : 0) + (draftDue ? 20 : 0);
  },
  nextTask(now = new Date()) {
    return this.data.deadlines.filter(item => ["未着手", "進行中"].includes(item.status)
      && !this.remaining(item, now).expired)
      .sort((a, b) => this.todayScore(b, now) - this.todayScore(a, now)
        || a.dueAt.localeCompare(b.dueAt))[0] || null;
  },
  todayGroups(now = new Date()) {
    const groups = { urgent: [], later: [], waiting: [], check: [], expired: [] };
    const active = this.data.deadlines.filter(item => ["未着手", "進行中"].includes(item.status));
    const classify = item => {
      const remaining = this.remaining(item, now);
      if (remaining.expired) groups.expired.push(item);
      else if (remaining.days <= 3) groups.urgent.push(item);
      else if (remaining.days <= 14) groups.later.push(item);
    };
    active.forEach(item => {
      classify(item);
      if (item.source === "auto" && item.createdAt === item.updatedAt
        && this.remaining(item, now).days <= 14) groups.check.push(item);
    });
    (this.data.companies || []).forEach(company => {
      (company.webtests || []).filter(item => item.done === false && item.deadline).forEach(item => {
        classify({ webtest: true, company: company.name, item, dueAt: item.deadline });
      });
    });
    const today = this.planDateKey(now);
    const tomorrow = this.planDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    (this.data.plans || []).forEach(item => {
      if (item.status === "確定" && (item.start === today || item.start === tomorrow)
        && item.checklist?.some(entry => entry.done === false)) {
        groups.urgent.push({ plan: true, item, dueAt: item.start + (item.time ? "T" + item.time : "") });
      }
    });
    this.allCompanyNames().forEach(company => {
      const stage = this.companyStage(company);
      if (!["ES", "Webテスト", "面接1", "面接2", "最終"].includes(stage)
        || active.some(item => item.company === company)
        || (this.companyRecord(company)?.webtests || []).some(item => item.done === false && item.deadline)) return;
      const history = this.companyRecord(company)?.stageHistory || [];
      groups.waiting.push({ company, stage, since: history[history.length - 1]?.date || "" });
    });
    for (const key of ["urgent", "later", "check"]) groups[key].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    groups.expired.sort((a, b) => b.dueAt.localeCompare(a.dueAt));
    groups.waiting.sort((a, b) => a.since.localeCompare(b.since));
    return groups;
  },
  todayWebtestRow(parent, entry, now) {
    const { company, item, dueAt } = entry;
    const remaining = this.remaining(entry, now);
    const row = this.el("p", null, parent, "today-webtest-row");
    this.companyLink(row, company);
    this.el("span", ` ${item.format} 受検 `, row);
    const date = dueAt.slice(5, 10).replace("-", "/") + (dueAt.includes("T") ? " " + dueAt.slice(11, 16) : "");
    this.el("span", `期限 ${date}(${remaining.expired ? "期限切れ" : `あと${remaining.days}日`})`, row, remaining.expired ? "danger" : "");
    if (item.center) this.el("span", "テストセンター", row, "label");
    if (item.reusable) this.el("span", "前回結果OK", row, "label");
    return row;
  },
  renderToday(root) {
    const now = new Date();
    if (this.exportReminderDue(now)) {
      const reminder = this.el("section", null, root, "card");
      this.el("p", "JSONの書き出しをおすすめします", reminder);
      this.button(reminder, "今すぐ書き出す", () => this.exportJSON());
    }
    const weekdays = "日月火水木金土";
    const head = this.el("div", null, root, "page-head");
    this.el("h2", "今日やること", head);
    this.el("span", `${now.getMonth() + 1}月${now.getDate()}日(${weekdays[now.getDay()]})`, head, "muted");
    const quick = this.el("div", null, root, "today-quick");
    const input = this.el("input", null, quick);
    input.type = "text";
    input.placeholder = "例:サンプル商事 ES 11/20 23:59";
    input.setAttribute("aria-label", "締め切りを1行で追加");
    const add = () => {
      const item = ShukatsuParse.quickParse(input.value, new Date());
      if (!item) { this.message("日付か企業名が読み取れませんでした"); return; }
      if (this.hasDuplicateDeadline(item.company, item.dueAt, item.kind)) {
        this.message("同じ締め切りが既にあります"); return;
      }
      const stamp = this.now();
      this.data.deadlines.push({ id: this.id(), company: item.company, kind: item.kind,
        title: item.title, dueAt: item.dueAt, status: "未着手", url: "", source: "quick",
        note: "", createdAt: stamp, updatedAt: stamp });
      this.changed();
      this.render();
      const [, month, day] = item.dueAt.slice(0, 10).split("-");
      this.message(`追加しました:${item.company} ${Number(month)}/${Number(day)}`);
    };
    this.button(quick, "追加", add);
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); add(); }
    });
    this.el("h3", "次にやる1件", root, "today-section-heading");
    const next = this.el("div", null, root, "next-task");
    const task = this.nextTask(now);
    if (task) this.todayTaskCard(next, task, now, true);
    else this.el("p", "次にやる締め切りはありません", next, "muted");
    const items = this.data.deadlines.slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const groups = this.todayGroups(now);
    for (const [key, label] of [["urgent", "急ぎ"], ["later", "その先"], ["waiting", "結果待ち"], ["check", "確認が要る"]]) {
      const entries = groups[key];
      const section = this.el("section", null, root, `today-group ${key}`);
      const heading = this.el("h3", `${label}(${entries.length})`, section);
      const empty = !entries.length ? this.el("p", "なし", section, "muted") : null;
      if (key === "waiting") {
        entries.forEach(entry => {
          const row = this.el("p", null, section, "today-waiting-row");
          this.companyLink(row, entry.company);
          this.el("span", ` ${entry.stage}${entry.since ? `(${entry.since.slice(5, 10).replace("-", "/")} から)` : "(日付なし)"}`, row);
          this.button(row, "日程を追加", () => this.addInternPlan(entry.company)).className = "plan-add-action";
        });
      } else {
        (key === "later" ? entries.slice(0, 8) : entries).forEach(entry => {
          if (entry.plan) {
            const row = this.el("div", null, section, "today-plan-row");
            const line = this.el("div", null, row);
            this.el("span", `${entry.item.company} ${entry.item.title} ${this.planDateLabel({ ...entry.item, end: "" })} `, line);
            this.checklistLabel(line, entry.item, "準備");
            this.renderChecklist(row, entry.item);
          }
          else if (entry.webtest) this.todayWebtestRow(section, entry, now);
          else this.todayTaskCard(section, entry, now);
        });
      }
      if (key === "later" && entries.length > 8) {
        this.button(section, `ほか ${entries.length - 8} 件(締め切り画面へ)`, () => {
          this.deadlineQuick = "";
          this.deadlineFilter = { status: "", kind: "", company: "", source: "" };
          this.calendar = false;
          location.hash = "#deadlines";
        });
      }
      if (key === "check") {
        const notices = this.el("div", null, section, "today-notices");
        notices.hidden = true;
        this.renderTodayNotices(notices, count => {
          heading.textContent = `${label}(${entries.length + count})`;
          if (empty) empty.hidden = count > 0;
        });
      }
    }
    if (groups.expired.length) {
      const expired = this.el("details", null, root, "today-group expired");
      expired.open = this.expiredOpen === true;
      expired.addEventListener("toggle", () => { this.expiredOpen = expired.open; });
      this.el("summary", `期限切れ(${groups.expired.length}件)`, expired);
      this.el("p", "済んだものは『提出済にする』、やらないものは『見送り』にすると消えます。締め切り画面の『まとめて操作』でいっぺんに変えられます", expired, "muted");
      const expiredDeadlines = groups.expired.filter(entry => !entry.webtest);
      if (expiredDeadlines.length) this.button(expired, "すべて見送りにする", () => {
        if (!confirm(`期限切れ ${expiredDeadlines.length} 件をすべて「見送り」にしますか？`)) return;
        const stamp = this.now();
        expiredDeadlines.forEach(item => { item.status = "見送り"; item.updatedAt = stamp; });
        this.changed();
        this.render();
      });
      groups.expired.slice(0, 10).forEach(entry => {
        if (entry.webtest) this.todayWebtestRow(expired, entry, now);
        else this.todayTaskCard(expired, entry, now);
      });
      if (groups.expired.length > 10) {
        this.button(expired, `ほか ${groups.expired.length - 10} 件(締め切り画面へ)`, () => {
          this.deadlineQuick = "expired";
          this.deadlineFilter = { status: "", kind: "", company: "", source: "" };
          this.calendar = false;
          location.hash = "#deadlines";
        });
      }
    }
    const unthanked = (this.data.companies || []).map(company => ({ company,
      count: (company.meetings || []).filter(item => item.thanked === false).length })).filter(item => item.count);
    if (unthanked.length) {
      const reminder = this.el("section", null, root, "meeting-reminder");
      this.el("h3", `お礼がまだ ${unthanked.reduce((sum, item) => sum + item.count, 0)}件`, reminder);
      unthanked.forEach(({ company }) => {
        const row = this.el("p", null, reminder);
        this.companyLink(row, company.name);
      });
    }
    const planToday = this.planDateKey(now);
    const planLimit = new Date(now);
    planLimit.setDate(planLimit.getDate() + 7);
    const soonPlans = (this.data.plans || []).filter(item =>
      item.start <= this.planDateKey(planLimit) && (item.end || item.start) >= planToday)
      .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
    if (soonPlans.length) {
      const section = this.el("section", null, root, "plan-soon");
      this.el("h3", `近い予定(${soonPlans.length}件)`, section);
      soonPlans.forEach(item => {
        const row = this.el("div", null, section, "today-plan-row");
        const meta = this.el("div", null, row);
        this.button(meta, `${this.planDateLabel(item)} ${item.status} ${item.company} ${item.title}`,
          () => { location.hash = "#plans"; });
        this.checklistLabel(meta, item, "準備");
        this.renderChecklist(row, item);
      });
    }
    this.el("h3", "今週の予定", root);
    const week = this.el("div", null, root, "today-week");
    const upcoming = items.filter(item => {
      const days = this.remaining(item, now).days;
      return days >= 0 && days <= 7;
    });
    this.renderPreparation(week, now, upcoming, weekdays);
    this.renderWeek(root, now);
  },
  renderPreparation(root, now, deadlines, weekdays) {
    const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const first = dateKey(now);
    const last = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
    const section = this.el("section", null, root);
    const plans = this.data.preparation || [];
    const visible = plans.filter(plan => plan.date >= first && plan.date <= last).sort((a, b) => a.date.localeCompare(b.date));
    const total = visible.reduce((sum, plan) => sum + plan.minutes, 0);
    this.el("h4", `準備予定（${first}〜${last}・合計 ${total}分）`, section);
    const edit = plan => this.modal(plan ? "準備予定を編集" : "準備予定を追加", fields => {
      const title = this.field(fields, "作業名", plan?.title || ""); title.required = true;
      const date = this.field(fields, "作業日", plan?.date || first, "date"); date.required = true;
      const minutes = this.field(fields, "所要時間（分）", String(plan?.minutes || 30), "number");
      minutes.required = true; minutes.min = "1"; minutes.max = "1440"; minutes.step = "1";
      return () => ({ id: plan?.id || this.id(), title: title.value.trim(), date: date.value, minutes: Number(minutes.value) });
    }, value => {
      if (!this.validPreparation(value)) { this.message("作業名・日付・1〜1440分の所要時間を入力してください。"); return false; }
      if (plan) Object.assign(plan, value);
      else (this.data.preparation ||= []).push(value);
    });
    this.button(section, "準備予定を追加", () => edit());
    const groups = new Map();
    for (const plan of visible) {
      if (!groups.has(plan.date)) groups.set(plan.date, []);
      groups.get(plan.date).push(plan);
    }
    const renderPlan = (parent, plan) => {
      const row = this.el("div", null, parent, "today-week-row");
      this.el("span", `${plan.date} ${plan.title} · ${plan.minutes}分`, row);
      this.button(row, "編集", () => edit(plan));
      this.button(row, "削除", () => this.remove(plans, plan));
    };
    const dates = [...new Set([...deadlines.map(item => item.dueAt.slice(0, 10)), ...groups.keys()])].sort();
    if (!dates.length) this.el("p", "今週の予定はありません", root, "muted");
    for (const key of dates) {
      const date = new Date(key + "T00:00");
      const entries = groups.get(key) || [];
      const minutes = entries.reduce((sum, plan) => sum + plan.minutes, 0);
      this.el("h4", `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})${minutes ? ` · 準備 ${minutes}分` : ""}`, root);
      deadlines.filter(item => item.dueAt.startsWith(key)).forEach(item => {
        this.el("p", `${item.company} ${item.title} ${item.dueAt.slice(11) || "時刻未指定"}`, root, "today-week-row");
      });
      entries.forEach(plan => renderPlan(root, plan));
    }
    const outside = plans.filter(plan => plan.date < first || plan.date > last).sort((a, b) => a.date.localeCompare(b.date));
    if (outside.length) {
      const archive = this.el("details", null, section);
      this.el("summary", `期間外の準備予定（${outside.length}件）`, archive);
      outside.forEach(plan => renderPlan(archive, plan));
    }
  },
  async renderTodayNotices(notices, onCount = () => {}) {
    if (typeof chrome === "undefined" || !chrome.storage?.session) return;
    try {
      const session = chrome.storage.session;
      const stored = await session.get(["pendingPages", "pendingResults"]);
      const pages = Object.values(stored.pendingPages || {}).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      const results = stored.pendingResults || [];
      if (!pages.length && !results.length) return;
      onCount(pages.length + results.length);
      notices.hidden = false;
      this.el("h4", "新しいお知らせ", notices);
      let busy = false;
      const action = (row, label, run) => this.button(row, label, async () => {
        if (busy) return;
        busy = true;
        try { await run(); }
        catch (error) { this.message(error.message || "操作に失敗しました。もう一度試してください。"); }
        finally { busy = false; }
      });
      for (const page of pages) {
        const row = this.el("div", null, notices, "card");
        this.el("p", page.source === "mail"
          ? `${page.company}のメール:新しい日付${page.count}件`
          : `${page.company}のマイページ:新しい締め切り${page.count}件`, row);
        if (page.source === "mail") this.el("small", page.subject || page.title, row, "notice-detail");
        action(row, "確認する", async () => {
          const current = await session.get("pendingPages");
          const pendingPages = { ...current.pendingPages };
          delete pendingPages[page.key || page.url];
          await session.set({ pendingPages });
          this.render();
          this.pasteDeadlines({ text: page.text, title: page.company, url: page.url });
        });
      }
      for (const result of results) {
        const row = this.el("div", null, notices, "card");
        this.el("p", `${result.company}${result.guessed ? "(推測)" : ""}:${result.result}?`, row);
        this.el("small", result.source === "mypage" ? "マイページの表示から" : result.subject, row, "notice-detail");
        if (result.reason) this.el("small", `理由: ${result.reason}`, row, "notice-detail");
        const remove = async confirm => {
          const current = await session.get("pendingResults");
          await session.set({ pendingResults: (current.pendingResults || []).filter(item =>
            item.company !== result.company || item.subject !== result.subject) });
          if (confirm) location.hash = "#mypages";
          this.render();
          if (confirm) this.editMailResult({ company: result.company, result: result.result,
            subject: result.subject, reason: result.reason, guessed: result.guessed, source: result.source });
        };
        action(row, "確認する", () => remove(true));
        action(row, "無視", () => remove(false));
      }
    } catch (error) { this.message(error.message || "お知らせを読み込めませんでした"); }
  }
});
