"use strict";
if (typeof ShukatsuIcons !== "undefined") {
  const names = { "#today": "check", "#deadlines": "clock", "#plans": "calendar", "#pipeline": "list", "#mypages": "building", "#gakuchika": "star", "#es": "document", "#support": "scale", "#data": "database" };
  document.querySelectorAll("nav a").forEach(link => {
    const name = names[link.hash];
    if (name) link.prepend(ShukatsuIcons.make(name));
  });
}
App.sample = {
  version: 1,
  deadlines: [
    {
      id: "sample-deadline-a", company: "サンプル株式会社A", kind: "ES",
      title: "ES提出", dueAt: "2026-11-10T17:00", status: "未着手",
      url: "", source: "manual", note: "架空の動作確認用データ",
      createdAt: "2026-11-06T00:00:00.000Z", updatedAt: "2026-11-06T00:00:00.000Z"
    },
    {
      id: "sample-deadline-b", company: "サンプル株式会社B", kind: "Webテスト",
      title: "テスト受験", dueAt: "2026-11-07", status: "進行中",
      url: "", source: "manual", note: "時刻未指定の例",
      createdAt: "2026-11-06T00:00:00.000Z", updatedAt: "2026-11-06T00:00:00.000Z"
    },
    {
      id: "sample-deadline-c", company: "サンプル株式会社C", kind: "説明会",
      title: "説明会の準備", dueAt: "2026-11-05", status: "提出済",
      url: "", source: "manual", note: "完了項目の例",
      createdAt: "2026-11-06T00:00:00.000Z", updatedAt: "2026-11-06T00:00:00.000Z"
    }
  ],
  gakuchika: [
    {
      id: "sample-episode-a", title: "架空の読書会の運営", tags: ["運営", "協力"],
      structure: {
        conclusion: "架空の読書会で進行方法を改善した。", situation: "参加者が意見を話す機会に偏りがあった。",
        problem: "全員が話せる時間の確保が課題だった。", action: "順番に話す時間を設けた。",
        result: "全員から意見を聞けた。", learning: "参加しやすい仕組みの大切さを学んだ。"
      },
      versions: [{ chars: 100, text: "架空の読書会で全員が話せる進行方法を考えた。順番に話す時間を設け、全員から意見を聞くことができた。" }],
      usedIn: [{ company: "サンプル株式会社A", date: "2026-11-06" }],
      createdAt: "2026-11-06T00:00:00.000Z", updatedAt: "2026-11-06T00:00:00.000Z"
    }
  ],
  esQuestions: [
    {
      id: "sample-question-a", genre: "ガクチカ", question: "学生時代に力を入れたことは何ですか。", limit: 400,
      answers: [{ id: "sample-answer-a", text: "架空の読書会で、全員が意見を話せるように進行を工夫した。",
        company: "サンプル株式会社A", date: "2026-11-06", note: "架空の回答例", gakuchikaId: "sample-episode-a" }],
      createdAt: "2026-11-06T00:00:00.000Z", updatedAt: "2026-11-06T00:00:00.000Z"
    }
  ]
};

App.render = function () {
  const routes = { support: "renderSupport", today: "renderToday", deadlines: "renderDeadlines", plans: "renderPlans", pipeline: "renderPipeline", mypages: "renderMypages", gakuchika: "renderGakuchika", es: "renderES", data: "renderData" };
  const requested = location.hash.slice(1);
  let company = null;
  const prep = requested.startsWith("prep/");
  if (prep || requested.startsWith("company/")) {
    try { company = decodeURIComponent(requested.slice(prep ? 5 : 8)); }
    catch { company = ""; }
  }
  const route = Object.prototype.hasOwnProperty.call(routes, requested) ? requested : "today";
  const root = document.getElementById("view");
  root.replaceChildren();
  document.querySelectorAll("nav a").forEach(link => {
    if (company === null && link.hash === "#" + route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (!this.loaded) {
    this.el("p", "保存データの読み込みが必要です。", root);
    this.button(root, "読み込みを再試行", () => this.load());
    return;
  }
  this.applyFeatureDisplay();
  this.renderBackupReminder();
  if (company !== null) {
    if (prep) this.renderPrep(root, company);
    else this.renderCompany(root, company);
    return;
  }
  this[routes[route]](root);
};

App.renderGlobalSearch = function (query) {
  if (!this.loaded) { this.render(); return; }
  const root = document.getElementById("view");
  root.replaceChildren();
  document.querySelectorAll("nav a").forEach(link => link.removeAttribute("aria-current"));
  this.el("h2", "検索:" + query, root);
  const results = this.searchAll(query);
  if (!results.length) this.el("p", "検索結果はありません", root, "muted");
  for (const type of new Set(results.map(result => result.type))) {
    this.el("h3", type, root);
    results.filter(result => result.type === type).forEach(result => {
      const row = this.el("div", null, root, "card");
      this.button(row, result.label, () => {
        clearTimeout(this.globalSearchTimer);
        document.getElementById("global-search").value = "";
        location.hash = result.go;
        this.render();
      });
      this.el("p", result.text, row, "pre");
    });
  }
};
const globalSearch = document.getElementById("global-search");
globalSearch.addEventListener("input", () => {
  clearTimeout(App.globalSearchTimer);
  App.globalSearchTimer = setTimeout(() => {
    const query = globalSearch.value;
    if (query.normalize("NFKC").replace(/\s/g, "")) App.renderGlobalSearch(query);
    else App.render();
  }, 300);
});

document.getElementById("close-editor").onclick = () => document.getElementById("editor").close();
document.getElementById("editor").addEventListener("click", event => {
  const editor = document.getElementById("editor");
  if (editor.className !== "deadline-editor" || event.target !== editor) return;
  const rect = editor.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) editor.close();
});
document.getElementById("editor").addEventListener("close", () => {
  document.querySelector('#edit-form button[type="submit"]').disabled = false;
});
document.addEventListener("keydown", event => {
  if (event.key !== "/" || event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target;
  if (target && (["INPUT", "TEXTAREA", "SELECT"].includes((target.tagName || "").toUpperCase())
      || target.isContentEditable)) return;
  if (document.getElementById("editor").open) return;
  const input = document.getElementById("global-search");
  if (!input) return;
  event.preventDefault();
  input.focus();
});
window.addEventListener("hashchange", () => {
  clearTimeout(App.globalSearchTimer);
  globalSearch.value = "";
  App.render();
});
window.addEventListener("beforeunload", event => {
  if (App.revision !== App.savedRevision && App.revision > 0) {
    event.preventDefault();
    event.returnValue = "";
  }
});
App.cleanPageUrl = value => ShukatsuShared.cleanPageUrl(value);
App.consumePendingImport = async function () {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.session) return;
  const result = await chrome.storage.session.get("pendingImport");
  await chrome.storage.session.remove("pendingImport");
  const pending = result.pendingImport;
  if (!pending || typeof pending.createdAt !== "number" || !Number.isFinite(pending.createdAt)
      || Date.now() - pending.createdAt >= 300000 || pending.createdAt > Date.now() || !this.loaded) return;
  const title = typeof pending.title === "string" ? pending.title : "";
  const url = this.cleanPageUrl(pending.url);
  const company = ShukatsuShared.guessCompanyName(title, url, this.data);
  if (pending.type === "deadline" && typeof pending.text === "string" && pending.text.trim()) {
    location.hash = "#deadlines"; this.render();
    this.pasteDeadlines({ text: pending.text.slice(0, 50000), title: company, url });
  } else if (pending.type === "result" && typeof pending.company === "string") {
    location.hash = "#mypages"; this.render();
    this.editMailResult({ ...pending, result: ["通過", "内定", "不合格"].includes(pending.result) ? pending.result : "通過" });
  } else if (pending.type === "es" && typeof pending.text === "string" && pending.text.trim()) {
    location.hash = "#es"; this.render();
    this.pasteQuestions({ text: pending.text.slice(0, 50000), company });
  } else if (pending.type === "mypage" && url) {
    location.hash = "#mypages"; this.render();
    this.editMypage(null, { company, url, status: "登録済" });
  }
};
App.importAutoDeadlines = async function () {
  if (!this.loaded || typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
  const { autoDeadlines } = await chrome.storage.local.get("autoDeadlines");
  if (!this.loaded || !Array.isArray(autoDeadlines)) return;
  let added = false;
  for (const item of autoDeadlines) {
    if (!item || !["company", "kind", "title", "dueAt", "url"].every(key => typeof item[key] === "string")) continue;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d))?$/.exec(item.dueAt);
    if (!match) continue;
    const date = new Date(item.dueAt.slice(0, 10) + "T00:00:00Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.dueAt.slice(0, 10)) continue;
    if (this.hasDuplicateDeadline(item.company, item.dueAt, item.kind)) continue;
    const stamp = this.now();
    this.data.deadlines.push({ id: this.id(), company: item.company, kind: item.kind,
      title: item.title, dueAt: item.dueAt, status: "未着手", url: item.url,
      evidence: item.evidence, source: item.source || "auto", note: item.source === "quick" ? "" : "自動で追加(確認してください)", createdAt: stamp, updatedAt: stamp });
    added = true;
  }
  if (added) { this.changed(); this.render(); }
  await chrome.storage.local.remove("autoDeadlines");
};
App.importAutoMypages = async function () {
  if (!this.loaded || typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
  const { autoMypages } = await chrome.storage.local.get("autoMypages");
  if (!this.loaded || !Array.isArray(autoMypages)) return;
  let added = false;
  for (const item of autoMypages) {
    if (!item || typeof item.company !== "string" || typeof item.url !== "string") continue;
    try { if (!["http:", "https:"].includes(new URL(item.url).protocol)) continue; }
    catch { continue; }
    const url = this.cleanPageUrl(item.url);
    if (!url || ShukatsuShared.matchMypages(url, this.data.mypages || []).length) continue;
    const stamp = this.now();
    this.data.mypages ||= [];
    this.data.mypages.push({ id: this.id(), company: item.company, url, loginId: "",
      status: "登録済", note: "", createdAt: stamp, updatedAt: stamp });
    added = true;
  }
  if (added) { this.changed(); this.render(); }
  await chrome.storage.local.remove("autoMypages");
};
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && (changes.pendingPages || changes.pendingResults)
        && ["", "#today"].includes(location.hash)) App.render();
    const pending = changes.autoDeadlines && changes.autoDeadlines.newValue;
    const mypages = changes.autoMypages && changes.autoMypages.newValue;
    if (area === "local" && App.loaded && Array.isArray(mypages) && mypages.length) {
      App.importAutoMypages().catch(error => App.message("マイページを取り込めませんでした: " + error.message));
    }
    if (area === "local" && App.loaded && Array.isArray(pending) && pending.length) {
      return App.importAutoDeadlines().catch(error => App.message("自動の締め切りを取り込めませんでした: " + error.message));
    }
  });
}
const updateNotebookSyncState = App.updateSyncState;
const notebookSyncButton = document.getElementById("sync-state");
if (notebookSyncButton) notebookSyncButton.onclick = async () => {
  if (!App.loaded || !App.syncConfigured()) return;
  location.hash = "#data";
  App.render();
  await App.getSyncToken();
  if (App.syncNeedsReconnect || !App.syncStatus || App.syncStatus === "未接続") {
    if (await App.connectSync()) await App.syncNow();
  }
  App.updateSyncState();
};
App.updateSyncState = function () {
  updateNotebookSyncState.call(this);
  const section = document.getElementById("sync-section");
  if (section) this.renderSyncSection(section);
};
App.ready = Promise.resolve().then(async () => {
  await App.consumeSyncRedirect();
  await App.load();
  if (App.loaded) await App.importAutoDeadlines();
  if (App.loaded) await App.importAutoMypages();
  await App.consumePendingImport();
  if (App.loaded) await App.initSync();
}).catch(error => {
  document.getElementById("message").textContent = "ページの受け渡しに失敗しました: " + error.message;
});
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "consume-pending-import") return;
    chrome.tabs.getCurrent().then(async tab => {
      if (tab?.id !== message.noteTabId) return;
      await App.ready;
      await App.consumePendingImport();
      sendResponse({ ok: true });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  });
}
