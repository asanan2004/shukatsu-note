"use strict";
Object.assign(App, {
  replyDraft({ company, to, slots }) {
    const dates = slots.slice(0, 3).filter(slot => slot.date && slot.time.trim()).map(slot => {
      const date = new Date(slot.date + "T00:00");
      return `・${date.getMonth() + 1}月${date.getDate()}日(${"日月火水木金土"[date.getDay()]}) ${slot.time.trim()}`;
    });
    return `${company}\n${to.trim() || "採用ご担当者様"}\n\nお世話になっております。(大学名)の(氏名)です。\n面接日程のご連絡をいただき、ありがとうございます。\n以下の日程でしたら、参加が可能です。\n\n${dates.join("\n")}\n\nお忙しいところ恐縮ですが、ご確認のほどよろしくお願いいたします。\n\n(大学名)(学部)(氏名)`;
  },
  editReply(company) {
    this.modal("日程の返信文", parent => {
      this.el("p", "下書きは保存・送信しません。大学名・氏名は置き場所の文字のままです。", parent, "muted");
      const to = this.field(parent, "宛先の呼び方", "採用ご担当者様");
      const slots = Array.from({ length: 3 }, (_, index) => ({
        date: this.field(parent, `候補日${index + 1}`, "", "date"),
        time: this.field(parent, `時間帯${index + 1} (例:10:00〜12:00)`, "")
      }));
      this.button(parent, "下書きを作る", () => {
        draft.value = this.replyDraft({ company, to: to.value,
          slots: slots.map(slot => ({ date: slot.date.value, time: slot.time.value })) });
      });
      const draft = this.field(parent, "返信文の下書き", "", "textarea");
      this.button(parent, "コピー", () => this.copy(draft.value));
      return () => null;
    }, () => false);
    document.querySelector('#edit-form button[type="submit"]').textContent = "閉じる";
    document.getElementById("edit-form").onsubmit = event => {
      event.preventDefault();
      document.getElementById("editor").close();
    };
  },
  draftDate(item) {
    if (item.kind !== "ES") return "";
    const total = this.data.esQuestions.filter(question => question.answers.some(answer => answer.company === item.company))
      .reduce((sum, question) => sum + question.limit, 0) || 400;
    const date = new Date(item.dueAt.slice(0, 10) + "T00:00");
    date.setDate(date.getDate() - (total >= 800 ? 5 : 3));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  },
  planKinds: ["インターン", "面接", "説明会", "選考会", "その他"],
  planStatuses: ["確定", "通過したら"],
  planShowDeadlines: true,
  planDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  },
  planDateLabel(item) {
    const short = value => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
    if (item.options) return `候補${item.options.length}つ` + (item.time ? ` ${item.time}` : "");
    if (item.dates) return (item.dates.length >= 4 ? `${short(item.dates[0])} ほか${item.dates.length - 1}日`
      : item.dates.map(short).join("・")) + (item.time ? ` ${item.time}` : "");
    return short(item.start) + (item.end && item.end !== item.start ? `〜${short(item.end)}` : "")
      + (item.time ? ` ${item.time}` : "");
  },
  editPlan(item, initial = {}) {
    const current = item || { company: "", kind: "インターン", title: "", start: "", end: "",
      time: "", status: "通過したら", note: "", ...initial };
    this.modal(item ? "予定を編集" : "予定を追加", parent => {
      const company = this.field(parent, "企業名", current.company);
      this.companySuggestions(parent, company, "plan-companies");
      const kind = this.field(parent, "種類", current.kind, "", this.planKinds);
      const title = this.field(parent, "件名", current.title);
      title.required = true;
      const range = this.el("div", null, parent);
      const start = this.field(range, "開始日", current.start, "date");
      start.required = true;
      const end = this.field(range, "終了日（任意）", current.end || "", "date");
      const time = this.field(parent, "時刻（任意）", current.time || "", "time");
      const status = this.field(parent, "状態", current.status, "", this.planStatuses);
      const shape = this.field(parent, "日程の形", current.dates ? "dates" : current.options ? "options" : "range", "", [
        { value: "range", label: "続いた日程(開始日〜終了日)" },
        { value: "dates", label: "飛び飛びの日" },
        { value: "options", label: "候補から選ぶ(通過後に1つに決める)" }
      ]);
      const dateFields = this.el("div", null, parent);
      const optionFields = this.el("div", null, parent);
      const dateRows = [];
      const optionRows = [];
      const addDate = (value = "") => {
        if (dateRows.length >= 31) return;
        const row = this.el("div", null, dateFields);
        const input = this.field(row, "日付", value, "date");
        const entry = { row, input };
        dateRows.push(entry);
        this.button(row, "×", () => { dateRows.splice(dateRows.indexOf(entry), 1); row.remove(); });
      };
      const addOption = (value = { start: "", end: "" }) => {
        if (optionRows.length >= 10) return;
        const row = this.el("div", null, optionFields);
        const first = this.field(row, "候補の開始日", value.start, "date");
        const last = this.field(row, "候補の終了日（任意）", value.end, "date");
        const entry = { row, first, last };
        optionRows.push(entry);
        this.button(row, "×", () => { optionRows.splice(optionRows.indexOf(entry), 1); row.remove(); });
      };
      (current.dates || [current.start, ""]).forEach(addDate);
      (current.options || [{ start: current.start, end: current.end || "" }, { start: "", end: "" }]).forEach(addOption);
      const addDay = this.button(parent, "＋日を追加", () => addDate());
      const addCandidate = this.button(parent, "＋候補を追加", () => addOption());
      const updateShape = () => {
        range.hidden = shape.value !== "range";
        start.required = shape.value === "range";
        start.disabled = end.disabled = range.hidden;
        dateFields.hidden = addDay.hidden = shape.value !== "dates";
        optionFields.hidden = addCandidate.hidden = shape.value !== "options";
        dateRows.forEach(entry => { entry.input.disabled = dateFields.hidden; });
        optionRows.forEach(entry => { entry.first.disabled = entry.last.disabled = optionFields.hidden; });
        status.disabled = shape.value === "options";
        if (status.disabled) status.value = "通過したら";
      };
      shape.onchange = updateShape;
      updateShape();
      const checklist = this.field(parent, "準備(1行に1つ。例: 履歴書の印刷、交通経路の確認)",
        (current.checklist || []).map(entry => entry.label).join("\n"), "textarea");
      const updatePlaceholder = () => {
        title.placeholder = kind.value === "インターン" ? "例: 冬季インターン 5days" : "";
        checklist.placeholder = !item && kind.value === "面接" && !checklist.value.trim()
          ? "履歴書の印刷\n交通経路の確認\n逆質問の用意" : "";
      };
      kind.onchange = updatePlaceholder;
      checklist.oninput = updatePlaceholder;
      updatePlaceholder();
      const note = this.field(parent, "メモ", current.note || "", "textarea");
      if (item) this.button(parent, "削除", () => {
        this.remove(this.data.plans, item);
        if (!this.data.plans.includes(item)) document.getElementById("editor").close();
      });
      return () => {
        const labels = [...new Set(checklist.value.split(/\r?\n/)
          .map(label => label.trim().slice(0, 100)).filter(Boolean))].slice(0, 20);
        const values = { company: company.value.trim(), kind: kind.value, title: title.value.trim(),
          start: start.value, end: end.value, time: time.value, status: status.value, note: note.value };
        if (shape.value === "dates") {
          const dates = [...new Set(dateRows.map(entry => entry.input.value).filter(Boolean))].sort();
          if (dates.length < 2) return { error: "飛び飛びの日は2日以上入れてください。" };
          values.dates = dates;
          values.start = dates[0];
          values.end = dates[dates.length - 1];
        } else if (shape.value === "options") {
          const options = optionRows.map(entry => ({ start: entry.first.value, end: entry.last.value }))
            .filter(option => option.start);
          if (!options.length || options.some(option => option.end && option.end < option.start)) {
            return { error: "候補の開始日を入力し、終了日は開始日以降にしてください。" };
          }
          values.start = options[0].start;
          values.end = options[0].end;
          values.status = "通過したら";
          if (options.length > 1) values.options = options;
        }
        if (labels.length) values.checklist = labels.map(label => ({ label,
          done: (current.checklist || []).find(entry => entry.label === label)?.done || false }));
        return values;
      };
    }, values => {
      if (values.error) { this.message(values.error); return false; }
      if (!values.start || !values.title || (values.end && values.end < values.start)) {
        this.message("開始日と件名を入力し、終了日は開始日以降にしてください。");
        return false;
      }
      if (item) {
        Object.assign(item, values, { updatedAt: this.now() });
        if (!values.checklist) delete item.checklist;
        if (!values.options) delete item.options;
        if (!values.dates) delete item.dates;
      }
      else (this.data.plans ||= []).push({ ...values, id: this.id(), createdAt: this.now(), updatedAt: this.now() });
      this.changed();
    });
  },
  renderPlans(root) {
    const head = this.el("div", null, root, "page-head");
    this.el("h2", "選考の予定", head);
    this.button(head, "＋ 予定を追加", () => this.editPlan()).className = "primary";
    const now = new Date();
    if (!this.planMonth) this.planMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const tools = this.el("div", null, root, "toolbar");
    const move = amount => {
      this.planMonth = new Date(this.planMonth.getFullYear(), this.planMonth.getMonth() + amount, 1);
      this.render();
    };
    this.button(tools, "前月", () => move(-1));
    const monthKey = this.planDateKey(this.planMonth).slice(0, 7);
    this.el("strong", monthKey, tools);
    this.button(tools, "翌月", () => move(1));
    const allPlans = this.data.plans || [];
    const companies = [...new Set([...allPlans, ...this.data.deadlines].map(item => item.company).filter(Boolean))].sort();
    const companyLabel = this.el("label", "企業の絞り込み", tools);
    const company = this.el("select", null, companyLabel);
    this.el("option", "すべて", company).value = "";
    companies.forEach(name => { this.el("option", name, company).value = name; });
    company.value = this.planCompany || "";
    company.onchange = () => { this.planCompany = company.value; this.render(); };
    const checkLabel = this.el("label", null, tools);
    const check = this.el("input", null, checkLabel);
    check.type = "checkbox";
    check.checked = this.planShowDeadlines;
    this.el("span", "締め切りの面接・説明会も表示", checkLabel);
    check.onchange = () => { this.planShowDeadlines = check.checked; this.render(); };
    const matches = item => !this.planCompany || item.company === this.planCompany;
    const plans = allPlans.filter(matches).slice().sort((a, b) => a.start.localeCompare(b.start)
      || (a.time || "").localeCompare(b.time || ""));
    const deadlines = this.planShowDeadlines ? this.data.deadlines.filter(item => matches(item)
      && this.scheduleKinds.includes(item.kind) && ["未着手", "進行中"].includes(item.status)) : [];
    const grid = this.el("div", null, root, "grid plan-calendar");
    ["日", "月", "火", "水", "木", "金", "土"].forEach(day => this.el("div", day, grid, "weekday"));
    const year = this.planMonth.getFullYear();
    const month = this.planMonth.getMonth();
    const offset = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const today = this.planDateKey(now);
    const kinds = ["intern", "interview", "seminar", "selection", "other"];
    for (let i = 0; i < Math.ceil((offset + days) / 7) * 7; i++) {
      const cell = this.el("div", null, grid, "day");
      const day = i - offset + 1;
      if (day < 1 || day > days) continue;
      const date = `${monthKey}-${String(day).padStart(2, "0")}`;
      if (date === today) cell.className += " today";
      this.el("strong", day, cell);
      const entries = plans.flatMap(item => {
        if (item.dates) return item.dates.includes(date) ? [{ item, deadline: false }] : [];
        return (item.options || [item]).flatMap((option, index) => option.start <= date && (option.end || option.start) >= date
          ? [{ item, deadline: false, option, candidate: item.options ? index + 1 : 0 }] : []);
      });
      entries.push(...deadlines.filter(item => item.dueAt.slice(0, 10) === date)
        .map(item => ({ item, deadline: true })));
      entries.slice(0, 3).forEach(({ item, deadline, option, candidate }) => {
        const time = deadline ? item.dueAt.slice(11) : item.time;
        const text = `${deadline ? "締 " : candidate || item.status === "通過したら" ? "仮 " : ""}${candidate ? `候補${candidate} ` : ""}${time ? time + " " : ""}${item.company} ${item.title}`;
        const chip = this.button(cell, text, () => deadline ? this.editDeadline(item) : this.editPlan(item));
        chip.className = "plan-chip" + (deadline ? " from-deadline" :
          ` kind-${kinds[this.planKinds.indexOf(item.kind)] || "other"}`
          + (candidate || item.status === "通過したら" ? " tentative" : "")
          + (!item.dates && date !== (option || item).start ? " continued" : ""));
        chip.title = text;
      });
      if (entries.length > 3) this.el("small", `ほか${entries.length - 3}件`, cell, "plan-more");
    }
    this.el("h2", "これからの予定", root);
    const upcoming = plans.filter(item => item.options
      ? item.options.some(option => (option.end || option.start) >= today) : (item.end || item.start) >= today).slice(0, 20);
    if (!upcoming.length) this.el("p", "これからの予定はありません。", root);
    upcoming.forEach(item => {
      const row = this.el("div", null, root, "plan-row");
      this.el("span", this.planDateLabel(item), row);
      this.el("span", item.status, row, "label");
      this.el("span", `${item.kind} ${item.company} ${item.title}`, row);
      this.checklistLabel(row, item, "準備");
      this.button(row, "編集", () => this.editPlan(item));
      if (item.status === "通過したら") this.button(row, "確定にする", () => this.offerPlanAfterPass(item.company));
      this.button(row, "削除", () => this.remove(this.data.plans, item));
      if (item.options) this.el("small", item.options.map((option, index) =>
        `候補${index + 1} ${this.planDateLabel(option)}`).join(" / "), this.el("div", null, row, "checklist"), "muted");
      this.renderChecklist(row, item);
    });
  },
  addInternPlan(company) {
    this.editPlan(null, { company, kind: "インターン", status: "確定" });
  },
  offerPlanAfterPass(company, fromMail = false) {
    const plans = (this.data.plans || []).filter(item => item.company === company && item.status === "通過したら");
    if (!plans.length) {
      const stage = this.companyStage(company);
      if (fromMail || (this.stages.indexOf(stage) > this.stages.indexOf("Webテスト")
        && !["不合格", "辞退"].includes(stage))) {
        this.message(`${company} の日程を追加できます`);
        this.button(document.getElementById("message"), "日程を追加", () => this.addInternPlan(company))
          .className = "plan-add-action";
      }
      return;
    }
    this.modal(`${company} の予定`, parent => {
      plans.forEach(item => {
        const row = this.el("div", null, parent, "plan-confirm-row");
        this.el("p", `${item.title} ${this.planDateLabel(item)}`, row);
        const confirm = option => {
          if (option) {
            item.start = option.start;
            item.end = option.end;
            delete item.options;
          }
          item.status = "確定";
          item.updatedAt = this.now();
          this.changed();
          this.render();
          row.replaceChildren();
          this.el("p", "確定しました", row);
        };
        if (item.options) {
          let selected = item.options[0];
          item.options.forEach((option, index) => {
            const label = this.el("label", null, row);
            const radio = this.el("input", null, label);
            radio.type = "radio";
            radio.name = `plan-option-${item.id}`;
            radio.checked = index === 0;
            radio.onchange = () => { if (radio.checked) selected = option; };
            this.el("span", `候補${index + 1} ${this.planDateLabel(option)}`, label);
          });
          this.button(row, "この日程で確定", () => confirm(selected));
        } else this.button(row, "確定にする", () => confirm());
      });
      this.button(parent, "別の日程を追加", () => {
        document.getElementById("editor").close();
        this.addInternPlan(company);
      });
      return () => null;
    }, () => {});
    document.querySelector('#edit-form button[type="submit"]').textContent = "閉じる";
    document.getElementById("edit-form").onsubmit = event => {
      event.preventDefault();
      document.getElementById("editor").close();
    };
  },
  scheduleKinds: ["面接", "説明会", "Webテスト", "インターン応募"],
  showFree: false,
  findConflicts(deadlines) {
    const items = deadlines.filter(item => this.scheduleKinds.includes(item.kind)
      && ["未着手", "進行中"].includes(item.status)
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.dueAt))
      .slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const result = [];
    items.forEach((a, i) => items.slice(i + 1).forEach(b => {
      if (a.dueAt.slice(0, 10) !== b.dueAt.slice(0, 10)) return;
      const minutes = value => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
      const gap = minutes(b.dueAt) - minutes(a.dueAt);
      if (gap <= 120) result.push({ a, b, type: "重なり" });
      if (gap <= 180 && a.place && b.place && a.place !== b.place) result.push({ a, b, type: "移動" });
    }));
    return result;
  },
  toggleAvailability(date) {
    const entries = this.data.availability || [];
    this.data.availability = entries.some(item => item.date === date)
      ? entries.filter(item => item.date !== date) : [...entries, { date, note: "" }];
    this.changed();
    this.render();
  },
  copyAvailability() {
    const dates = [...new Set((this.data.availability || []).map(item => item.date))].sort();
    return this.copy(dates.map(date => {
      const day = new Date(date + "T00:00");
      return `${day.getMonth() + 1}/${day.getDate()}(${"日月火水木金土"[day.getDay()]})`;
    }).join("\n"));
  }
});
