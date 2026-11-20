"use strict";
Object.assign(App, {
  similarity(a, b) {
    const pairs = text => {
      const chars = Array.from(text.replace(/[\s\p{P}]/gu, ""));
      return chars.slice(1).map((char, i) => chars[i] + char);
    };
    const left = pairs(a), right = pairs(b);
    if (!left.length || !right.length) return 0;
    const counts = new Map();
    right.forEach(pair => counts.set(pair, (counts.get(pair) || 0) + 1));
    let overlap = 0;
    left.forEach(pair => {
      if (counts.get(pair)) { overlap++; counts.set(pair, counts.get(pair) - 1); }
    });
    return 2 * overlap / (left.length + right.length);
  },
  similarQuestions(text, exceptId) {
    return this.data.esQuestions.filter(question => question.id !== exceptId)
      .map(question => ({ question, score: this.similarity(text, question.question) }))
      .filter(item => item.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, 3);
  },
  polishChecks(structure = {}) {
    const fields = [["conclusion", "結論"], ["situation", "状況"], ["problem", "課題"],
      ["action", "行動"], ["result", "結果"], ["learning", "学び"]];
    const text = fields.map(([key]) => structure[key] || "").join("\n");
    return {
      counts: fields.map(([key, label]) => ({ key, label, count: this.count(structure[key] || "") })),
      checks: [
        { label: "数字が入っているか", ok: /[0-9０-９]/u.test(text) },
        { label: "私が何をしたか", ok: /私は|自分は|私が|自分が/u.test(text) },
        { label: "結果に変化があるか", ok: /増|減|[%％]|件|人/u.test(structure.result || "") },
        { label: "学びが次にどう生きるか", ok: /活かし|生か/u.test(structure.learning || "") }
      ]
    };
  },
  motiveDraft(motive, company) {
    const { area, customer, goal, role, strength, why } = Object.fromEntries(
      ["area", "customer", "goal", "role", "strength", "why"].map(key => [key, (motive[key] || "").trim()]));
    const wish = [area ? `${area}の分野で` : "", customer ? `${customer}の役に立ちたいと考えています` : ""].filter(Boolean);
    const first = goal
      ? `私は${area ? area + "の分野で、" : ""}${customer ? customer + "に" : ""}${goal}を実現したいと考えています。`
      : wish.length ? "私は" + wish.join("、") + (customer ? "。" : "関わりたいと考えています。") : "";
    const work = strength ? `${role ? role + "として、" : ""}${strength}を活かしたいです。`
      : role ? `${role}として働きたいと考えています。` : "";
    return first + (work ? (first ? "そのために" : "") + work : "") + why;
  },
  renderMotive(parent, company) {
    const container = this.isNarrow() ? this.foldSection(parent, "志望動機", "志望動機") : parent;
    if (!this.isNarrow()) this.el("h3", "志望動機", parent);
    const section = this.el("div", null, container, "card");
    const motive = this.companyRecord(company)?.motive || {};
    const inputs = {};
    const read = () => Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]));
    const save = () => {
      const record = this.companyRecord(company, true);
      record.motive = read();
      record.updatedAt = this.now();
      this.changed();
    };
    [["area", "領域(関わりたい分野)"], ["customer", "顧客(誰の役に立ちたいか)"],
      ["goal", "成し遂げたいこと"], ["role", "職種"],
      ["strength", "自分の強み(根拠の経験)"], ["why", "なぜこの会社か"]].forEach(([key, label]) => {
      inputs[key] = this.field(section, label, motive[key] || "", "textarea");
      inputs[key].onchange = save;
    });
    this.button(section, "文章のたたき台を作る", () => {
      if (inputs.text.value && !confirm("今の本文を置き換えますか？")) return;
      inputs.text.value = this.motiveDraft(read(), company);
      updateMeter();
      save();
    });
    inputs.text = this.field(section, "本文", motive.text || "", "textarea");
    const updateMeter = this.meter(section, inputs.text, 0);
    inputs.text.onchange = () => { updateMeter(); save(); };
    this.button(section, "コピー", () => {
      if (this.confirmNoOtherCompany(inputs.text.value, company)) this.copy(inputs.text.value);
    });
  },
  aiPromptFor({ question, answerText = "", company = "", gakuchikaId = "" }) {
    const lines = [`【設問】${question.question}`,
      question.limit ? `【字数】${question.limit}字以内` : "【字数】指定なし"];
    if (company) lines.push(`【提出先】${company}`);
    const episode = this.data.gakuchika.find(item => item.id === gakuchikaId);
    if (episode) {
      lines.push(`【使うエピソード】${episode.title}`);
      [["conclusion", "結論"], ["situation", "状況"], ["problem", "課題"],
        ["action", "行動"], ["result", "結果"], ["learning", "学び"]].forEach(([key, label]) => {
        const value = (episode.structure || {})[key];
        if (value && value.trim()) lines.push(`${label}:${value}`);
      });
    }
    const motive = company && (this.data.companies || []).find(item => item.name === company)?.motive?.text;
    if (motive) lines.push(`【志望動機のメモ】${motive}`);
    if (answerText) lines.push(`【今の下書き】${answerText}`);
    lines.push(`この内容をもとに、${question.limit ? question.limit + "字以内で" : ""}回答案を作ってください。結論から書き、具体的な数字や行動を入れてください。`);
    return lines.join("\n");
  },
  breakdownFields: [
    ["what", "何を?"], ["why", "なぜ?"], ["how", "どのように?"],
    ["whenWhere", "いつ・どこで?"], ["who", "誰と・誰のために?"], ["result", "結果どうなった?"]
  ],
  splitQuestion(text) {
    return text.split(/(?<=[、。?？])|(?=また|その上で)/u).map(part => part.trim()).filter(Boolean);
  },
  editBreakdown(question) {
    this.modal("設問を分解", parent => {
      const existing = question.breakdown || [];
      const text = this.field(parent, "設問文（/で区切る）",
        (question.breakdown ? existing.map(item => item.part) : this.splitQuestion(question.question)).join("/"), "textarea");
      const notesByPart = new Map(existing.map(item => [item.part, item.notes]));
      let rows = [];
      const read = () => rows.map(row => ({ part: row.part,
        notes: Object.fromEntries(this.breakdownFields.map(([key]) => [key, row.inputs[key].value])) }));
      const divide = () => {
        read().forEach(item => notesByPart.set(item.part, item.notes));
        parts.replaceChildren();
        rows = text.value.split("/").map(part => part.trim()).filter(Boolean).map(part => {
          const card = this.el("div", null, parts, "breakdown-part");
          this.el("h4", part, card);
          const grid = this.el("div", null, card, "breakdown-inputs");
          const notes = notesByPart.get(part) || {};
          const inputs = Object.fromEntries(this.breakdownFields.map(([key, label]) =>
            [key, this.field(grid, label, notes[key] || "")]));
          return { part, inputs };
        });
      };
      this.button(parent, "分ける", divide);
      const parts = this.el("div", null, parent);
      divide();
      return read;
    }, breakdown => {
      question.breakdown = breakdown;
      question.updatedAt = this.now();
    });
  }
});
