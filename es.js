"use strict";
Object.assign(App, {
  esFilter: { genre: "", company: "", text: "" },
  genreSort: false,
  otherCompanyNames(text, company) {
    const normalize = value => String(value).normalize("NFKC").toLowerCase().replace(/\s/g, "");
    const names = typeof this.allCompanyNames === "function" ? this.allCompanyNames()
      : [...this.data.deadlines, ...(this.data.mypages || [])].map(item => item.company);
    const seen = new Set();
    return names.filter(name => {
      const normalized = normalize(name);
      if (Array.from(normalized).length <= 2 || normalized === normalize(company) || seen.has(normalized)) return false;
      seen.add(normalized);
      return this.companyMatches(text, name);
    });
  },
  confirmNoOtherCompany(text, company) {
    const names = this.otherCompanyNames(text, company);
    return !names.length || confirm(`他社名「${names.join("、")}」が入っています。このままコピーしますか？`);
  },
  answerWarnings(text, company = "") {
    const warnings = [];
    const sentences = text.replace(/[\r\n]/g, "").split("。");
    const ended = sentences.slice(0, -1).map(s => s.trim().replace(/[\s」』）)]+$/u, ""));
    if (text.includes("御社")) warnings.push("書き言葉では『貴社』が一般的です");
    if (ended.some(s => /(?:です|ます|でした|ました)$/.test(s)) && ended.some(s => /(?:だ|である|だった|であった)$/.test(s) || (/た$/.test(s) && !/(?:ました|でした)$/.test(s))))
      warnings.push("文末の『です・ます』と『だ・である』が混ざっています");
    const longest = Math.max(0, ...sentences.map(s => this.count(s)));
    if (longest > 80) warnings.push(`長い文があります(${longest}字)`);
    const tails = ended.map(s => Array.from(s).slice(-3).join(""));
    if (tails.some((tail, i) => tail && i >= 2 && tail === tails[i - 1] && tail === tails[i - 2])) warnings.push("同じ文末が続いています");
    if (/[!?]/.test(text) && /[！？]/.test(text)) warnings.push("感嘆符・疑問符の全角と半角が混ざっています");
    if (company.trim()) {
      const names = this.otherCompanyNames(text, company);
      if (names.length) warnings.push(`他社名「${names.join("、")}」が入っています`);
    }
    return warnings;
  },
  showAnswerWarnings(parent, text, company = "") {
    this.answerWarnings(text, company).forEach(warning => this.el("small", warning, parent, "answer-warning"));
  },
  answerReferences(parent, question, text, episode, update, company = { value: "" }) {
    const details = this.el("details", null, parent, "answer-references");
    this.el("summary", "参考にする", details);
    const list = this.el("div", null, details);
    const refresh = () => {
      list.replaceChildren();
      if (question.breakdown) {
        this.el("h4", "設問の分解", list);
        question.breakdown.forEach(item => {
          const notes = this.breakdownFields.filter(([key]) => item.notes[key].trim())
            .map(([key, label]) => label.replace("?", "") + ":" + item.notes[key]);
          this.el("p", [item.part, ...notes].join("\n"), list, "pre");
        });
      }
      const add = (label, value) => {
        const row = this.el("article", null, list, "card");
        this.el("small", label + " · " + this.count(value) + "字 · " + Array.from(value).slice(0, 60).join(""), row);
        this.button(row, "本文に入れる", () => {
          if (!this.confirmNoOtherCompany(value, company.value)) return;
          if (text.value && !confirm("今の本文の後ろに追加しますか?")) return;
          text.value = text.value ? text.value + "\n" + value : value;
          update();
        });
      };
      this.el("h4", "似た設問の回答", list);
      const similarAnswers = this.similarQuestions(question.question, question.id)
        .filter(({ question: candidate }) => candidate.id !== question.id)
        .flatMap(({ question: candidate }) => candidate.answers.map(a => ({ a, question: candidate })))
        .sort((a, b) => question.limit >= 1
          ? Math.abs(this.count(a.a.text) - question.limit) - Math.abs(this.count(b.a.text) - question.limit)
          : (b.a.date || b.question.updatedAt || "").localeCompare(a.a.date || a.question.updatedAt || ""))
        .slice(0, 5);
      if (!similarAnswers.length) this.el("p", "ありません", list, "muted");
      similarAnswers.forEach(({ a, question: candidate }) =>
        add(Array.from(candidate.question).slice(0, 20).join("") + "・" + (a.company || "企業未指定"), a.text));
      const similarAnswerIds = new Set(similarAnswers.map(({ a }) => a.id));
      this.el("h4", "同じジャンルのほかの回答", list);
      const answers = this.data.esQuestions.filter(q => q !== question && q.genre === question.genre)
        .flatMap(q => q.answers.map(a => ({ a, updated: q.updatedAt || "" })))
        .filter(({ a }) => !similarAnswerIds.has(a.id))
        .sort((a, b) => (b.a.date || b.updated).localeCompare(a.a.date || a.updated)).slice(0, 5);
      if (!answers.length) this.el("p", "ありません", list, "muted");
      answers.forEach(({ a }) => add(a.company || "企業未指定", a.text));
      this.el("h4", "ガクチカの字数別の版", list);
      const related = this.data.gakuchika.find(g => g.id === episode.value);
      if (!related) this.el("p", "関連するガクチカを選ぶと出ます", list, "muted");
      else if (!(related.versions || []).length) this.el("p", "版がありません", list, "muted");
      if (related) [...(related.versions || [])].sort((a, b) => Math.abs(a.chars - question.limit) - Math.abs(b.chars - question.limit))
        .forEach(v => add(related.title + " " + v.chars + "字版", v.text));
    };
    episode.onchange = refresh;
    refresh();
  },
  allGenres() {
    return [...new Set([...this.genres, ...(this.data.genres || []), ...this.data.esQuestions.map(q => q.genre)])];
  },
  editQuestion(item) {
    this.modal(item ? "設問を編集" : "設問を追加", parent => {
      const genre = this.field(parent, "ジャンル", item ? item.genre : this.genres[0], "", this.allGenres());
      const question = this.field(parent, "設問文", item ? item.question : "", "textarea");
      question.required = true;
      const similar = this.el("div", null, parent, "similar-questions");
      let similarTimer;
      question.addEventListener("input", () => {
        clearTimeout(similarTimer);
        similarTimer = setTimeout(() => {
          similar.replaceChildren();
          const matches = this.similarQuestions(question.value, item?.id);
          if (!matches.length) return;
          this.el("h4", "似た設問", similar);
          matches.forEach(({ question: candidate }) => {
            const row = this.el("div", null, similar);
            this.el("span", candidate.question, row);
            this.el("small", `回答${candidate.answers.length}件`, row);
            this.button(row, "開く", () => {
              document.getElementById("editor").close();
              this.openQuestionId = candidate.id;
              this.esFilter = { genre: "", company: "", text: "" };
              location.hash = "#es";
              this.render();
            });
          });
        }, 500);
      });
      const limit = this.field(parent, "字数制限（なしは0）", item ? item.limit : 400, "number");
      limit.min = "0";
      limit.required = true;
      const requirements = this.field(parent, "提出条件のメモ(字数・形式・ファイル名ルール・動画の長さなど)", item ? item.requirements || "" : "", "textarea");
      return () => ({ genre: genre.value, question: question.value, limit: Number(limit.value), requirements: requirements.value });
    }, values => {
      if (item) Object.assign(item, values, { updatedAt: this.now() });
      else this.data.esQuestions.push(Object.assign(values, { id: this.id(), answers: [],
        createdAt: this.now(), updatedAt: this.now() }));
    });
  },
  editAnswer(question, answer) {
    this.modal("回答を編集", parent => {
      const text = this.field(parent, "回答", answer ? answer.text : "", "textarea");
      text.required = true;
      const meter = this.meter(parent, text, question.limit);
      const warnings = this.el("div", null, parent, "answer-warnings");
      const company = this.esCompanyField(parent, answer ? answer.company : this.esInitialCompany());
      let limitCheck;
      if (question.requirements) {
        const checks = this.el("div", null, parent, "submit-check");
        this.el("h4", "提出前チェック", checks);
        question.requirements.split(/\r\n|\r|\n/).filter(line => line.trim()).forEach(line => {
          this.field(checks, line, false, "checkbox");
        });
        if (question.limit >= 1) limitCheck = this.el("p", null, checks);
      }
      const update = () => {
        meter(); warnings.replaceChildren(); this.showAnswerWarnings(warnings, text.value, company.value);
        if (limitCheck) limitCheck.textContent = `字数が${question.limit}字以内 ${this.count(text.value) <= question.limit ? "✓" : "✗"}`;
      };
      text.addEventListener("input", update);
      company.addEventListener("input", update);
      company.onchange = update;
      update();
      const date = this.esDateField(parent, answer ? answer.date : this.esLocalDate());
      const note = this.field(parent, "メモ", answer ? answer.note : "", "textarea");
      const episode = this.field(parent, "関連するガクチカ", answer ? answer.gakuchikaId : "", "",
        [{ label: "なし", value: "" }, ...this.data.gakuchika.map(g => ({ label: g.title, value: g.id }))]);
      this.button(parent, "AIに渡す文をコピー", () => this.copy(this.aiPromptFor({
        question, answerText: text.value, company: company.value, gakuchikaId: episode.value
      })));
      this.answerReferences(parent, question, text, episode, update, company);
      return () => ({ text: text.value, company: company.value, date: date.value,
        note: note.value, gakuchikaId: episode.value });
    }, values => {
      if (answer) { this.updateAnswerText(answer, values.text); Object.assign(answer, values); }
      else question.answers.push(Object.assign(values, { id: this.id() }));
      question.updatedAt = this.now();
    });
  },
  updateAnswerText(answer, text) {
    if (answer.text === text) return;
    answer.history = [{ text: answer.text, savedAt: this.now() }, ...(answer.history || [])].slice(0, 5); answer.text = text;
  },
  formatHistoryDate(savedAt) {
    const date = new Date(savedAt);
    if (Number.isNaN(date.getTime())) return savedAt;
    const pad = value => String(value).padStart(2, "0");
    return String(date.getFullYear()).padStart(4, "0") + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
      + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  },
  restoreAnswer(question, answer, text) {
    if (!confirm("この版に戻しますか？今の本文は履歴に残します。")) return;
    this.updateAnswerText(answer, text); question.updatedAt = this.now(); this.changed(); this.render();
  },
  parseQA(text) {
    const pairs = [];
    const warnings = [];
    let current = null;
    let mode = "";
    const finish = () => {
      if (!current) return;
      if (!current.question.trim() || !current.answer.trim()) {
        warnings.push(`${current.line}行目：設問または回答が空です。`);
      } else {
        const match = current.question.match(/[（(](\d+)字[）)]\s*$/);
        pairs.push({ question: current.question.replace(/[（(]\d+字[）)]\s*$/, "").trim(),
          limit: match ? Number(match[1]) : 0, text: current.answer.trim() });
      }
    };
    text.split(/\r\n|\r|\n/).forEach((line, index) => {
      const q = line.match(/^\s*Q[:：]\s?(.*)$/);
      const a = line.match(/^\s*A[:：]\s?(.*)$/);
      if (q) {
        finish();
        current = { question: q[1], answer: "", line: index + 1 };
        mode = "q";
      } else if (a) {
        if (!current || mode !== "q") warnings.push(`${index + 1}行目：対応するQがないAです。`);
        else { current.answer = a[1]; mode = "a"; }
      } else if (line.trim()) {
        if (/^\s*[QA](?:\s|[：:])/.test(line)) {
          warnings.push(`${index + 1}行目：Q: / A: の書式を確認してください。`);
        } else if (current && mode === "a") current.answer += "\n" + line;
        else if (current && mode === "q") current.question += "\n" + line;
        else warnings.push(`${index + 1}行目：Q: またはA:として解釈できません。`);
      } else if (current && mode === "a") current.answer += "\n";
    });
    finish();
    if (!pairs.length && !warnings.length) warnings.push("Q: / A: の組を入力してください。");
    return { pairs, warnings };
  },
  esLocalDate(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  },
  esDateField(parent, value) {
    const row = this.el("div", null, parent, "es-field-actions");
    const field = this.field(row, "日付", value, "date");
    [["今日", 0], ["昨日", -1], ["消す", null]].forEach(([label, offset]) => {
      this.button(row, label, () => { field.value = offset === null ? "" : this.esLocalDate(offset); });
    });
    return field;
  },
  esInitialCompany() {
    const match = location.hash.match(/^#company\/([^/?#]+)/);
    if (match) {
      try { return decodeURIComponent(match[1]); } catch { return ""; }
    }
    return this.panelCompany || "";
  },
  esCompanyField(parent, value) {
    const row = this.el("div", null, parent, "es-field-actions");
    const field = this.field(row, "提出先企業", value);
    this.esCompanySequence = (this.esCompanySequence || 0) + 1;
    const list = this.el("datalist", null, row);
    list.id = "es-company-" + this.esCompanySequence;
    field.setAttribute("list", list.id);
    const names = [...new Set([
      ...(this.data.companies || []).map(item => item.name),
      ...(this.data.mypages || []).map(item => item.company),
      ...(this.data.deadlines || []).map(item => item.company)
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
    names.forEach(name => { this.el("option", null, list).value = name; });
    if (typeof chrome !== "undefined" && chrome.tabs) {
      this.button(row, "表示中のページの企業", async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const companies = [...new Set(ShukatsuShared.matchMypages(tab?.url || "", this.data.mypages || []).map(item => item.company).filter(Boolean))];
          const name = companies.length === 1 ? companies[0] : ShukatsuShared.guessCompanyName(tab?.title || "", tab?.url || "", this.data);
          if (name) {
            field.value = name;
            if (field.onchange) field.onchange();
          } else this.message("表示中のページから企業名を読み取れませんでした");
        } catch { this.message("表示中のページから企業名を読み取れませんでした"); }
      });
    }
    return field;
  },
  parseFreeES(text) {
    const pairs = [], skipped = [], warnings = [];
    const hint = /[\[［(（]?\s*\d+\s*(?:[～〜~－–-]\s*\d+\s*)?(?:文字|字)\s*(?:目安|以内|以下|程度)?\s*[\]］)）]?/g;
    const read = line => {
      const hints = line.match(hint) || [];
      const clean = line.replace(hint, "").trim();
      const short = line.trim().length <= 200;
      const asking = short && /(?:[?？]|(?:ください|下さい|教えて|述べよ|お書き|記入)[。．.]?|か。?)$/.test(clean);
      return { blank: !line.trim(), hint: short && hints.length > 0, asking,
        marked: short && /^\s*(?:[◆◇■□●○【]|Q\d+|問\d+|設問|\d+[.)]|[（(]\d+[）)])/.test(line),
        question: clean.replace(/^(?:[◆◇■□●○]|【[^】]*】|Q\d+[:：.)]?|問\d+[:：.)]?|設問\s*\d*[:：.)]?|\d+[.)]|[（(]\d+[）)])\s*/, "").trim(),
        limit: hints.length ? Math.max(...hints.flatMap(value => value.match(/\d+/g).map(Number))) : 0 };
    };
    const lines = text.split(/\r\n|\r|\n/).flatMap(line => {
      const tab = line.indexOf("\t");
      if (tab >= 0) {
        const left = line.slice(0, tab).trim(), part = read(left);
        if (part.hint || part.asking) {
          const right = line.slice(tab + 1).replace(/\t/g, " ").trim();
          return right ? [left, right] : [left];
        }
      } else {
        for (const match of line.matchAll(hint)) {
          const end = match.index + match[0].length;
          if (!/[\]］)）]$/.test(match[0]) || line.slice(0, end).trim().length > 200) continue;
          const rest = line.slice(end);
          if (/^\s+/.test(rest) && rest.trim().length >= 20) return [line.slice(0, end).trim(), rest.trim()];
        }
      }
      return [line];
    }), parts = lines.map(read), questions = [];
    const hintMode = parts.some(part => part.hint);
    parts.forEach((part, index) => {
      if (hintMode) {
        if (!part.hint) return;
        let start = index;
        const previousEnd = questions.length ? questions[questions.length - 1].end : -1;
        for (let i = index - 1; !part.marked && i >= Math.max(index - 3, previousEnd + 1); i--) {
          if (parts[i].blank) break;
          if (parts[i].marked || parts[i].asking) start = i;
          if (parts[i].marked) break;
        }
        questions.push({ start, end: index });
      } else if (part.marked && part.asking) {
        const previous = questions[questions.length - 1];
        if (previous && index <= previous.end) return;
        let end = index;
        while (end < index + 2 && parts[end + 1]?.asking && !parts[end + 1].blank && !parts[end + 1].marked) end++;
        questions.push({ start: index, end });
      }
    });
    skipped.push(...lines.slice(0, questions.length ? questions[0].start : lines.length));
    questions.forEach(({ start, end }, index) => {
      pairs.push({ question: parts.slice(start, end + 1).map(part => part.question).filter(Boolean).join("\n"),
        limit: Math.max(...parts.slice(start, end + 1).map(part => part.limit)),
        text: lines.slice(end + 1, questions[index + 1]?.start ?? lines.length).join("\n").trim() });
    });
    return { pairs, warnings, skipped };
  },
  guessGenre(question) {
    const rules = [[/短所|弱み/, "長所・短所"], [/志望|動機|入社して|当社|弊社|貴社|なぜ/, "志望動機"],
      [/学生時代|力を入れ|打ち込|取り組んだ/, "ガクチカ"], [/強み|自己PR|アピール|長所/, "自己PR"],
      [/挫折|失敗|困難|苦労/, "挫折経験"], [/研究|ゼミ|卒業論文|専攻/, "研究・ゼミ"],
      [/将来|キャリア|夢|目標|年後/, "将来像"]];
    const rule = rules.find(([pattern]) => pattern.test(question));
    return rule && this.allGenres().includes(rule[1]) ? rule[1] : "その他";
  },
  reviewGenres() {
    this.modal("ジャンルを見直す", parent => {
      const rows = this.data.esQuestions.map(item => ({item, genre:this.guessGenre(item.question)}))
        .filter(row => row.genre !== "その他" && row.genre !== row.item.genre);
      if (!rows.length) this.el("p", "見直す設問はありません", parent);
      rows.forEach(row => {
        const line = this.el("div", null, parent);
        row.check = this.field(line, "変更する", "", "checkbox");
        row.check.checked = true;
        const question = this.el("p", row.item.question, line);
        question.style.whiteSpace = "nowrap";
        question.style.overflow = "hidden";
        question.style.textOverflow = "ellipsis";
        question.title = row.item.question;
        row.select = this.field(line, `${row.item.genre} →`, row.genre, "", this.allGenres());
      });
      return () => rows.filter(row => row.check.checked);
    }, rows => {
      const originals = rows.map(row => ({item:row.item, genre:row.item.genre, updatedAt:row.item.updatedAt}));
      rows.forEach(row => { row.item.genre = row.select.value; row.item.updatedAt = this.now(); });
      const message = `${rows.length}件のジャンルを変えました`;
      this.message(message);
      this.clearUndoToast();
      if (rows.length) {
        const toast = this.el("div", null, document.body, "undo-toast");
        toast.setAttribute("role", "status");
        this.el("span", message, toast);
        this.button(toast, "元に戻す", () => {
          originals.forEach(({item, genre, updatedAt}) => { item.genre = genre; item.updatedAt = updatedAt; });
          this.clearUndoToast();
          this.changed();
          this.render();
        });
        this.undoToast = toast;
        this.undoTimer = setTimeout(() => this.clearUndoToast(), 10000);
      }
    });
  },
  matchingESQuestion(question) {
    const normalize = value => value.replace(/[\s\p{P}\p{S}]/gu, "");
    return this.data.esQuestions.find(item => normalize(item.question) === normalize(question));
  },
  pasteQuestions(initial) {
    this.modal("設問と回答の貼り付け登録", parent => {
      this.el("p", "設問と回答をそのまま貼り付けてください(Q:/A: の形でも読めます)", parent);
      const text = this.field(parent, "貼り付け本文", initial?.text ?? "", "textarea");
      const genre = this.field(parent, "すべてを同じジャンルにする", "", "", [{ label: "自動(組ごと)", value: "" }, ...this.allGenres()]);
      const company = this.esCompanyField(parent, initial?.company ?? this.esInitialCompany());
      const date = this.esDateField(parent, this.esLocalDate());
      const preview = this.el("div", null, parent);
      let parsed = null;
      let previewText = null;
      const submit = document.querySelector('#edit-form button[type="submit"]');
      submit.disabled = true;
      const update = () => {
        parsed = /^\s*[QA][:：]/m.test(text.value) ? this.parseQA(text.value) : this.parseFreeES(text.value);
        previewText = text.value;
        preview.replaceChildren();
        this.el("h3", `プレビュー：${parsed.pairs.length}組`, preview);
        parsed.warnings.forEach(warning => this.el("p", warning, preview, "danger"));
        if (parsed.skipped && parsed.skipped.length) {
          const details = this.el("details", null, preview);
          this.el("summary", `読み飛ばした行:${parsed.skipped.length}行`, details);
          this.el("p", parsed.skipped.join("\n"), details, "pre");
        }
        parsed.pairs.forEach(pair => {
          const row = this.el("div", null, preview, "es-paste-pair");
          pair.genre = genre.value || this.guessGenre(pair.question);
          pair.genreField = this.field(row, "ジャンル", pair.genre, "", this.allGenres());
          this.el("p", pair.question, row, "pre");
          this.el("p", `上限: ${pair.limit || "制限なし"} / 回答: ${this.count(pair.text)}字`, row,
            pair.limit && this.count(pair.text) > pair.limit ? "danger" : "muted");
          this.el("p", pair.text ? Array.from(pair.text).slice(0, 80).join("") : "回答なし(登録しない)", row, "pre");
          if (this.matchingESQuestion(pair.question)) this.el("p", "既存の設問に追加", row, "muted");
          else {
            const similar = this.similarQuestions(pair.question)[0];
            if (similar) this.el("p", `似た設問あり:${Array.from(similar.question.question).slice(0, 30).join("")}(回答${similar.question.answers.length}件)`, row, "muted");
          }
        });
        submit.disabled = !parsed.pairs.some(pair => pair.text.trim()) || parsed.warnings.length > 0;
      };
      genre.onchange = () => {
        if (parsed) parsed.pairs.forEach(pair => { pair.genreField.value = genre.value || this.guessGenre(pair.question); });
      };
      text.oninput = () => { submit.disabled = true; };
      this.button(parent, "プレビューを更新", update);
      if (initial) update();
      return () => ({ parsed, previewText, text: text.value, genre: genre.value, company: company.value, date: date.value });
    }, values => {
      if (!values.parsed || values.previewText !== values.text || values.parsed.warnings.length) return;
      values.parsed.pairs.forEach(pair => {
        if (!pair.text.trim()) return;
        const answer = { id: this.id(), text: pair.text, company: values.company, date: values.date, note: "", gakuchikaId: "" };
        const existing = this.matchingESQuestion(pair.question);
        if (existing) { existing.answers.push(answer); existing.updatedAt = this.now(); }
        else this.data.esQuestions.push({ id: this.id(), genre: pair.genreField.value, question: pair.question, limit: pair.limit,
          answers: [answer], createdAt: this.now(), updatedAt: this.now() });
      });
      this.message(`${values.parsed.pairs.filter(pair => pair.text.trim()).length}組を登録しました。`);
    });
  },
  renderES(root) {
    const head = this.el("div", null, root, "page-head");
    this.el("h2", "ES設問バンク", head);
    this.button(head, "＋ 設問を追加", () => this.editQuestion());
    const disclosure = (label, key) => {
      if (!this.isNarrow()) return this.el("div", null, root, "toolbar");
      const box = this.el("details", null, root, "es-disclosure");
      box.open = !!this[key];
      this.el("summary", label, box);
      box.addEventListener("toggle", () => { this[key] = box.open; });
      return this.el("div", null, box, "toolbar");
    };
    const tools = disclosure("操作", "esToolsOpen");
    this.button(tools, "貼り付け登録", () => this.pasteQuestions());
    this.button(tools, "ジャンルを見直す", () => this.reviewGenres());
    this.button(tools, "ジャンルを追加", () => {
      this.modal("ジャンルを追加", parent => {
        const name = this.field(parent, "ジャンル名", "");
        name.required = true;
        return () => name.value.trim();
      }, value => {
        if (value && !this.allGenres().includes(value)) {
          if (!this.data.genres) this.data.genres = [];
          this.data.genres.push(value);
        }
      });
    });
    this.button(tools, this.genreSort ? "ジャンルを初期順に" : "ジャンルを設問数の多い順に", () => {
      this.genreSort = !this.genreSort;
      this.render();
    });
    const filterCount = Object.values(this.esFilter).filter(Boolean).length;
    const filters = disclosure("絞り込み" + (filterCount ? `(${filterCount})` : ""), "esFilterOpen");
    [["ジャンル", "genre", [{ label: "すべて", value: "" }, ...this.allGenres()]],
      ["企業名検索", "company", null], ["全文検索（設問・回答）", "text", null]].forEach(([label, key, options]) => {
      const field = this.field(filters, label, this.esFilter[key], "text", options);
      field.onchange = () => { this.esFilter[key] = field.value; this.render(); };
    });
    const f = this.esFilter;
    const items = this.data.esQuestions.filter(q => (!f.genre || q.genre === f.genre)
      && (!f.company || q.answers.some(a => this.companyMatches(a.company, f.company)))
      && (q.question + "\n" + q.answers.map(a => a.text).join("\n")).includes(f.text));
    let genres = this.allGenres();
    if (this.genreSort) genres = genres.sort((a, b) =>
      this.data.esQuestions.filter(q => q.genre === b).length - this.data.esQuestions.filter(q => q.genre === a).length);
    if (!items.length) this.el("p", "該当する設問はありません。", root, "muted");
    genres.forEach(genre => {
      const group = items.filter(q => q.genre === genre);
      if (!group.length) return;
      this.el("h3", `${genre}（${group.length}設問）`, root);
      group.forEach(q => {
        const card = this.el("details", null, root, "card");
        if (q.id === this.openQuestionId) card.open = true;
        this.el("summary", `${q.question} · 回答${q.answers.length}件 · ${q.limit ? q.limit + "字" : "制限なし"}`, card);
        if (q.requirements) this.el("small", q.requirements, card, "requirements");
        const actions = this.el("div", null, card, "actions");
        this.button(actions, "設問を編集", () => this.editQuestion(q));
        this.button(actions, "設問を削除", () => this.remove(this.data.esQuestions, q));
        this.button(actions, "＋ 回答を追加", () => this.editAnswer(q));
        this.button(actions, "設問を分解", () => this.editBreakdown(q));
        this.button(actions, "AIに渡す文をコピー", () => this.copy(this.aiPromptFor({ question: q })));
        q.answers.forEach(answer => {
          const box = this.el("article", null, card, "card");
          const meta = this.el("div", null, box, "deadline-meta");
          if (answer.company) this.companyLink(meta, answer.company);
          else this.el("span", "企業未指定", meta);
          this.el("span", answer.date || "日付未指定", meta);
          const input = { value: answer.text, addEventListener() {} };
          this.meter(meta, input, q.limit);

          if (answer.submitted) {
            const date = new Date(answer.submitted.at);
            this.el("span", `提出版 ${date.getMonth() + 1}/${date.getDate()}`, meta, "label");
            if (answer.text !== answer.submitted.text) this.el("span", "提出版との違いあり", meta, "label");
          }
          const answerActions = this.el("div", null, meta, "deadline-actions");
          if (answer.submitted && this.showAnswerDiff) this.button(answerActions, "提出版との差分", () => this.modal("提出版と最新原稿", parent => { this.showAnswerDiff(parent, answer); return () => null; }, () => {}));
          this.button(answerActions, "提出版として固定", () => {
            if (answer.submitted && !confirm("提出版を今の本文で置き換えますか？")) return;
            answer.submitted = { text: answer.text, at: this.now() };
            this.changed();
            this.render();
          });
          if (answer.submitted && answer.text !== answer.submitted.text) {
            this.button(answerActions, "提出版を見る", () => {
              this.modal("提出版", parent => {
                this.el("p", answer.submitted.text, parent, "pre");
                return () => null;
              }, () => false);
              const submit = document.querySelector('#edit-form button[type="submit"]');
              submit.disabled = true;
            });
          }
          this.button(answerActions, "編集", () => this.editAnswer(q, answer));
          this.button(answerActions, "コピー", () => {
            if (this.confirmNoOtherCompany(answer.text, answer.company)) this.copy(answer.text);
          });
          this.button(answerActions, "削除", () => this.remove(q.answers, answer));
          this.el("p", answer.text, box, "pre");
          this.showAnswerWarnings(box, answer.text, answer.company);
          if (answer.note) this.el("p", answer.note, box, "pre muted");
          const episode = this.data.gakuchika.find(g => g.id === answer.gakuchikaId);
          if (answer.gakuchikaId) this.el("p", "関連ガクチカ：" + (episode ? episode.title : "削除済み"), box);
          const history = this.el("details", null, box);
          this.el("summary", "履歴(" + (answer.history || []).length + "件)", history);
          (answer.history || []).forEach(version => {
            const entry = this.el("article", null, history, "card");
            this.el("small", this.formatHistoryDate(version.savedAt) + " · " + this.count(version.text) + "字（改行を除く）", entry);
            this.el("p", version.text, entry, "pre");
            this.button(entry, "この版に戻す", () => this.restoreAnswer(q, answer, version.text));
          });
        });
      });
    });
    this.openQuestionId = "";
    this.renderReverseBank(root);
  }
});
