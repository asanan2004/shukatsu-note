"use strict";
Object.assign(App, {
  revision: 0,
  savedRevision: -1,
  saving: false,
  loaded: false,
  timer: null,
  state(text) { document.getElementById("save-state").textContent = text; },
  changed() {
    this.revision++;
    this.state("未保存");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 500);
  },
  validPreparation(plan) {
    if (!plan || typeof plan.id !== "string" || !plan.id || typeof plan.title !== "string" || !plan.title.trim()
      || typeof plan.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date)
      || !Number.isInteger(plan.minutes) || plan.minutes < 1 || plan.minutes > 1440) return false;
    const date = new Date(plan.date + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === plan.date;
  },
  validPlan(plan) {
    if (!plan || !["id", "company", "kind", "title", "start", "end", "time", "status", "note", "createdAt", "updatedAt"]
      .every(key => typeof plan[key] === "string") || !plan.id || !plan.title.trim()
      || !["インターン", "面接", "説明会", "選考会", "その他"].includes(plan.kind)
      || !["確定", "通過したら"].includes(plan.status)
      || (plan.checklist !== undefined && (!Array.isArray(plan.checklist) || plan.checklist.length > 20
        || plan.checklist.some(entry => !entry || typeof entry !== "object" || Array.isArray(entry)
          || typeof entry.label !== "string" || !entry.label.trim() || entry.label.length > 100
          || typeof entry.done !== "boolean")))
      || (plan.time !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.time))) return false;
    const validDate = value => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(value + "T00:00:00Z");
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    if (!validDate(plan.start) || (plan.end !== "" && (!validDate(plan.end) || plan.end < plan.start))) return false;
    if (plan.options !== undefined) {
      if (plan.dates !== undefined || plan.status !== "通過したら"
        || !Array.isArray(plan.options) || plan.options.length < 1 || plan.options.length > 10
        || plan.options.some(option => !option || typeof option !== "object" || Array.isArray(option)
          || !validDate(option.start) || (option.end !== "" && (!validDate(option.end) || option.end < option.start)))
        || plan.start !== plan.options[0].start || plan.end !== plan.options[0].end) return false;
    }
    if (plan.dates !== undefined && (!Array.isArray(plan.dates) || plan.dates.length < 2 || plan.dates.length > 31
      || plan.dates.some((date, index) => !validDate(date) || (index > 0 && date <= plan.dates[index - 1]))
      || plan.start !== plan.dates[0] || plan.end !== plan.dates[plan.dates.length - 1])) return false;
    return true;
  },
  validate(data) {
    if (data && data.plans !== undefined && (!Array.isArray(data.plans)
      || data.plans.some(plan => !this.validPlan(plan))
      || new Set(data.plans.map(plan => plan.id)).size !== data.plans.length)) {
      throw new Error("予定の形式が不正です。");
    }
    if (!data || data.version !== 1) throw new Error("未知のversionです。読み込みませんでした。");
    if (data.preparation !== undefined && (!Array.isArray(data.preparation)
      || data.preparation.some(plan => !this.validPreparation(plan))
      || new Set(data.preparation.map(plan => plan.id)).size !== data.preparation.length)) {
      throw new Error("準備予定の形式が不正です。");
    }
    ["deadlines", "gakuchika", "esQuestions"].forEach(key => {
      if (!Array.isArray(data[key])) throw new Error(key + "が配列ではありません。");
    });
    const strings = (item, keys) => keys.every(key => typeof item[key] === "string");
    if (data.weeks !== undefined && (!Array.isArray(data.weeks) || data.weeks.some(item =>
      !item || !strings(item, ["week", "review"]) || !/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(item.week)
      || !Array.isArray(item.goals) || item.goals.some(goal => !goal || typeof goal.text !== "string"
        || !Number.isFinite(goal.target) || goal.target < 0 || !Number.isFinite(goal.done) || goal.done < 0)))) {
      throw new Error("週次の目標の形式が不正です。");
    }
    if (data.trash !== undefined && (!Array.isArray(data.trash) || data.trash.some(entry =>
      !entry || !strings(entry, ["id", "type", "deletedAt"])
      || !entry.item || typeof entry.item !== "object" || Array.isArray(entry.item)
      || !(entry.parentId === null || typeof entry.parentId === "string")
      || !Number.isFinite(entry.index)))) throw new Error("ゴミ箱の形式が不正です。");
    if (data.reverseQuestions !== undefined && (!Array.isArray(data.reverseQuestions)
      || data.reverseQuestions.some(item => !item
        || !strings(item, ["id", "text", "company", "stage", "createdAt"])
        || typeof item.used !== "boolean"))) {
      throw new Error("逆質問の形式が不正です。");
    }
    const validDate = value => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value)
      && Number.isFinite(new Date(value).getTime());
    if (data.availability !== undefined && (!Array.isArray(data.availability)
      || data.availability.some(item => !item || !strings(item, ["date", "note"])
        || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !validDate(item.date)
        || new Date(item.date).toISOString().slice(0, 10) !== item.date))) {
      throw new Error("希望日の形式が不正です。");
    }
    const deadlineKeys = ["id", "company", "kind", "title", "dueAt", "status",
      "url", "source", "note", "createdAt", "updatedAt"];
    if (data.deadlines.some(item => !item || !strings(item, deadlineKeys)
      || !validDate(item.dueAt) || (item.place !== undefined && typeof item.place !== "string")
      || (item.checklist !== undefined && (!Array.isArray(item.checklist) || item.checklist.length > 20
        || item.checklist.some(entry => !entry || typeof entry !== "object" || Array.isArray(entry)
          || typeof entry.label !== "string" || !entry.label.trim() || entry.label.length > 100
          || typeof entry.done !== "boolean"))))) throw new Error("締め切りの形式が不正です。");
    if (data.gakuchika.some(item => !item || !strings(item, ["id", "title", "createdAt", "updatedAt"])
      || !Array.isArray(item.tags) || !item.tags.every(tag => typeof tag === "string")
      || !item.structure || !strings(item.structure, ["conclusion", "situation", "problem", "action", "result", "learning"])
      || !Array.isArray(item.versions)
      || item.versions.some(v => !v || !Number.isFinite(v.chars) || v.chars < 1 || typeof v.text !== "string"
        || (v.seconds !== undefined && (!Number.isFinite(v.seconds) || v.seconds < 1)))
      || !Array.isArray(item.usedIn) || item.usedIn.some(v => !v || !strings(v, ["company", "date"])))) {
      throw new Error("ガクチカの形式が不正です。");
    }
    if (data.esQuestions.some(item => !item || !strings(item, ["id", "genre", "question", "createdAt", "updatedAt"])
      || !Number.isFinite(item.limit) || item.limit < 0 || !Array.isArray(item.answers)
      || item.answers.some(a => !a || !strings(a, ["id", "text", "company", "date", "note", "gakuchikaId"])))) {
      throw new Error("ES設問の形式が不正です。");
    }
    if (data.genres && (!Array.isArray(data.genres) || !data.genres.every(g => typeof g === "string"))) {
      throw new Error("ジャンルの形式が不正です。");
    }
    const iso = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
    data.esQuestions.forEach(q => {
      if (q.requirements !== undefined && typeof q.requirements !== "string") {
        throw new Error("提出条件の形式が不正です。");
      }
      if (q.breakdown !== undefined && (!Array.isArray(q.breakdown) || q.breakdown.some(item =>
        !item || typeof item.part !== "string" || !item.notes || typeof item.notes !== "object"
        || Array.isArray(item.notes) || !strings(item.notes, ["what", "why", "how", "whenWhere", "who", "result"])))) {
        throw new Error("設問の分解の形式が不正です。");
      }
    });
    data.esQuestions.forEach(q => q.answers.forEach(a => {
      if (a.submitted !== undefined && (!a.submitted || typeof a.submitted !== "object"
        || Array.isArray(a.submitted) || !strings(a.submitted, ["text", "at"]))) throw new Error("提出版の形式が不正です。");
      if (a.history !== undefined && (!Array.isArray(a.history) || a.history.length > 5 || a.history.some(h => !h || typeof h.text !== "string" || !iso(h.savedAt)))) throw new Error("回答履歴の形式が不正です。");
    }));
    if (data.mypages !== undefined && (!Array.isArray(data.mypages) || data.mypages.some(m => !m || !strings(m, ["id", "company", "url", "loginId", "status", "note", "createdAt", "updatedAt"]) || !["未登録", "登録済", "選考中", "終了"].includes(m.status) || !iso(m.createdAt) || !iso(m.updatedAt)))) throw new Error("マイページの形式が不正です。");
    if (data.companies !== undefined) {
      const names = new Set();
      if (!Array.isArray(data.companies) || data.companies.some(item => {
        if (item && item.webtests !== undefined && (!Array.isArray(item.webtests)
          || item.webtests.some(test => !test || !strings(test, ["id", "format", "date", "feeling", "note"])
            || typeof test.done !== "boolean"
            || ["start", "deadline"].some(key => test[key] !== undefined
              && (typeof test[key] !== "string" || (test[key] !== "" && !validDate(test[key]))))
            || ["center", "reusable"].some(key => test[key] !== undefined && typeof test[key] !== "boolean")))) {
          throw new Error("Webテストの形式が不正です。");
        }
        if (!item || !strings(item, ["id", "name", "officialUrl", "industry", "createdAt", "updatedAt"])
          || !Array.isArray(item.research)
          || item.research.some(entry => !entry || !strings(entry, ["label", "text"]))
          || (item.stage !== undefined && !this.stages.includes(item.stage))
          || (item.stageDetail !== undefined && typeof item.stageDetail !== "string")
          || (item.stageHistory !== undefined && (!Array.isArray(item.stageHistory)
            || item.stageHistory.some(entry => !entry || !strings(entry, ["stage", "date"])
              || !this.stages.includes(entry.stage) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
              || !validDate(entry.date))))
          || (item.rank !== undefined && item.rank !== "" && !this.ranks.includes(item.rank))
          || (item.intern !== undefined && typeof item.intern !== "boolean")
          || (Object.hasOwn(item, "pinned") && typeof item.pinned !== "boolean")
          || (item.earlyRoute !== undefined && typeof item.earlyRoute !== "string")
          || (item.rejection !== undefined && (!item.rejection || typeof item.rejection !== "object"
            || Array.isArray(item.rejection) || !strings(item.rejection, ["stage", "hypothesis"])))
          || (item.documents !== undefined && (!Array.isArray(item.documents)
            || item.documents.some(document => !document || !strings(document, ["id", "name"])
              || typeof document.done !== "boolean")))
          || (item.meetings !== undefined && (!Array.isArray(item.meetings)
            || item.meetings.some(meeting => !meeting || !strings(meeting,
              ["id", "date", "kind", "person", "notes", "createdAt", "updatedAt"])
              || typeof meeting.thanked !== "boolean")))
          || (item.interviews !== undefined && (!Array.isArray(item.interviews)
            || item.interviews.some(log => !log || !strings(log,
              ["id", "date", "stage", "questions", "answers", "reflection", "reverse", "createdAt", "updatedAt"])) ))
          || (item.motive !== undefined && (!item.motive || typeof item.motive !== "object"
            || Array.isArray(item.motive) || !strings(item.motive, ["area", "customer", "goal", "role", "strength", "why", "text"])))
          || names.has(item.name)) return true;
        names.add(item.name);
        return false;
      })) throw new Error("企業記録の形式が不正です。");
    }
    return data;
  },
  async load() {
    this.state("読込中");
    try {
      const stored = await chrome.storage.local.get(["data", "lastExportAt"]);
      this.data = stored.data === undefined
        ? { version: 1, deadlines: [], gakuchika: [], esQuestions: [] }
        : this.validate(stored.data);
      const trashCleaned = typeof this.cleanTrash === "function" && this.cleanTrash();
      this.lastExportAt = stored.lastExportAt || null;
      this.savedRevision = this.revision;
      this.loaded = true;
      ShukatsuShared.updateBadge(this.data.deadlines);
      this.state("保存済み");
      this.message("");
      if (trashCleaned) this.changed();
      await this.maybeAutoExport();
    } catch (error) {
      this.state("エラー");
      this.message("保存データを読み込めませんでした。拡張機能から開き、読み込みを再試行してください：" + error.message);
    }
    this.render();
  },
  async save() {
    if (!this.loaded || this.saving || this.savedRevision === this.revision) return;
    this.saving = true;
    this.state("保存中");
    const revision = this.revision;
    let retry = false;
    try {
      const snapshot = JSON.parse(JSON.stringify(this.data));
      await chrome.storage.local.set({ data: snapshot });
      if (typeof this.scheduleSyncAfterSave === "function") this.scheduleSyncAfterSave();
      ShukatsuShared.updateBadge(snapshot.deadlines);
      this.savedRevision = revision;
      retry = revision !== this.revision;
      this.state(retry ? "未保存" : "保存済み");
      this.message("");
    } catch (error) {
      this.state("エラー");
      this.message("保存できませんでした。編集内容はメモリに保持しています。JSONを書き出して退避できます：" + error.message);
    } finally {
      this.saving = false;
      if (retry) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.save(), 500);
      }
    }
    if (this.savedRevision === revision && typeof this.maybeBackup === "function") await this.maybeBackup();
  },
  backupMessage(now = new Date()) {
    if (![this.data.deadlines, this.data.gakuchika, this.data.esQuestions, this.data.mypages || []].some(a => a.length)) return "";
    const days = this.lastExportAt ? Math.floor((now - new Date(this.lastExportAt)) / 86400000) : NaN;
    if (!Number.isFinite(days)) return "まだバックアップしていません";
    return days >= 7 ? "最後のバックアップから" + days + "日たっています。JSONを書き出してください" : "";
  },
  renderBackupReminder() {
    const root = document.getElementById("backup-reminder"); root.replaceChildren();
    const message = this.backupMessage();
    if (message) { this.el("p", message, root); this.button(root, "今すぐ書き出す", () => this.exportJSON()); }
  },
  async maybeAutoExport(now = new Date()) {
    if (typeof chrome === "undefined" || !chrome.storage?.local || !this.loaded || this.autoExported
      || !this.exportReminderDue(now)
      || !["deadlines", "companies", "esQuestions", "mypages"].some(key => this.data[key]?.length)) return;
    this.autoExported = true;
    try {
      const { settings = {} } = await chrome.storage.local.get("settings");
      if (settings.autoExport === false) return;
      await this.exportJSON(true);
    } catch (error) { this.message("自動の書き出しに失敗しました:" + error.message); }
  },
  async exportJSON(automatic = false) {
    try {
      const now = new Date();
      const date = String(now.getFullYear()).padStart(4, "0") + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
      await this.download(`shukatsu-note-${date}.json`, JSON.stringify(this.data, null, 2), "application/json");
      const stamp = this.now(); await chrome.storage.local.set({ lastExportAt: stamp });
      this.lastExportAt = stamp; this.renderBackupReminder();
      this.message(automatic ? "1週間たったので、データを自動で書き出しました(ダウンロードフォルダ)。"
        : "JSONを書き出しました。ダウンロード先のファイルを確認してください。");
    } catch (error) {
      this.message((automatic ? "自動の書き出しに失敗しました:" : "書き出しまたは日時の保存に失敗しました：") + error.message);
    }
  },
  renderSyncSection(root) {
    root.replaceChildren();
    this.el("h3", "同期(Googleドライブ)", root);
    if (!this.syncConfigured()) {
      this.el("p", "同期の設定がまだです(クライアントIDが未設定)", root);
      return;
    }
    this.el("p", "一度接続すると、次からは自動でつながります(Google にログインしたままのとき)。", root);
    if (this.syncing && this.syncStatus === "同期中") {
      this.el("p", "同期中…", root);
      return;
    }
    if (this.syncNeedsReconnect || !this.syncStatus || this.syncStatus === "未接続") {
      this.el("p", "この端末と、ほかの端末のデータを、あなたの Google ドライブの専用フォルダで揃えます。", root);
      const connect = this.button(root, this.syncNeedsReconnect ? "Googleに再接続" : "Googleに接続", async () => {
        connect.disabled = true;
        try {
          if (await this.connectSync()) await this.syncNow();
        } catch (error) { this.message("同期できませんでした:" + error.message); }
        finally { connect.disabled = false; this.updateSyncState(); }
      });
      if (this.syncLinked) this.button(root, "接続を解除", async () => {
        await this.disconnectSync();
        this.updateSyncState();
      });
      return;
    }
    const date = new Date(this.syncState?.lastSyncAt);
    const pad = value => String(value).padStart(2, "0");
    this.el("p", Number.isFinite(date.getTime())
      ? `最後の同期: ${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
      : "まだ同期していません", root);
    this.button(root, "今すぐ同期", () => this.syncNow());
    const disconnect = this.button(root, "接続を解除", async () => {
      disconnect.disabled = true;
      try { await this.disconnectSync(); }
      catch (error) { this.message("接続を解除できませんでした:" + error.message); }
      finally { disconnect.disabled = false; this.updateSyncState(); }
    });
  },
  renderData(root) {
    if (typeof this.syncConfigured === "function") {
      const sync = this.el("section", null, root, "card");
      sync.id = "sync-section";
      this.renderSyncSection(sync);
    }
    this.dataOpen ||= {};
    const section = (name, state = "") => {
      const details = this.el("details", null, root, "data-section card");
      const summary = this.el("summary", null, details);
      this.el("span", name, summary);
      const status = this.el("span", "", summary, "data-section-status");
      details.setStatus = value => { status.textContent = value ? " — " + value : ""; };
      details.setStatus(state);
      details.open = this.dataOpen[name] ?? (name === "データと保存");
      details.ontoggle = () => { this.dataOpen[name] = details.open; };
      return details;
    };
    const shortDate = stamp => {
      const date = new Date(stamp);
      return stamp && Number.isFinite(date.getTime()) ? `${date.getMonth() + 1}/${date.getDate()}` : "";
    };
    const exportedDate = shortDate(this.lastExportAt);
    const saved = section("データと保存", exportedDate ? "最後の書き出し " + exportedDate : "未書き出し");
    const automatic = section("自動で読む");
    const notifications = section("通知", "オン");
    const backups = section("このChromeの中の控え", "なし");
    const trash = section("ゴミ箱", (this.data.trash || []).length + "件");
    const mobile = section("スマホで見る");
    root = saved;
    this.el("p", "変更から500ms後に、このChromeに自動保存します。", root);
    this.el("p", "氏名・住所・電話番号・メールなどの個人情報は入力しないでください。", root, "muted note");
    const stats = this.el("div", null, root, "stats data-stats");
    const counts = [
      ["締め切り", this.data.deadlines.length],
      ["マイページ", (this.data.mypages || []).length],
      ["ES設問", this.data.esQuestions.length],
      ["ES回答", this.data.esQuestions.reduce((total, question) => total + question.answers.length, 0)],
      ["ガクチカのエピソード", this.data.gakuchika.length]
    ];
    counts.forEach(([label, count]) => {
      const card = this.el("div", null, stats, "card stat");
      this.el("span", label, card);
      this.el("strong", String(count), card);
    });
    const exported = new Date(this.lastExportAt);
    const pad = value => String(value).padStart(2, "0");
    const exportText = this.lastExportAt && Number.isFinite(exported.getTime())
      ? `${exported.getFullYear()}-${pad(exported.getMonth() + 1)}-${pad(exported.getDate())} ${pad(exported.getHours())}:${pad(exported.getMinutes())}`
      : "まだ書き出していません";
    this.el("p", "最後にJSONを書き出した日時:" + exportText, root, "muted note");
    const tools = this.el("div", null, root, "toolbar");

    this.button(tools, "保存を再試行", () => this.save());
    this.button(tools, "JSONの書き出し", async () => {
      await this.exportJSON();
      const date = shortDate(this.lastExportAt);
      saved.setStatus(date ? "最後の書き出し " + date : "未書き出し");
    });
    this.el("p", "拡張機能はスマホでは動かないため、読み取り専用のHTMLを書き出します。スマホに送って(メールやクラウドなど、あなたの方法で)開いてください", mobile);
    this.button(mobile, "スマホ用のHTMLを書き出す", () => {
      const now = new Date();
      const date = String(now.getFullYear()).padStart(4, "0") + pad(now.getMonth() + 1) + pad(now.getDate());
      this.download(`shukatsu-mobile-${date}.html`, this.mobileHtml(now), "text/html");
    });
    const input = this.field(root, "JSONで置き換えて読み込む(ファイル選択)", "", "file");
    input.accept = ".json,application/json";
    input.onchange = async () => {
      try {
        if (!input.files[0]) return;
        const data = this.validate(JSON.parse(await input.files[0].text()));
        if (!confirm("現在のデータを置き換えますか？このChromeの保存データも置き換わります。")) return;
        this.data = data;
        if (typeof this.cleanTrash === "function") this.cleanTrash();
        this.changed();
        this.render();
      } catch (error) { this.message(error.message); }
    };
    const mergeInput = this.field(root, "JSONを統合して取り込む(ファイル選択)", "", "file");
    mergeInput.accept = ".json";
    mergeInput.onchange = async () => {
      try {
        if (!mergeInput.files[0]) return;
        this.mergeImport(this.validate(JSON.parse(await mergeInput.files[0].text())));
      } catch (error) { this.message(error.message); }
    };
    this.button(root, "サンプルを読み込む", () => {
      if (!confirm("現在のデータをサンプルに置き換えますか？このChromeの保存データも置き換わります。")) return;
      this.data = JSON.parse(JSON.stringify(this.sample));
      this.changed();
      this.render();
    });
    if (typeof this.renderTrash === "function") this.renderTrash(trash);
    if (typeof this.renderLocalBackups === "function") this.renderLocalBackups(backups);
    root = automatic;
    this.el("p", "許可したサイトを開いたときだけ、ページの文字を読んで締め切りを探します。ページ全体は保存しません。締め切りを登録するときは、根拠として、その締め切りが書かれた行(200字まで)と取得元のURL・日時を保存します。", root, "muted note");
    this.el("p", "Gmailは、開いたメールの件名と本文から合否を判定し、件名と判定だけを一時的に覚えます。メールの本文は保存しません。", root, "muted note");
    const sites = new Map();
    (this.data.mypages || []).forEach(page => {
      let url;
      try { url = new URL(page.url); } catch { return; }
      if (!["http:", "https:"].includes(url.protocol)) return;
      if (!sites.has(url.origin)) sites.set(url.origin, { hostname: url.hostname, companies: new Set() });
      sites.get(url.origin).companies.add(page.company);
    });
    const gmail = new URL("https://mail.google.com/*");
    // Gmailも登録されている場合は、最後の専用行にまとめる。
    const gmailCompanies = sites.get(gmail.origin)?.companies || new Set();
    sites.delete(gmail.origin);
    sites.set(gmail.origin, { hostname: gmail.hostname, companies: new Set([...gmailCompanies, "Gmail"]) });
    const permissions = typeof chrome !== "undefined" && chrome.permissions;
    if (permissions) sites.set("all-sites", { hostname: "", companies: new Set(["すべてのサイトで読む"]) });
    const permitted = new Map();
    sites.forEach((site, origin) => {
      const row = this.el("div", null, root, "autoread-row card");
      this.el("span", [...site.companies].join("、"), row);
      this.el("span", site.hostname, row);
      const status = this.el("span", permissions ? "確認中" : "この環境では使えません", row, "label");
      if (!permissions) return;
      const options = { origins: origin === "all-sites" ? ["https://*/*", "http://*/*"] : [origin + "/*"] };
      let allowed = false;
      const update = value => {
        allowed = value;
        permitted.set(origin, value);
        if (permitted.size === sites.size) automatic.setStatus([...permitted.values()].filter(Boolean).length + "サイト許可");
        status.textContent = allowed ? "自動で読む" : "オフ";
        button.textContent = allowed ? "やめる" : "許可する";
      };
      const button = this.button(row, "許可する", async () => {
        button.disabled = true;
        try {
          if (allowed) {
            if (await permissions.remove(options)) update(false);
          } else if (await permissions.request(options)) update(true);
        } catch (error) { this.message("自動で読む設定を変更できませんでした：" + error.message); }
        finally { button.disabled = false; }
      });
      button.disabled = true;
      const check = async () => {
        try { update(await permissions.contains(options)); }
        catch (error) { this.message("自動で読む設定を確認できませんでした：" + error.message); }
        finally { button.disabled = false; }
      };
      check();
    });
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      this.el("p", "就活のページらしいもの(締切・エントリー・選考などの言葉と日付があるページ)だけを読みます。Google ドライブとの同期のときだけ、Google と通信します。登録した締め切りには、根拠として、その行(200字まで)だけを保存します。", root, "muted note");
      const label = this.el("label", null, root);
      const checkbox = this.el("input", null, label);
      checkbox.type = "checkbox";
      checkbox.checked = false;
      this.el("span", "見つけた締め切りを自動で登録する", label);
      checkbox.disabled = true;
      chrome.storage.local.get("settings").then(({ settings = {} }) => {
        checkbox.checked = settings.autoRegister === true;
      }).catch(error => this.message("設定を確認できませんでした：" + error.message))
        .finally(() => { checkbox.disabled = false; });
      checkbox.onchange = async () => {
        checkbox.disabled = true;
        try {
          const { settings = {} } = await chrome.storage.local.get("settings");
          await chrome.storage.local.set({ settings: { ...settings, autoRegister: checkbox.checked } });
        } catch (error) { this.message("設定を変更できませんでした：" + error.message); }
        finally { checkbox.disabled = false; }
      };
    }
    root = notifications;
    this.el("p", "Google ドライブとの同期のときだけ、Google と通信します。メールでの通知はありません。Googleカレンダーなどでメール通知が欲しいときは、.ics書き出しを取り込んでください(前日の通知を付けて書き出します)", root, "muted note");
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      this.el("p", "この環境では使えません", root, "muted");
      return;
    }
    let notificationSettingsQueue = Promise.resolve();
    for (const [key, text] of [["notify", "Chromeの通知で知らせる"], ["dayBefore", "前日"], ["sameDay", "当日"],
      ["autoExport", "週に1回、開いたときに自動でJSONを書き出す"]]) {
      const label = this.el("label", null, root);
      const input = this.el("input", null, label);
      input.type = "checkbox";
      input.checked = true;
      this.el("span", text, label);
      if (key === "autoExport") this.el("p", "Chrome の設定で『ダウンロード前に各ファイルの保存場所を確認する』がオンだと、保存先を聞く画面が出ます", root, "muted note");
      input.disabled = true;
      chrome.storage.local.get("settings").then(({ settings = {} }) => {
        input.checked = settings[key] !== false;
        if (key === "notify") notifications.setStatus(input.checked ? "オン" : "オフ");
      }).catch(error => this.message("設定を確認できませんでした：" + error.message))
        .finally(() => { input.disabled = false; });
      input.onchange = () => {
        const checked = input.checked;
        input.disabled = true;
        notificationSettingsQueue = notificationSettingsQueue.then(async () => {
          const { settings = {} } = await chrome.storage.local.get("settings");
          await chrome.storage.local.set({ settings: { ...settings, [key]: checked } });
          if (key === "notify") notifications.setStatus(checked ? "オン" : "オフ");
        }).catch(error => this.message("設定を変更できませんでした：" + error.message))
          .finally(() => { input.disabled = false; });
        return notificationSettingsQueue;
      };
    }
  }
});
