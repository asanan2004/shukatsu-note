"use strict";
Object.assign(App, {
  allCompanyNames() {
    return [...new Set([
      ...this.data.deadlines.map(item => item.company),
      ...(this.data.mypages || []).map(item => item.company),
      ...(this.data.companies || []).map(item => item.name)
    ])].sort((a, b) => a.localeCompare(b, "ja"));
  },
  passRates(names) {
    const stages = ["ES", "Webテスト", "面接1", "面接2", "最終", "内定"];
    const reached = stages.map(() => 0);
    names.forEach(name => {
      const history = this.companyRecord(name)?.stageHistory || [];
      const furthest = Math.max(stages.indexOf(this.companyStage(name)),
        ...history.map(item => stages.indexOf(item.stage)));
      reached.forEach((count, index) => { if (index <= furthest) reached[index]++; });
    });
    return stages.map((stage, index) => ({ stage, reached: reached[index],
      rate: index === 0 || reached[index - 1] === 0 ? null
        : Math.round(reached[index] / reached[index - 1] * 100) }));
  },
  renderPipeline(root) {
    const head = this.el("div", null, root, "page-head");
    this.el("h2", "選考", head);
    const filter = this.pipelineFilter ||= { rank: "", industry: "", query: "" };
    const names = this.allCompanyNames();
    const toolbar = this.el("div", null, root, "toolbar");
    const rank = this.field(toolbar, "志望度", filter.rank, "", [
      { value: "", label: "すべて" }, { value: "unset", label: "未設定" }, ...this.ranks
    ]);
    const industries = [...new Set(names.map(name => this.companyRecord(name)?.industry || ""))].sort((a, b) => a.localeCompare(b, "ja"));
    const industry = this.field(toolbar, "業界", filter.industry, "", [
      { value: "", label: "すべて" },
      ...industries.map(value => ({ value: value || "unset", label: value || "業界未設定" }))
    ]);
    const query = this.field(toolbar, "企業名検索", filter.query, "search");
    const results = this.el("div", null, root);
    const renderResults = () => {
      results.replaceChildren();
      const visible = names.filter(name => {
        const record = this.companyRecord(name);
        return (!filter.rank || (record?.rank || "unset") === filter.rank)
          && (!filter.industry || (record?.industry || "unset") === filter.industry)
          && this.companyMatches(name, filter.query);
      });
      const totals = this.passRates(visible);
      const groups = new Map();
      visible.forEach(name => {
        const record = this.companyRecord(name);
        const key = record?.industry || "業界未設定";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(name);
      });
      const rates = this.isNarrow() ? this.foldSection(results, "pipeline-rates", "通過率", `応募 ${totals[0].reached}社`) : results;
      const funnel = this.el("div", null, rates, "funnel");
      if (!this.isNarrow()) this.el("h3", "通過率", funnel);
      const stageLabel = stage => stage === "面接1" ? "一次面接" : stage === "面接2" ? "二次面接" : stage;
      const percent = rate => rate === null ? "—" : rate + "%";
      if (totals[0].reached) {
        const cards = this.el("div", null, funnel, "pass-rates");
        totals.forEach((item, index) => {
          const step = this.el("div", null, cards, "pass-rate-step");
          if (index) this.el("span", "→", step, "pass-rate-arrow").setAttribute("aria-hidden", "true");
          const card = this.el("div", null, step, "pass-rate-card");
          this.el("span", stageLabel(item.stage), card);
          this.el("strong", item.reached + "社", card, "pass-rate-count");
          this.el("small", index === 0 ? "応募" : item.rate === null ? "—" : "通過 " + percent(item.rate), card, "pass-rate-percent");
        });
        this.el("p", "途中の段階を飛ばした企業は、通ったものとして数えています", funnel, "muted pass-rate-note");
        const details = this.el("details", null, funnel, "pass-rate-industries");
        this.el("summary", "業界別に見る", details);
        const table = this.el("table", null, details);
        const header = this.el("tr", null, this.el("thead", null, table));
        ["業界", ...totals.map(item => stageLabel(item.stage))].forEach(label => this.el("th", label, header).setAttribute("scope", "col"));
        const body = this.el("tbody", null, table);
        const row = (label, rates, parent) => {
          const tr = this.el("tr", null, parent);
          this.el("th", label, tr).setAttribute("scope", "row");
          rates.forEach((item, index) => {
            const cell = this.el("td", item.reached + "社", tr);
            if (index) {
              this.el("br", null, cell);
              this.el("small", percent(item.rate), cell, "pass-rate-percent");
            }
          });
        };
        [...groups.keys()].sort((a, b) => a.localeCompare(b, "ja")).forEach(key => row(key, this.passRates(groups.get(key)), body));
        row("合計", totals, this.el("tfoot", null, table));
      } else this.el("p", "まだ応募がありません。企業の選考ステージを ES 以降にすると数えます", funnel, "muted");
      this.renderReviewStats(results, visible);
      const frequent = this.frequentQuestions();
      if (frequent.length) {
        const details = this.el("details", null, results, "frequent-questions");
        details.open = this.frequentOpen || false;
        details.ontoggle = () => { this.frequentOpen = details.open; };
        this.el("summary", `よく聞かれた質問(${frequent.length}組)`, details);
        frequent.forEach(item => {
          const row = this.el("div", null, details, "frequent-question");
          this.el("span", item.text, row);
          this.el("small", ` ${item.count}回・${item.companies.length}社`, row, "muted");
          if (item.es) {
            const related = this.el("div", null, row, "frequent-question-es");
            this.el("small", "近いES: " + Array.from(item.es.question).slice(0, 40).join(""), related, "muted");
            this.button(related, "開く", () => {
              this.openQuestionId = item.es.id;
              this.esFilter = { genre: "", company: "", text: "" };
              location.hash = "#es";
              this.render();
            });
          }
        });
      }
      const board = this.el("div", null, results, "board");
      ["ES", "Webテスト", "面接1", "面接2", "最終", "未応募", "内定", "不合格・辞退"].forEach(label => {
        const companies = visible.filter(name => label === "不合格・辞退"
          ? ["不合格", "辞退"].includes(this.companyStage(name)) : this.companyStage(name) === label)
          .sort((a, b) => this.companyPinOrder(a, b));
        let col;
        if (this.isNarrow()) {
          const key = "board-" + label;
          this.foldOpen ||= {};
          if (!Object.prototype.hasOwnProperty.call(this.foldOpen, key)) this.foldOpen[key] = companies.length > 0;
          col = this.foldSection(board, key, label + "(" + companies.length + "件)");
          col.className += " board-col";
        } else {
          col = this.el("div", null, board, "board-col");
          this.el("h3", label + " (" + companies.length + "件)", col);
        }
        if (!companies.length) this.el("p", "なし", col, "muted");
        const list = this.el("div", null, col, "board-cards");
        companies.forEach(name => {
          const card = this.el("div", null, list, "card board-card");
          const heading = this.el("div", null, card, "board-card-head");
          this.companyAvatar(heading, name);
          this.companyLink(heading, name);
          const rank = this.companyRecord(name)?.rank;
          if (this.isNarrow() && rank) this.el("span", rank, heading, "label rank-" + rank);
          this.companyPinButton(heading, name);
          if (!this.isNarrow() && rank) this.el("span", rank, card, "label rank-" + rank);
          const secondary = this.isNarrow() ? this.el("div") : card;
          const documentsLeft = (this.companyRecord(name)?.documents || []).filter(item => item.done === false).length;
          if (!this.isNarrow() && documentsLeft) this.el("small", `書類 残り${documentsLeft}`, card);
          const next = ShukatsuShared.activeDeadlines(this.data.deadlines.filter(item => item.company === name))[0];
          if (next) {
            const remaining = this.remaining(next);
            const date = next.dueAt.slice(0, 10).split("-");
            const time = next.dueAt.length > 10 ? " " + next.dueAt.slice(11, 16) : "";
            this.el(this.isNarrow() ? "span" : "p", `次:${Number(date[1])}/${Number(date[2])}${time} ${next.kind}(${remaining.text})`, secondary, remaining.expired ? "danger" : "muted");
          }
          if (this.isNarrow() && documentsLeft) this.el("small", `書類 残り${documentsLeft}`, secondary);
          const detail = this.isNarrow() ? this.compactCard(card, { line1: [heading], line2: [secondary], key: "pipeline-" + name }) : card;
          if (this.companyRecord(name)?.intern) this.el("span", "インターン", detail, "label");
          const stage = this.el("select", null, detail);
          stage.setAttribute("aria-label", "選考ステージ");
          this.stages.forEach(value => { this.el("option", value, stage).value = value; });
          stage.value = this.companyStage(name);
          this.renderStageDetail(detail, this.companyRecord(name)?.stageDetail, stage.value,
            detail => { this.setCompanyStageDetail(name, detail); this.render(); });
          this.el("p", this.stageLabel(stage.value, this.companyRecord(name)?.stageDetail), detail, "muted stage-label");
          stage.onchange = () => {
            const advanced = this.stages.indexOf(stage.value) > this.stages.indexOf(this.companyStage(name))
              && !["不合格", "辞退"].includes(stage.value);
            this.setCompanyStage(name, stage.value);
            this.changed();
            this.render();
            if (advanced) this.offerPlanAfterPass(name);
          };
        });
      });
      if (!visible.length) this.el("p", "該当する企業はありません", results, "muted");
    };
    rank.onchange = () => { filter.rank = rank.value; renderResults(); };
    industry.onchange = () => { filter.industry = industry.value; renderResults(); };
    query.oninput = () => { filter.query = query.value; renderResults(); };
    renderResults();
  }
});
