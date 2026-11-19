"use strict";
Object.assign(App, {
  industries: ["メーカー", "IT/通信", "金融", "商社", "コンサル", "インフラ/エネルギー", "広告/メディア", "小売/サービス", "不動産/建設", "官公庁/団体", "その他"],
  researchItems(industry) {
    const common = ["事業内容・主力商品やサービス", "主な顧客", "売上と利益の規模・推移", "業界での立ち位置と競合", "強み・他社との違い", "中期経営計画・今後の方針", "求める人物像", "職種と配属・キャリアの流れ", "選考の流れ・過去の設問", "働き方(勤務地・転勤・研修)", "社員・説明会で聞いた話", "気になった点・逆質問の候補"];
    const extra = {
      "メーカー": ["技術・研究開発", "生産拠点・海外売上比率"],
      "IT/通信": ["主なシステム・技術", "受託か自社サービスか"],
      "金融": ["収益の柱", "規制や金利の影響"],
      "商社": ["投資先・事業領域", "トレーディングと事業投資の比率"],
      "コンサル": ["得意領域・案件の例", "育成の仕組み"],
      "インフラ/エネルギー": ["供給エリア・主要設備", "安定供給と脱炭素への取り組み"],
      "広告/メディア": ["扱う媒体・制作事例", "広告主と収益の仕組み"],
      "小売/サービス": ["店舗・サービスの展開地域", "接客と顧客満足への取り組み"],
      "不動産/建設": ["開発・施工の実績", "事業エリアと安全管理"],
      "官公庁/団体": ["政策・活動の目的", "住民・会員への支援内容"],
      "その他": ["事業の仕組みと収益源", "事業特有の課題と取り組み"]
    };
    return common.concat(Object.hasOwn(extra, industry) ? extra[industry] : []);
  },
  renderResearch(parent, company) {
    const section = this.el("section", null, parent);
    this.el("h3", "企業研究", section);
    const record = this.companyRecord(company);
    const industry = this.field(section, "業界", record?.industry || "", "text", [{ value: "", label: "業界を選ぶ" }, ...this.industries]);
    industry.className = "research-industry";
    const labels = [...new Set([...this.researchItems(record?.industry || ""), ...(record?.research || []).map(item => item.label)])];
    const count = this.el("p", "", section);
    const updateCount = () => {
      const research = this.companyRecord(company)?.research || [];
      count.textContent = `埋まった項目 ${labels.filter(label => research.some(item => item.label === label && item.text.trim())).length}/${labels.length}`;
    };
    updateCount();
    this.button(section, "全部をAIに頼む文をコピー", () => this.copy(`${company}について、就活の企業研究として次の項目を、出典つきで簡潔にまとめてください。\n` + labels.map(label => `- ${label}`).join("\n")));
    industry.addEventListener("change", () => {
      const target = this.companyRecord(company, true);
      target.industry = industry.value;
      this.researchItems(industry.value).forEach(label => {
        if (!target.research.some(item => item.label === label)) target.research.push({ label, text: "" });
      });
      target.updatedAt = this.now();
      this.changed();
      this.render();
    });
    const grid = this.el("div", null, section, "research-grid");
    labels.forEach(label => {
      const card = this.el("div", null, grid, "research-item");
      this.el("h4", label, card);
      const text = this.el("textarea", null, card);
      text.rows = 2;
      text.setAttribute("aria-label", label);
      text.value = record?.research.find(item => item.label === label)?.text || "";
      text.addEventListener("change", () => {
        const target = this.companyRecord(company, true);
        let item = target.research.find(entry => entry.label === label);
        if (!item) { item = { label, text: "" }; target.research.push(item); }
        item.text = text.value;
        target.updatedAt = this.now();
        this.changed();
        updateCount();
      });
      const actions = this.el("div", null, card, "actions");
      const search = this.el("a", "検索", actions, "button-link");
      search.href = "https://www.google.com/search?q=" + encodeURIComponent(company + " " + label);
      search.target = "_blank";
      search.rel = "noopener noreferrer";
      this.button(actions, "AIに頼む文をコピー", () => this.copy(`${company}について、就活の企業研究として『${label}』を、出典つきで簡潔にまとめてください。`));
    });
  }
});
