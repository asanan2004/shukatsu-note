"use strict";
Object.assign(App, {
  deadlineFilter: { status: "", kind: "", company: "", source: "" },
  deadlineQuick: "",
  calendar: false,
  deadlineSelection: null,
  finishDeadlineSelection(remove = false) {
    const selected = this.data.deadlines.filter(d => this.deadlineSelection && this.deadlineSelection.has(d.id));
    if (!selected.length) return;
    if (remove && !confirm(`${selected.length}件の締め切りを削除しますか?`)) return;
    if (remove) this.data.deadlines = this.data.deadlines.filter(d => !selected.includes(d));
    else selected.forEach(d => { d.status = "提出済"; d.updatedAt = this.now(); });
    this.deadlineSelection = null;
    this.changed(); this.render();
  },
  hasDuplicateDeadline(company, dueAt, kind) {
    return this.data.deadlines.some(d => d.company === company && d.dueAt === dueAt && d.kind === kind);
  },
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  remaining(item, now = new Date()) {
    const date = new Date(item.dueAt.slice(0, 10) + "T00:00");
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((date - today) / 86400000);
    const expired = item.dueAt.length > 10 ? new Date(item.dueAt) < now : days < 0;
    return { days, expired, text: expired ? "期限切れ" : days === 0 ? "今日" : days === 1 ? "明日" : `あと${days}日` };
  },
  matchesDeadlineQuick(item, quick, now = new Date()) {
    const remaining = this.remaining(item, now);
    if (quick === "expired") return remaining.expired;
    return !remaining.expired && remaining.days <= (quick === "soon1" ? 1 : 7);
  },
  filteredDeadlines() {
    const f = this.deadlineFilter;
    const now = new Date();
    const items = this.deadlineQuick ? ShukatsuShared.activeDeadlines(this.data.deadlines)
      .filter(d => this.matchesDeadlineQuick(d, this.deadlineQuick, now)) : this.data.deadlines;
    return items.filter(d => (!f.status || d.status === f.status)
      && (!f.kind || d.kind === f.kind) && (!f.source || d.source === f.source) && this.companyMatches(d.company, f.company))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  },
  editDeadline(item, initial = {}) {
    const current = item || { company: initial.company || "", kind: initial.kind || "ES",
      title: initial.title || "", dueAt: "", status: "未着手", url: initial.url || "",
      note: initial.note || "", place: initial.place || "", checklist: initial.checklist };
    this.modal(item ? "締め切りを編集" : "締め切りを追加", parent => {
      const company = this.field(parent, "企業名", current.company);
      company.required = true;
      this.companySuggestions(parent, company, "companies");
      const kind = this.field(parent, "種別", current.kind, "", this.kinds);
      const title = this.field(parent, "やること", current.title);
      title.required = true;
      const date = this.field(parent, "締切日", current.dueAt.slice(0, 10), "date");
      date.required = true;
      const time = this.field(parent, "時刻（不明なら空欄・ローカル時刻）", current.dueAt.slice(11), "time");
      const status = this.field(parent, "状態", current.status, "", this.statuses);
      const place = this.field(parent, "場所(会場・オンラインなど)", current.place || "");
      const url = this.field(parent, "URL（記録のみ・自動アクセスしません）", current.url);
      const checklist = this.field(parent, "提出物(1行に1つ。例: ES、履修履歴)",
        (current.checklist || []).map(c => c.label).join("\n"), "textarea");
      const note = this.field(parent, "メモ", current.note, "textarea");
      if (item) this.button(parent, "削除", () => {
        this.remove(this.data.deadlines, item);
        if (!this.data.deadlines.includes(item)) document.getElementById("editor").close();
      }).className = "deadline-delete";
      return () => {
        const labels = [...new Set(checklist.value.split(/\r?\n/)
          .map(label => label.trim().slice(0, 100)).filter(Boolean))].slice(0, 20);
        const values = { company: company.value.trim(), kind: kind.value, title: title.value.trim(),
        dueAt: date.value + (time.value ? "T" + time.value : ""), status: status.value,
          url: url.value, note: note.value, place: place.value.trim() };
        if (labels.length) values.checklist = labels.map(label => ({ label,
          done: (current.checklist || []).find(c => c.label === label)?.done || false }));
        return values;
      };
    }, values => {
      if (!item && this.hasDuplicateDeadline(values.company, values.dueAt, values.kind)
        && !confirm("同じ締め切りが既にあります。登録しますか?")) return false;
      if (item) {
        Object.assign(item, values, { updatedAt: this.now() });
        if (!values.checklist) delete item.checklist;
      }
      else this.data.deadlines.push(Object.assign(values, {
        id: this.id(), source: "manual", createdAt: this.now(), updatedAt: this.now()
      }));
    });
    if (item) document.getElementById("editor").className = "deadline-editor";
  },
  parseDeadlineText(text, now = new Date()) {
    return ShukatsuParse.parseDeadlineText(text, now);
  },
  registerDeadlineCandidates(company, candidates, page) {
    let webtests = 0;
    candidates.filter(c => c.selected).forEach(c => {
      if (c.webtest && c.asWebtest !== false) {
        const record = this.companyRecord(company.trim(), true);
        const tests = record.webtests ||= [];
        if (tests.some(test => test.deadline === c.webtest.deadline && test.format === c.webtest.format)) return;
        tests.push({ id: this.id(), format: c.webtest.format, date: "", done: false, feeling: "ふつう",
          note: "抽出から(" + Array.from(c.sourceText || c.title).slice(0, 200).join("") + ")",
          start: c.webtest.start, deadline: c.webtest.deadline, center: c.webtest.center, reusable: false });
        record.updatedAt = this.now();
        webtests++;
        return;
      }
      this.data.deadlines.push({
      id: this.id(), company: company.trim(), kind: c.kind, title: c.title.trim(), dueAt: c.date + (c.time ? "T" + c.time : ""),
      ...(c.submissions?.length ? { checklist: c.submissions.map(label => ({ label, done: false })) } : {}),
      evidence: { url: page ? this.cleanPageUrl(page.url) : "", text: Array.from(c.sourceText || c.title).slice(0, 200).join(""), foundAt: this.now() }, source: page ? "page" : "paste", status: "未着手", url: page ? this.cleanPageUrl(page.url) : "", note: "", createdAt: this.now(), updatedAt: this.now()
      });
    });
    return webtests;
  },
  registerPlanCandidates(company, candidates) {
    const groups = new Map();
    const plans = [];
    candidates.filter(c => c.plan).forEach(c => {
      if (c.role === "開催") plans.push({ candidate: c, start: c.date, end: "", time: c.time || "" });
      else if (c.role === "開始" || c.role === "終了") {
        const key = c.heading || c.title;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      }
    });
    groups.forEach(group => {
      const starts = group.filter(c => c.role === "開始");
      const ends = group.filter(c => c.role === "終了");
      while (starts.length || ends.length) {
        const first = starts.shift(), last = ends.shift();
        const dates = [first?.date, last?.date].filter(Boolean).sort();
        plans.push({ candidate: first || last, start: dates[0], end: dates.length > 1 ? dates[1] : "", time: "" });
      }
    });
    plans.forEach(({ candidate: c, start, end, time }) => {
      const kind = ({ "インターン応募": "インターン", "面接": "面接", "説明会": "説明会" })[c.kind] || "その他";
      (this.data.plans ||= []).push({
        id: this.id(), company: company.trim(), kind,
        title: Array.from((c.heading || c.title).trim()).slice(0, 60).join(""),
        start, end, time, status: "通過したら", note: "", createdAt: this.now(), updatedAt: this.now()
      });
    });
    if (plans.length) this.message(`予定に${plans.length}件入れました`);
  },
  pasteDeadlines(page) {
    this.modal("貼り付けて追加", parent => {
      const textBox = page ? this.el("details", null, parent, "extracted-text") : parent;
      const textSummary = page ? this.el("summary", "", textBox) : null;
      const text = this.field(textBox, "文章（保存しません）", page ? page.text : "", "textarea");
      text.rows = 5;
      text.className = "candidate-text";
      const updateTextCount = () => {
        if (textSummary) textSummary.textContent = `読み取った文章（${Array.from(text.value).length}字）`;
      };
      updateTextCount();
      const company = this.field(parent, "企業名", page ? page.title : ""); company.required = true;
      this.companySuggestions(parent, company, "paste-companies");
      const preview = this.el("div", null, parent);
      const submit = document.querySelector('#edit-form button[type="submit"]'); submit.disabled = true;
      let rows = [];
      let duplicateChecks = [];
      company.oninput = company.onchange = () => duplicateChecks.forEach(update => update());
      text.oninput = () => { updateTextCount(); rows = []; duplicateChecks = []; preview.replaceChildren(); submit.disabled = true; };
      const read = this.button(parent, "読み取る", () => {
        preview.replaceChildren(); rows = []; duplicateChecks = [];
        const candidates = this.parseDeadlineText(text.value);
        if (!candidates.length) this.el("p", "日付が見つかりませんでした", preview);
        const now = new Date();
        const today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
        const count = this.el("p", "", preview, "candidate-count muted");
        const selections = [];
        const updateCount = () => { count.textContent = `候補${candidates.length}件・登録する${selections.filter(input => input.checked).length}件`; };
        const upcoming = this.el("div", null, preview);
        const pastCount = candidates.filter(c => c.date < today).length;
        const past = pastCount ? this.el("details", null, preview, "past-candidates") : null;
        if (past) this.el("summary", `過去の日付（${pastCount}件）`, past);
        candidates.forEach(c => {
          const box = this.el("details", null, c.date < today ? past : upcoming, "candidate card");
          const summary = this.el("summary", null, box);
          const line = this.el("span", null, summary, "candidate-line");
          const selected = this.field(line, "登録する", "", "checkbox"); selected.checked = c.date >= today && (!!c.webtest || !c.role || c.role === "締切");
          selections.push(selected);
          // label由来のクリックも止め、チェック本来の動作は維持する。
          line.children[0].addEventListener("click", event => event.stopPropagation());
          const toPlan = !c.webtest && ["開始", "終了", "開催"].includes(c.role)
            ? this.field(line, "予定に入れる", "", "checkbox") : null;
          if (toPlan) line.children[1].addEventListener("click", event => event.stopPropagation());
          const roleClasses = { "締切": "deadline", "開始": "start", "終了": "end", "開催": "event", "日付": "date" };
          if (c.role) this.el("span", c.role, line, "label role-" + roleClasses[c.role]);
          const dateLabel = this.el("span", "", line, "candidate-date");
          const kindLabel = this.el("span", "", line);
          const duplicate = this.el("small", "", line);
          const titleLabel = this.el("span", "", summary, "candidate-title");
          if (c.role) this.el("strong", c.roleText, titleLabel);
          const titleText = c.role ? this.el("small", "", titleLabel) : titleLabel;
          const date = this.field(box, "日付", c.date, "date"); date.required = selected.checked;
          const time = this.field(box, "時刻", c.time, "time");
          const kind = c.webtest ? { value: c.kind } : this.field(box, "種類", c.kind, "", this.kinds);
          let asWebtest = null;
          if (c.webtest) {
            const period = c.webtest.start ? "期間 " + c.webtest.start.slice(5).replace("-", "/") + "〜" : "期限 ";
            this.el("p", "Webテストの受検(" + period + c.webtest.deadline.slice(5, 10).replace("-", "/")
              + (c.webtest.center ? "・テストセンター" : "") + ")", box, "muted");
            asWebtest = this.field(box, "Webテストの記録として登録(締め切りは作らない)", "", "checkbox");
            asWebtest.checked = true;
          }
          const initialTitle = c.role === "締切" && /の回の締切$/.test(c.roleText || "")
            ? Array.from(`${c.heading || c.kind} ${c.roleText}`).slice(0, 60).join("") : c.title;
          const title = this.field(box, "件名", initialTitle); title.required = selected.checked;
          const submissions = this.field(box, "提出物(、区切り)", (c.submissions || []).join("、"));
          selected.onchange = () => { date.required = selected.checked; title.required = selected.checked; updateCount(); };
          const updateDuplicate = () => {
            const parsed = date.value ? new Date(date.value + "T00:00") : null;
            dateLabel.textContent = parsed ? `${parsed.getMonth() + 1}/${parsed.getDate()}（${"日月火水木金土"[parsed.getDay()]}）${time.value ? " " + time.value : ""}` : "日付未指定";
            kindLabel.textContent = kind.value;
            kindLabel.className = "label kind-" + this.kinds.indexOf(kind.value);
            titleText.textContent = c.role ? " " + title.value : title.value;
            const dueAt = date.value + (time.value ? "T" + time.value : "");
            const exists = asWebtest?.checked
              ? (this.companyRecord(company.value.trim())?.webtests || []).some(test => test.deadline === dueAt && test.format === c.webtest.format)
              : this.hasDuplicateDeadline(company.value.trim(), dueAt, kind.value);
            duplicate.textContent = exists ? "登録済み" : "";
            if (exists) selected.checked = false;
            selected.onchange();
          };
          date.oninput = date.onchange = time.oninput = time.onchange = kind.oninput = kind.onchange = updateDuplicate;
          if (asWebtest) asWebtest.onchange = updateDuplicate;
          title.oninput = title.onchange = () => { titleText.textContent = c.role ? " " + title.value : title.value; };
          duplicateChecks.push(updateDuplicate);
          updateDuplicate();
          rows.push(() => ({ selected: selected.checked, date: date.value, time: time.value, kind: kind.value, title: title.value, sourceText: c.sourceText,
            ...(c.webtest ? { webtest: { ...c.webtest, deadline: date.value + (time.value ? "T" + time.value : "") }, asWebtest: asWebtest.checked } : {}),
            submissions: [...new Set(submissions.value.split(/[、,，\r\n]/).map(label => Array.from(label.trim()).slice(0, 100).join("")).filter(Boolean))].slice(0, 20), plan: !!toPlan?.checked, role: c.role || "", heading: c.heading || "" }));
        });
        updateCount();
        submit.disabled = !rows.length;
      });
      if (page) read.click();
      return () => ({ company: company.value, candidates: rows.map(read => read()) });
    }, values => {
      const before = this.data.deadlines.length;
      const webtests = this.registerDeadlineCandidates(values.company, values.candidates, page);
      this.registerPlanCandidates(values.company, values.candidates);
      if (values.candidates.some(c => c.webtest)) {
        const message = document.getElementById("message").textContent;
        this.message((values.candidates.some(c => c.plan) ? message : `締め切り${this.data.deadlines.length - before}件入れました`)
          + `・Webテスト ${webtests} 件`);
      }
    });
    document.querySelector('#edit-form button[type="submit"]').textContent = "選んだ候補を登録";
  },
  renderChecklist(card, item) {
    if (!item.checklist?.length) return;
    const list = this.el("ul", null, card, "checklist");
    item.checklist.forEach(c => {
      const row = this.el("li", null, list, c.done ? "done" : "");
      const label = this.el("label", null, row);
      const check = this.el("input", null, label);
      check.type = "checkbox";
      check.checked = c.done;
      this.el("span", c.label, label);
      check.onchange = () => {
        c.done = !c.done;
        item.updatedAt = this.now();
        this.changed();
        this.render();
      };
    });
    if (item.checklist.every(c => c.done) && ["未着手", "進行中"].includes(item.status)) {
      this.el("p", "すべて済:『提出済にする』を押せます", card, "checklist-hint");
    }
  },
  checklistLabel(meta, item, word = "提出物") {
    if (!item.checklist?.length) return;
    const done = item.checklist.filter(c => c.done).length;
    this.el("span", `${word} ${done}/${item.checklist.length}`, meta,
      "label checklist-count" + (done === item.checklist.length ? " done" : ""));
  },
  deadlineCard(parent, item, now) {
    const done = ["提出済", "見送り"].includes(item.status);
    const remaining = this.remaining(item, now);
    const className = done ? "" : remaining.expired ? " overdue" : remaining.days <= 7 ? " soon" : "";
    const card = this.el("article", null, parent, "card" + className);
    if (this.deadlineSelection) {
      card.className += " bulk-card";
      const check = this.field(card, item.company + " " + item.title + "を選択", "", "checkbox");
      check.checked = this.deadlineSelection.has(item.id);
      check.onchange = () => {
        if (check.checked) this.deadlineSelection.add(item.id); else this.deadlineSelection.delete(item.id);
        this.render();
      };
    }
    this.el("h3", item.title, card);
    const meta = this.el("div", null, card, "deadline-meta");
    this.companyAvatar(meta, item.company).className += " small";
    this.companyLink(meta, item.company).className = "company-link";
    this.el("span", item.kind, meta, "label kind-" + this.kinds.indexOf(item.kind));
    if (!remaining.expired && this.findConflicts(this.data.deadlines).some(pair => pair.a === item || pair.b === item)) {
      this.el("span", "日程が近い", meta, "label conflict");
    }
    if (item.source === "auto") this.el("span", "自動", meta, "label auto");
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
    if (!done) this.button(actions, "見送り", () => {
      item.status = "見送り";
      item.updatedAt = this.now();
      this.changed();
      this.render();
    });
    this.button(actions, "複製", () => this.editDeadline(null, {
      company: item.company, kind: item.kind, title: item.title + "(コピー)",
      url: item.url, note: item.note, place: item.place,
      checklist: item.checklist?.map(c => ({ label: c.label, done: false }))
    }));
    this.button(actions, "編集", () => this.editDeadline(item));
    this.button(actions, "削除", () => this.remove(this.data.deadlines, item));
    if (item.url) {
      const row = this.el("p", null, card, "deadline-url muted");
      let isWebUrl = false;
      try { isWebUrl = ["http:", "https:"].includes(new URL(item.url).protocol); } catch {}
      if (isWebUrl) {
        const link = this.el("a", item.url, row);
        link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      } else row.textContent = item.url;
    }
    this.renderChecklist(card, item);
    if (item.note) this.el("p", item.note, card, "pre");
    const draft = this.draftDate(item);
    if (["未着手", "進行中"].includes(item.status) && draft) {
      const date = new Date(draft + "T00:00");
      const today = now || new Date();
      this.el("small", `下書きの目安:${date.getMonth() + 1}/${date.getDate()}`, card,
        date <= new Date(today.getFullYear(), today.getMonth(), today.getDate()) ? "danger" : "");
    }
    return card;
  },
  renderDeadlines(root) {
    const head = this.el("div", null, root, "page-head");
    this.el("h2", "締め切り", head);
    this.button(head, "＋ 締め切りを追加", () => this.editDeadline()).className = "primary";
    const now = new Date();
    const all = ShukatsuShared.activeDeadlines(this.data.deadlines);
    const stats = this.el("div", null, root, "stats");
    [["期限切れ", "expired"], ["今日・明日", "soon1"], ["7日以内", "week"],
      ["未着手・進行中の合計", ""]].forEach(([label, quick], index) => {
      const count = quick ? all.filter(d => this.matchesDeadlineQuick(d, quick, now)).length : all.length;
      const card = this.button(stats, "", () => {
        this.deadlineQuick = this.deadlineQuick === quick ? "" : quick;
        this.render();
      });
      card.className = "card stat";
      card.setAttribute("aria-pressed", String(this.deadlineQuick === quick));
      this.el("span", label, card);
      this.el("strong", count, card, index === 0 && count ? "danger" : "");
    });
    const conflicts = this.findConflicts(this.data.deadlines).filter(({ a, b }) => !(this.remaining(a, now).expired && this.remaining(b, now).expired));
    if (conflicts.length) {
      const warnings = this.el("details", null, root, "conflicts");
      warnings.open = !!this.conflictsOpen;
      warnings.addEventListener("toggle", () => { this.conflictsOpen = warnings.open; });
      const overlap = conflicts.filter(({ type }) => type === "重なり").length;
      const move = conflicts.length - overlap;
      this.el("summary", [overlap ? `日程が近い予定 ${overlap}組` : "", move ? `移動に注意 ${move}組` : ""].filter(Boolean).join("・"), warnings);
      conflicts.forEach(({ a, b, type }) => {
        const date = a.dueAt.slice(5, 10).replace("-", "/");
        this.el("p", type === "重なり"
          ? `日程が近い:${a.title} と ${b.title}(${date} ${a.dueAt.slice(11)}・${b.dueAt.slice(11)})`
          : `移動に注意:${a.place} → ${b.place}`, warnings);
      });
    }
    const submissions = this.data.deadlines
      .filter(item => ["未着手", "進行中"].includes(item.status)
        && item.checklist?.some(c => c.done === false))
      .map(item => ({ item, pending: item.checklist.filter(c => c.done === false) }))
      .sort((a, b) => a.item.dueAt.localeCompare(b.item.dueAt));
    if (submissions.length) {
      const counts = new Map();
      let total = 0;
      submissions.forEach(({ pending }) => pending.forEach(c => {
        counts.set(c.label, (counts.get(c.label) || 0) + 1);
        total++;
      }));
      const todo = this.el("details", null, root, "submissions-todo");
      todo.open = !!this.submissionsOpen;
      todo.addEventListener("toggle", () => { this.submissionsOpen = todo.open; });
      const labels = [...counts].sort((a, b) => b[1] - a[1])
        .map(([label, count]) => `${label} ${count}`).join("・");
      this.el("summary", `まだの提出物 ${total}件 (${labels})`, todo);
      submissions.forEach(({ item, pending }) => {
        const group = this.el("div", null, todo, "submission-group");
        const remaining = this.remaining(item, now);
        const date = new Date(item.dueAt.slice(0, 10) + "T00:00");
        const time = item.dueAt.slice(11, 16);
        this.el("h3", `${item.company} ${item.title}(${date.getMonth() + 1}/${date.getDate()}${time ? " " + time : ""}、${remaining.text})`,
          group, remaining.expired ? "danger" : "");
        const list = this.el("ul", null, group, "submission-checklist");
        pending.forEach(c => {
          const row = this.el("li", null, list);
          const label = this.el("label", null, row);
          const check = this.el("input", null, label);
          check.type = "checkbox";
          check.checked = false;
          this.el("span", c.label, label);
          check.onchange = () => {
            c.done = true;
            item.updatedAt = this.now();
            this.changed();
            this.render();
          };
        });
      });
    }
    const tools = this.el("div", null, root, "toolbar");
    const bulkBar = this.deadlineSelection ? this.el("div") : null;
    if (bulkBar) {
      const bar = bulkBar;
      bar.className = "bulk-actions";
      this.el("span", `${this.deadlineSelection.size}件選択中`, bar);
      this.button(bar, "提出済にする", () => this.finishDeadlineSelection()).disabled = this.deadlineSelection.size === 0;
      this.button(bar, "削除", () => this.finishDeadlineSelection(true)).disabled = this.deadlineSelection.size === 0;
      this.button(bar, "やめる", () => { this.deadlineSelection = null; this.render(); });
    }
    this.button(tools, "貼り付けて追加", () => this.pasteDeadlines());
    this.button(tools, this.calendar ? "リストを表示" : "月カレンダーを表示", () => { this.calendar = !this.calendar; this.render(); });
    this.button(tools, "全件 .ics書き出し", () => this.exportICS(this.data.deadlines));
    this.button(tools, "表示中 .ics書き出し", () => {
      const items = this.filteredDeadlines().filter(d => !this.calendar || d.dueAt.startsWith(this.monthKey()));
      this.exportICS(items);
    });
    const filters = this.el("div", null, root, "toolbar");
    this.button(tools, "まとめて操作", () => { this.deadlineSelection = new Set(); this.calendar = false; this.render(); });
    [["状態", "status", this.statuses], ["種別", "kind", this.kinds], ["企業名検索", "company", null],
      ["入り方", "source", [{ label: "自動で入ったもの", value: "auto" }]]].forEach(([label, key, options]) => {
      const input = this.field(filters, label, this.deadlineFilter[key], "text",
        options ? [{ label: "すべて", value: "" }, ...options] : null);
      input.onchange = () => { this.deadlineFilter[key] = input.value; this.render(); };
    });
    const items = this.filteredDeadlines();
    if (this.calendar && !this.deadlineSelection) return this.renderCalendar(root, items);
    const closed = this.el("details", null, root);
    this.el("summary", "提出済・見送り（クリックで展開）", closed);
    const active = this.el("div");
    root.insertBefore(active, closed);
    if (!items.length) this.el("p", "該当する締め切りはありません。", active, "muted");
    const groups = ["期限切れ", "今日", "明日", "7日以内", "それ以降"].map(label => ({ label, items: [] }));
    const completed = [];
    items.forEach(item => {
      if (["提出済", "見送り"].includes(item.status)) return completed.push(item);
      const remaining = this.remaining(item, now);
      const index = remaining.expired ? 0 : remaining.days === 0 ? 1 : remaining.days === 1 ? 2 : remaining.days <= 7 ? 3 : 4;
      groups[index].items.push(item);
    });
    groups.push({ label: "", items: completed });
    if (!this.deadlineGroupOpen) this.deadlineGroupOpen = {};
    groups.forEach(group => {
      let box = active;
      if (group.label && group.items.length) {
        box = this.el("details", null, active, "deadline-group");
        box.open = this.deadlineGroupOpen[group.label] ?? group.label !== "期限切れ";
        box.addEventListener("toggle", () => { this.deadlineGroupOpen[group.label] = box.open; });
        this.el("summary", `${group.label}（${group.items.length}件）`, box, "group-head");
      }
      group.items.forEach(item => {
        this.deadlineCard(["提出済", "見送り"].includes(item.status) ? closed : box, item, now);
      });
    });
    if (bulkBar) root.append(bulkBar);
  },
  monthKey() {
    return `${this.month.getFullYear()}-${String(this.month.getMonth() + 1).padStart(2, "0")}`;
  },
  renderCalendar(root, items) {
    const tools = this.el("div", null, root, "toolbar");
    const move = n => { this.month.setMonth(this.month.getMonth() + n); this.render(); };
    this.button(tools, "前月", () => move(-1));
    this.el("strong", this.monthKey(), tools);
    this.button(tools, "翌月", () => move(1));
    const free = this.button(tools, "空き日を表示", () => { this.showFree = !this.showFree; this.render(); });
    free.setAttribute("aria-pressed", String(this.showFree));
    this.button(tools, "希望日の一覧をコピー", () => this.copyAvailability());
    const grid = this.el("div", null, root, "grid");
    ["日", "月", "火", "水", "木", "金", "土"].forEach(day => this.el("div", day, grid, "weekday"));
    const year = this.month.getFullYear();
    const month = this.month.getMonth();
    const start = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells = Math.ceil((start + days) / 7) * 7;
    const now = new Date();
    for (let i = 0; i < cells; i++) {
      const day = i - start + 1;
      const cell = this.el("div", null, grid, "day");
      if (day < 1 || day > days) continue;
      if (year === now.getFullYear() && month === now.getMonth() && day === now.getDate()) cell.className = "day today";
      this.el("strong", day, cell);
      const date = this.monthKey() + "-" + String(day).padStart(2, "0");
      const count = this.data.deadlines.filter(item => this.scheduleKinds.includes(item.kind)
        && ["未着手", "進行中"].includes(item.status) && item.dueAt.slice(0, 10) === date).length;
      if (this.showFree) {
        if (!count) cell.className += " free";
        else this.el("span", `${count}件`, cell, "label schedule-count");
      }
      const available = (this.data.availability || []).some(item => item.date === date);
      if (available) cell.className += " available";
      const star = this.button(cell, available ? "★" : "☆", () => this.toggleAvailability(date));
      star.className = "availability-toggle";
      star.setAttribute("aria-label", "都合がよい日にする");
      star.setAttribute("aria-pressed", String(available));
      items.filter(d => d.dueAt.slice(0, 10) === date).forEach(item => {
        const button = this.button(cell, `${item.company} ${item.title}`, () => this.editDeadline(item));
        if (["未着手", "進行中"].includes(item.status) && this.remaining(item, now).expired) button.className = "overdue";
      });
    }
  },
  icsEscape(text) {
    return text.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n")
      .replace(/,/g, "\\,").replace(/;/g, "\\;");
  },
  foldICS(line) {
    const encoder = new TextEncoder();
    let result = "";
    let bytes = 0;
    for (const char of line) {
      const length = encoder.encode(char).length;
      if (bytes + length > 75) { result += "\r\n "; bytes = 1; }
      result += char;
      bytes += length;
    }
    return result;
  },
  makeICS(items) {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JobNote//JA", "CALSCALE:GREGORIAN",
      "BEGIN:VTIMEZONE", "TZID:Asia/Tokyo", "BEGIN:STANDARD", "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:JST", "END:STANDARD", "END:VTIMEZONE"];
    const stamp = this.now().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    items.forEach(item => {
      lines.push("BEGIN:VEVENT", "UID:" + this.icsEscape(item.id) + "@job-note", "DTSTAMP:" + stamp);
      if (item.dueAt.length > 10) {
        lines.push("DTSTART;TZID=Asia/Tokyo:" + item.dueAt.replace(/[-:]/g, "") + "00");
      } else lines.push("DTSTART;VALUE=DATE:" + item.dueAt.replace(/-/g, ""));
      lines.push("SUMMARY:" + this.icsEscape(`【${item.company}】${item.title}`));
      lines.push("DESCRIPTION:" + this.icsEscape([item.url, item.note].filter(Boolean).join("\n")));
      lines.push("BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:締め切りの前日です", "END:VALARM", "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.map(line => this.foldICS(line)).join("\r\n") + "\r\n";
  },
  exportICS(items) { this.download("deadlines.ics", this.makeICS(items), "text/calendar;charset=utf-8"); }
});
