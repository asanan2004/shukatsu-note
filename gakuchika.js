"use strict";
Object.assign(App, {
  tagFilter: "",
  polishGakuchika(item) {
    this.modal("エピソードを磨く", parent => {
      const result = this.polishChecks(item.structure);
      result.counts.forEach(({ label, count }) => this.el("p", `${label}: ${count}字`, parent));
      result.checks.forEach(({ label, ok }) => this.el("p", `${ok ? "✓" : "△"} ${label}`, parent));
      this.button(parent, "構造を編集", () => {
        document.getElementById("editor").close();
        this.editGakuchika(item);
      });
      return () => null;
    }, () => false);
    document.querySelector('#edit-form button[type="submit"]').textContent = "閉じる";
    document.getElementById("edit-form").onsubmit = event => {
      event.preventDefault();
      document.getElementById("editor").close();
    };
  },
  editGakuchika(item) {
    const current = item || { title: "", tags: [], structure: {} };
    this.modal(item ? "エピソードを編集" : "エピソードを追加", parent => {
      const title = this.field(parent, "エピソード名", current.title);
      title.required = true;
      const tags = this.field(parent, "タグ（カンマ区切り）", current.tags.join(", "));
      const structure = {};
      [["conclusion", "結論"], ["situation", "状況"], ["problem", "課題"],
        ["action", "行動"], ["result", "結果"], ["learning", "学び"]].forEach(([key, label]) => {
        structure[key] = this.field(parent, label, current.structure[key] || "", "textarea");
      });
      return () => ({ title: title.value, tags: tags.value.split(/[,、]/).map(t => t.trim()).filter(Boolean),
        structure: Object.fromEntries(Object.entries(structure).map(([key, input]) => [key, input.value])) });
    }, values => {
      if (item) Object.assign(item, values, { updatedAt: this.now() });
      else this.data.gakuchika.push(Object.assign(values, { id: this.id(), versions: [], usedIn: [],
        createdAt: this.now(), updatedAt: this.now() }));
    });
  },
  editVersion(item, version) {
    this.modal("字数別の版", parent => {
      const chars = this.field(parent, "指定字数", version ? version.chars : 400, "number");
      chars.min = "1";
      chars.required = true;
      const text = this.field(parent, "本文", version ? version.text : "", "textarea");
      const mode = this.field(parent, "作り方", version?.seconds !== undefined ? "秒数で作る" : "字数で作る", "",
        ["字数で作る", "秒数で作る"]);
      const seconds = this.field(parent, "秒数", version?.seconds ?? 30, "number");
      seconds.min = "1";
      const estimate = this.el("small", "", parent);
      const update = this.meter(parent, text, () => Number(chars.value));
      chars.oninput = update;
      const sync = () => {
        const oral = mode.value === "秒数で作る";
        seconds.parentNode.hidden = !oral;
        seconds.disabled = !oral;
        seconds.required = oral;
        estimate.hidden = !oral;
        chars.readOnly = oral;
        if (oral) chars.value = Number(seconds.value) * 5;
        estimate.textContent = `目安の字数: ${Number(seconds.value) * 5}字`;
        update();
      };
      mode.onchange = sync;
      seconds.oninput = sync;
      sync();
      return () => {
        sync();
        return { chars: Number(chars.value), text: text.value,
          ...(mode.value === "秒数で作る" ? { seconds: Number(seconds.value) } : {}) };
      };
    }, values => {
      if (version) {
        delete version.seconds;
        Object.assign(version, values);
      }
      else item.versions.push(values);
      item.updatedAt = this.now();
    });
  },
  editUse(item, use) {
    this.modal("使った企業を記録", parent => {
      const company = this.field(parent, "企業名", use ? use.company : "");
      company.required = true;
      const date = this.field(parent, "日付", use ? use.date : "", "date");
      date.required = true;
      return () => ({ company: company.value, date: date.value });
    }, values => {
      if (use) Object.assign(use, values);
      else item.usedIn.push(values);
      item.updatedAt = this.now();
    });
  },
  renderGakuchika(root) {
    const head = this.el("div", null, root, "page-head");
    this.el("h2", "ガクチカ", head);
    this.button(head, "＋ エピソードを追加", () => this.editGakuchika());
    const tags = [...new Set(this.data.gakuchika.flatMap(item => item.tags))];
    const toolbar = this.el("div", null, root, "toolbar");
    const filter = this.field(toolbar, "タグで絞り込み", this.tagFilter, "",
      [{ label: "すべて", value: "" }, ...tags]);
    filter.onchange = () => { this.tagFilter = filter.value; this.render(); };
    if (this.data.gakuchika.length) {
      const usage = this.el("div", null, root, "usage");
      this.el("h3", "使い方のかたより", usage);
      const answers = this.data.esQuestions.flatMap(question => question.answers);
      const counts = this.data.gakuchika.map(item => item.usedIn.length +
        answers.filter(answer => answer.gakuchikaId === item.id).length);
      const total = counts.reduce((sum, count) => sum + count, 0);
      const max = Math.max(...counts);
      this.data.gakuchika.forEach((item, index) => {
        const row = this.el("div", null, usage, "usage-row");
        this.el("span", item.title, row);
        const track = this.el("div", null, row, "usage-track");
        this.el("div", null, track, "usage-bar").style.width = `${max ? counts[index] / max * 100 : 0}%`;
        this.el("span", `${counts[index]}件`, row);
        if (total >= 5 && counts[index] / total > 0.6) {
          this.el("p", `${item.title}に偏っています。別の経験も用意しましょう`, usage, "muted");
        }
      });
      const missing = this.allGenres().filter(genre => genre !== "志望動機" &&
        !this.data.esQuestions.some(question => question.genre === genre && question.answers.length));
      if (missing.length) this.el("p", `まだ回答がないジャンル:${missing.join("、")}`, usage, "muted");
    }
    const items = this.data.gakuchika.filter(item => !this.tagFilter || item.tags.includes(this.tagFilter));
    if (!items.length) this.el("p", "エピソードはありません。", root, "muted");
    items.forEach(item => {
      const card = this.el("details", null, root, "card");
      const count = new Set(item.usedIn.map(use => use.company)).size;
      this.el("summary", `${item.title} · 使用${count}社 · ${item.tags.join(" / ")}`, card);
      const actions = this.el("div", null, card, "actions");
      this.button(actions, "構造を編集", () => this.editGakuchika(item));
      this.button(actions, "削除", () => this.remove(this.data.gakuchika, item));
      this.button(actions, "磨く", () => this.polishGakuchika(item));
      const labels = ["結論", "状況", "課題", "行動", "結果", "学び"];
      const structure = this.el("dl", null, card, "structure");
      ["conclusion", "situation", "problem", "action", "result", "learning"].forEach((key, i) => {
        this.el("dt", labels[i], structure);
        this.el("dd", item.structure[key] || "未記入", structure, "pre");
      });
      this.el("h3", "字数別の版", card);
      this.button(card, "＋ 版を追加", () => this.editVersion(item));
      item.versions.forEach(version => {
        const box = this.el("div", null, card, "card");
        const count = this.count(version.text);
        const diff = version.chars - count;
        const difference = diff < 0 ? -diff + "字オーバー" : "あと" + diff + "字";
        const label = version.seconds !== undefined ? `${version.seconds}秒版(目安${version.seconds * 5}字)` : `${version.chars}字版`;
        const summary = `${label} · ${count}字（改行を除く） · ${difference}`;
        const meta = this.el("div", null, box, "deadline-meta");
        this.el("strong", summary, meta, diff < 0 ? "over" : "good");
        const versionActions = this.el("div", null, meta, "deadline-actions");
        this.button(versionActions, "編集", () => this.editVersion(item, version));
        this.button(versionActions, "コピー", () => {
          const names = this.otherCompanyNames(version.text, "");
          if (names.length && !confirm(`企業名「${names.join("、")}」が入っています。このままコピーしますか？`)) return;
          this.copy(version.text);
        });
        this.button(versionActions, "削除", () => this.remove(item.versions, version));
        this.el("p", version.text, box, "pre");
      });
      this.el("h3", "使った企業", card);
      this.button(card, "＋ 使用を記録", () => this.editUse(item));
      item.usedIn.forEach(use => {
        const row = this.el("p", null, card);
        this.companyLink(row, use.company);
        this.el("span", ` · ${use.date} `, row);
        this.button(row, "編集", () => this.editUse(item, use));
        this.button(row, "削除", () => this.remove(item.usedIn, use));
      });
    });
  }
});
