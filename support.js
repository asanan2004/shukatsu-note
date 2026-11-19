"use strict";
Object.assign(App, {
  textDifference(before, after) {
    const a = Array.from(before), b = Array.from(after);
    let start = 0, end = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
    return { prefix: a.slice(0, start).join(""), removed: a.slice(start, a.length - end).join(""), added: b.slice(start, b.length - end).join(""), suffix: end ? a.slice(-end).join("") : "" };
  },
  showAnswerDiff(parent, answer) {
    if (!answer.submitted) { this.el("p", "提出版が固定されていません。ES画面で提出版を固定してください。", parent); return; }
    const diff = this.textDifference(answer.submitted.text, answer.text);
    this.el("p", "提出版の固定日時：" + answer.submitted.at, parent);
    if (!diff.removed && !diff.added) this.el("p", "提出版と最新原稿は同じです。", parent);
    const grid = this.el("div", null, parent, "diff-columns");
    [["提出した内容", diff.removed, "del"], ["最新原稿", diff.added, "ins"]].forEach(([title, change, tag]) => {
      const side = this.el("section", null, grid);
      this.el("h4", title, side);
      const text = this.el("p", null, side, "pre");
      this.el("span", diff.prefix, text); this.el(tag, change, text); this.el("span", diff.suffix, text);
    });
    this.el("p", "最初と最後の一致部分を除いた変更範囲を色で示しています。", parent, "muted");
  },
  waitingRecords() { return (this.data.companies || []).flatMap(c => (c.waiting || []).map(w => ({ company: c.name, record: w }))); },
  waitDays(date, now = new Date()) {
    return Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(date + "T00:00")) / 86400000);
  },
  editWaiting(company, item) {
    this.modal(item ? "連絡待ちを編集" : "連絡待ちを追加", p => {
      const application = this.field(p, "応募先", item?.applicationId || "", "", [{ value: "", label: "応募未設定" }, ...this.applicationItems(company).map(a => ({value:a.id, label:this.applicationLabel(a)}))]);
      const title = this.field(p, "待っている連絡", item?.title || "面接結果"); title.required = true;
      const start = this.field(p, "面接日・連絡した日", item?.start || "", "date"); start.required = true;
      const expected = this.field(p, "連絡予定日（未定なら空欄）", item?.expected || "", "date");
      const note = this.field(p, "メモ", item?.note || "", "textarea");
      return () => ({ applicationId:application.value, title:title.value.trim(), start:start.value, expected:expected.value, note:note.value });
    }, values => {
      if (!values.title || !values.start) return false;
      const c = this.companyRecord(company, true);
      if (item) Object.assign(item, values); else (c.waiting ||= []).push({id:this.id(), done:false, ...values});
      c.updatedAt = this.now();
    });
  },
  renderWaiting(root) {
    this.el("h3", "返信待ち・結果待ち", root);
    const names = [...new Set([...this.allCompanyNames(), ...this.data.esQuestions.flatMap(q => q.answers.map(a => a.company).filter(Boolean))])];
    if (!names.length) this.el("p", "先に企業や締め切りを登録してください。", root);
    const company = this.field(root, "企業", names[0] || "", "", names);
    this.button(root, "連絡待ちを追加", () => { if (company.value) this.editWaiting(company.value); });
    const records = this.waitingRecords();
    if (!records.length) this.el("p", "連絡待ちの記録はありません。", root);
    records.sort((a,b) => Number(a.record.done) - Number(b.record.done) || (a.record.expected || "9999").localeCompare(b.record.expected || "9999")).forEach(({company, record:w}) => {
      const card = this.el("article", null, root, "card");
      const app = this.applicationItems(company).find(a => a.id === w.applicationId);
      this.el("h4", company + " / " + (app ? this.applicationLabel(app) : "応募未設定") + " / " + w.title, card);
      const overdue = w.expected && this.waitDays(w.expected) > 0;
      this.el("p", w.done ? "連絡済み・完了" : "経過 " + Math.max(0,this.waitDays(w.start)) + "日 / " + (w.expected ? "連絡予定 " + w.expected + (overdue ? "（予定日超過）" : "") : "予定日未定"), card, overdue && !w.done ? "danger" : "");
      if (w.note) this.el("p", w.note, card, "pre");
      this.button(card, "編集", () => this.editWaiting(company,w));
      this.button(card, w.done ? "待ち状態に戻す" : "連絡済みにする", () => { w.done = !w.done; this.companyRecord(company).updatedAt = this.now(); this.changed(); this.render(); });
      this.button(card, "問い合わせ文の下書き", () => this.modal("問い合わせ文の下書き", p => {
        const text = this.field(p, "本文（必要な箇所を補ってください）", company + "\n採用ご担当者様\n\nお世話になっております。[氏名]です。\n" + w.start + "の" + w.title + "につきまして、今後のご連絡時期をお伺いしたくご連絡いたしました。\nお忙しいところ恐縮ですが、ご確認いただけますと幸いです。\n\n[氏名・連絡先]", "textarea");
        this.button(p, "本文をコピー", () => this.copy(text.value)); return () => null;
      }, () => {}));
      this.button(card, "削除", () => this.remove(this.companyRecord(company).waiting,w));
    });
  },
  comparisonAxes() { return this.data.careerAxes || ["仕事内容", "勤務地", "働き方", "成長環境"]; },
  renderReuse(root) {
    this.el("h3", "ESの使い回し", root);
    const entries = this.data.esQuestions.flatMap(question => question.answers
      .filter(answer => answer.company).map(answer => ({ question, answer })));
    const names = [...new Set(entries.map(({ answer }) => answer.company))].sort((a,b) => a.localeCompare(b, "ja"));
    const industryOf = name => this.companyRecord(name)?.industry || "";
    const industries = [...new Set(names.map(industryOf).filter(Boolean))].sort((a,b) => a.localeCompare(b, "ja"));
    const filter = this.field(root, "業界", this.reuseIndustry || "", "", [
      { value: "", label: "すべて" }, ...industries.map(value => ({ value, label: value })),
      { value: "unset", label: "業界未設定" }
    ]);
    filter.onchange = () => { this.reuseIndustry = filter.value; this.render(); };
    const visible = names.filter(name => !this.reuseIndustry || (this.reuseIndustry === "unset"
      ? !industryOf(name) : industryOf(name) === this.reuseIndustry));
    const groups = new Map();
    entries.forEach(({ answer }) => {
      const industry = industryOf(answer.company);
      if (!industry || !answer.gakuchikaId) return;
      if (!groups.has(industry)) groups.set(industry, new Map());
      const stories = groups.get(industry);
      if (!stories.has(answer.gakuchikaId)) stories.set(answer.gakuchikaId, new Set());
      stories.get(answer.gakuchikaId).add(answer.company);
    });
    const duplicates = [];
    groups.forEach((stories, industry) => stories.forEach((companies, id) => {
      if (companies.size > 1) duplicates.push({ industry, id, companies });
    }));
    const storyTitle = id => this.data.gakuchika.find(item => item.id === id)?.title;
    const shownDuplicates = duplicates.filter(group => [...group.companies].some(name => visible.includes(name)));
    shownDuplicates.forEach(group => this.el("p", `${group.industry}: ${storyTitle(group.id) || group.id} → ${[...group.companies].sort((a,b) => a.localeCompare(b, "ja")).join("・")}`, root, "answer-warning"));
    if (!shownDuplicates.length) this.el("p", "同じ業界で同じ話は使っていません", root, "muted");
    const genres = this.allGenres().filter(genre => entries.some(({ question }) => question.genre === genre));
    const table = this.el("table", null, this.el("div", null, root, "comparison-scroll"));
    const header = this.el("tr", null, this.el("thead", null, table));
    ["企業", ...genres].forEach(text => this.el("th", text, header).setAttribute("scope", "col"));
    const body = this.el("tbody", null, table);
    visible.forEach(name => {
      const row = this.el("tr", null, body);
      this.el("th", name, row).setAttribute("scope", "row");
      genres.forEach(genre => {
        const cell = this.el("td", null, row);
        const answers = entries.filter(({ question, answer }) => answer.company === name && question.genre === genre);
        if (!answers.length) this.el("span", "—", cell, "muted");
        answers.forEach(({ question, answer }) => {
          const line = this.el("div", null, cell);
          this.button(line, (storyTitle(answer.gakuchikaId) || Array.from(answer.text).slice(0, 20).join("")) + (answer.submitted ? "(提出版)" : ""), () => {
            this.esFilter = { genre: "", company: "", text: "" };
            this.openQuestionId = question.id;
            location.hash = "#es";
          });
          if (duplicates.some(group => group.id === answer.gakuchikaId && group.companies.has(name))) {
            this.el("span", "同業界で同じ話", line, "label");
          }
        });
      });
    });
  },
  renderComparison(root) {
    this.el("h3", "企業の一覧", root);
    const sort = this.field(root, "並び順", this.comparisonSort || "rank", "", [
      { value: "rank", label: "志望度順" }, { value: "deadline", label: "次の期限が近い順" },
      { value: "average", label: "軸の平均が高い順" }
    ]);
    sort.onchange = () => { this.comparisonSort = sort.value; this.render(); };
    const now = new Date();
    const rows = this.allCompanyNames().filter(name => this.comparisonAll || !["不合格", "辞退"].includes(this.companyStage(name))).map(name => {
      const record = this.companyRecord(name);
      const ratings = Object.values(record?.comparison || {}).map(value => Number(value.rating)).filter(value => value >= 1 && value <= 5);
      return { name, record, next: this.companyNextSteps(name, now), average: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null };
    });
    const rankOrder = row => ({ S: 0, A: 1, B: 2, C: 3 }[row.record?.rank] ?? 4);
    rows.sort((a,b) => {
      const order = this.comparisonSort === "deadline"
        ? (a.next.steps[0]?.dueAt || "9999").localeCompare(b.next.steps[0]?.dueAt || "9999")
        : this.comparisonSort === "average" ? (b.average ?? -1) - (a.average ?? -1) : rankOrder(a) - rankOrder(b);
      return order || a.name.localeCompare(b.name, "ja");
    });
    const overview = this.el("table", null, this.el("div", null, root, "comparison-scroll"));
    const headings = this.el("tr", null, this.el("thead", null, overview));
    ["企業", "志望度", "業界", "選考ステージ", "次の一手", "軸の平均"].forEach(text => this.el("th", text, headings).setAttribute("scope", "col"));
    const overviewBody = this.el("tbody", null, overview);
    const shortDate = value => { const date = value.slice(0,10).split("-"); return Number(date[1]) + "/" + Number(date[2]); };
    rows.forEach(({ name, record, next, average }) => {
      const row = this.el("tr", null, overviewBody);
      const heading = this.el("th", null, row); heading.setAttribute("scope", "row"); this.companyLink(heading, name);
      const first = next.steps[0];
      const nextText = first ? `${shortDate(first.dueAt)} ${first.text}` : next.waiting
        ? `結果待ち(${next.waiting.stage}${next.waiting.since ? "、" + shortDate(next.waiting.since) + " から" : ""})` : "—";
      [record?.rank || "未設定", record?.industry || "—", this.stageLabel(this.companyStage(name), record?.stageDetail), nextText,
        average === null ? "—" : average.toFixed(1)].forEach(text => this.el("td", text, row));
    });
    const include = this.field(root, "不合格・辞退を含める", "", "checkbox");
    include.checked = !!this.comparisonAll;
    include.onchange = () => { this.comparisonAll = include.checked; this.render(); };
    const details = this.el("details", null, root);
    this.el("summary", "軸ごとの評価を見る・編集する", details);
    root = details;
    this.el("h3", "就活の軸と企業の比較", root);
    this.button(root, "比較する軸を設定", () => this.modal("就活の軸", p => {
      const axes = this.field(p, "1行に1つ（最大12項目）", this.comparisonAxes().join("\n"), "textarea");
      return () => [...new Set(axes.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
    }, axes => { if (!axes.length || axes.length > 12) { this.message("軸を1〜12項目にしてください。"); return false; } this.data.careerAxes = axes; }));
    const wrap = this.el("div", null, root, "comparison-scroll");
    const table = this.el("table", null, wrap);
    const header = this.el("tr", null, this.el("thead",null,table));
    ["企業", ...this.comparisonAxes()].forEach(s => this.el("th",s,header).setAttribute("scope","col"));
    const body = this.el("tbody",null,table);
    [...new Set([...this.allCompanyNames(), ...this.data.esQuestions.flatMap(q => q.answers.map(a => a.company).filter(Boolean))])].forEach(name => {
      const tr = this.el("tr",null,body); this.el("th",name,tr).setAttribute("scope","row");
      this.comparisonAxes().forEach(axis => {
        const td = this.el("td",null,tr), value = this.companyRecord(name)?.comparison?.[axis];
        this.el("p", value ? "評価：" + (value.rating || "未評価") + "\n根拠：" + (value.reason || "未記録") + "\n未確認：" + (value.unknown || "なし") : "未評価・未確認", td, "pre");
        this.button(td,"評価・根拠を編集", () => this.modal(name + " / " + axis,p => {
          const rating = this.field(p,"評価",value?.rating || "","",["","1","2","3","4","5"]);
          const reason = this.field(p,"評価の根拠・出典",value?.reason || "","textarea");
          const unknown = this.field(p,"未確認事項",value?.unknown || "","textarea");
          return () => ({rating:rating.value,reason:reason.value,unknown:unknown.value});
        }, v => { const c = this.companyRecord(name,true); Object.defineProperty(c.comparison ||= {}, axis, { value: v, enumerable: true, configurable: true, writable: true }); c.updatedAt = this.now(); }));
      });
    });
  },
  renderFeatureSettings(root) {
    this.el("h3", "使う機能の表示設定", root);
    const presets = { "すべて":[], "応募準備中":["pipeline"], "選考中":["gakuchika"], "内定比較中":["gakuchika","es","mypages"] };
    Object.entries(presets).forEach(([label,hidden]) => this.button(root,label,() => { this.data.featureDisplay = { hidden:[...hidden] }; this.changed(); this.render(); }));
    const hidden = this.data.featureDisplay?.hidden || [];
    [["deadlines","締め切り"],["pipeline","選考"],["mypages","マイページ"],["gakuchika","ガクチカ"],["es","ES設問バンク"]].forEach(([id,label]) => {
      const input = this.field(root,label,"","checkbox"); input.checked = !hidden.includes(id);
      input.onchange = () => { const set = new Set(this.data.featureDisplay?.hidden || []); if(input.checked) set.delete(id); else set.add(id); this.data.featureDisplay = {hidden:[...set]}; this.changed(); this.applyFeatureDisplay(); };
    });
    this.el("p","今日・判断サポート・データは常に表示します。非表示にした機能の記録は保持されます。",root,"muted");
  },
  applyFeatureDisplay() {
    const hidden = this.data.featureDisplay?.hidden || [];
    document.querySelectorAll("nav a").forEach(a => { a.hidden = hidden.includes(a.hash.slice(1)); });
  },
  renderSupport(root) {
    this.el("h2","判断サポート",root);
    const tabs = this.el("div",null,root,"toolbar");
    const selected = this.supportTab || "diff";
    [["diff","提出ESの差分"],["waiting","返信・結果待ち"],["comparison","企業比較"],["reuse","ESの使い回し"],["settings","表示設定"]].forEach(([id,label]) => this.button(tabs,label,() => { this.supportTab = id; this.render(); }));
    if (selected === "waiting") this.renderWaiting(root);
    else if (selected === "comparison") this.renderComparison(root);
    else if (selected === "reuse") this.renderReuse(root);
    else if (selected === "settings") this.renderFeatureSettings(root);
    else {
      this.el("h3","提出ESと最新原稿の比較",root);
      let count = 0;
      this.data.esQuestions.forEach(q => q.answers.filter(a => a.submitted).forEach(a => {
        count++; const card = this.el("details",null,root,"card");
        const application = this.applicationItems(a.company).find(x => x.id === a.applicationId);
        this.el("summary",a.company + " / " + (application ? this.applicationLabel(application) : "応募未設定") + " / " + q.question,card);
        this.showAnswerDiff(card,a);
      }));
      if (!count) this.el("p","固定した提出版がまだありません。ES設問バンクで回答を提出版として固定してください。",root);
    }
  }
});
const validateBeforeSupport = App.validate;
App.validate = function(data) {
  validateBeforeSupport.call(this,data);
  const date = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (data.careerAxes !== undefined && (!Array.isArray(data.careerAxes) || !data.careerAxes.length || data.careerAxes.length > 12 || data.careerAxes.some(s => typeof s !== "string" || !s.trim()) || new Set(data.careerAxes).size !== data.careerAxes.length)) throw new Error("就活の軸の形式が不正です。");
  if (data.featureDisplay !== undefined && (!data.featureDisplay || !Array.isArray(data.featureDisplay.hidden) || data.featureDisplay.hidden.some(s => !["deadlines","pipeline","mypages","gakuchika","es"].includes(s)))) throw new Error("表示設定の形式が不正です。");
  for (const c of data.companies || []) {
    if (c.waiting !== undefined && (!Array.isArray(c.waiting) || c.waiting.some(w => !w || !["id","title","applicationId","note"].every(k => typeof w[k] === "string") || !date(w.start) || (w.expected !== "" && !date(w.expected)) || typeof w.done !== "boolean"))) throw new Error("連絡待ちの形式が不正です。");
    if (c.comparison !== undefined && (!c.comparison || Array.isArray(c.comparison) || typeof c.comparison !== "object" || Object.values(c.comparison).some(v => !v || !["rating","reason","unknown"].every(k => typeof v[k] === "string") || !["","1","2","3","4","5"].includes(v.rating)))) throw new Error("企業比較の形式が不正です。");
  }
  return data;
};
const todayBeforeSupport = App.renderToday;
App.renderToday = function(root) {
  todayBeforeSupport.call(this,root);
  const overdue = this.waitingRecords().filter(({record:w}) => !w.done && w.expected && this.waitDays(w.expected) > 0);
  if (overdue.length) {
    const card = this.el("section",null,root,"card");
    this.el("h3","連絡予定日を過ぎた応募：" + overdue.length + "件",card);
    overdue.forEach(({company,record:w}) => this.el("p",company + " / " + w.title + " / 予定 " + w.expected,card));
    this.button(card,"返信・結果待ちを開く",() => { this.supportTab = "waiting"; location.hash = "#support"; this.render(); });
  }
};
