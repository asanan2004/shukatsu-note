"use strict";
// Only the notebook calls initSync and scheduleSyncAfterSave. Other surfaces do not sync.
Object.assign(App, {
  syncConfigured() {
    return typeof ShukatsuSyncConfig !== "undefined" && Boolean(ShukatsuSyncConfig.clientId.trim());
  },
  syncIdentity() {
    return typeof chrome !== "undefined" ? chrome.identity : undefined;
  },
  syncSession() {
    if (typeof chrome === "undefined" || !chrome.storage?.session) throw new Error("一時保存を利用できません");
    return chrome.storage.session;
  },
  async clearSyncToken() {
    await chrome.storage.local.remove("syncToken");
    await this.syncSession().remove("syncToken");
    clearTimeout(this.syncExpiryTimer);
    this.syncStatus = "未接続";
  },
  async readSyncToken() {
    let { syncToken } = await chrome.storage.local.get("syncToken");
    const legacy = await this.syncSession().get("syncToken");
    if (legacy.syncToken) {
      if (!syncToken) {
        syncToken = legacy.syncToken;
        await chrome.storage.local.set({ syncToken });
      }
      await this.syncSession().remove("syncToken");
    }
    if (syncToken && typeof syncToken.token === "string" && syncToken.token
        && Number.isFinite(syncToken.expiresAt) && Date.now() < syncToken.expiresAt - 60000) {
      await chrome.storage.local.set({ syncLinked: true });
      this.syncLinked = true;
      clearTimeout(this.syncExpiryTimer);
      this.syncExpiryTimer = setTimeout(() => {
        void this.getSyncToken().then(() => this.updateSyncState()).catch(() => {});
      }, Math.min(syncToken.expiresAt - 60000 - Date.now(), 2147483647));
      return syncToken.token;
    }
    if (syncToken) {
      this.syncTokenExpired = true;
      await this.clearSyncToken();
    }
    return null;
  },
  async acceptSyncToken(url, expectedState, redirect) {
    const result = new URL(url);
    const target = new URL(redirect);
    if (result.origin !== target.origin || result.pathname !== target.pathname) return false;
    const params = new URLSearchParams(result.hash.slice(1));
    if (!expectedState || params.get("state") !== expectedState) return false;
    const token = params.get("access_token");
    const seconds = Number(params.get("expires_in"));
    const expiresAt = Date.now() + seconds * 1000;
    if (!token || /[\r\n]/.test(token) || !Number.isFinite(expiresAt) || seconds <= 60) return false;
    await chrome.storage.local.set({ syncToken: { token, expiresAt }, syncLinked: true });
    this.syncLinked = true;
    this.syncStatus = "接続中";
    this.syncNeedsReconnect = false;
    this.syncTokenExpired = false;
    if (!this.syncIdentity()) sessionStorage.removeItem("shukatsu-sync-reconnect");
    await this.readSyncToken();
    return true;
  },
  syncAuthUrl(redirect, state, interactive) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: ShukatsuSyncConfig.clientId, response_type: "token", redirect_uri: redirect,
      scope: ShukatsuSyncConfig.scope, prompt: interactive ? "select_account" : "none", state
    }).toString();
    return url.href;
  },
  async connectSync(interactive = true) {
    if (!this.syncConfigured()) return false;
    if (this.syncConnecting) return false;
    this.syncConnecting = true;
    try {
      const state = crypto.randomUUID();
      const identity = this.syncIdentity();
      if (identity) {
        const redirect = identity.getRedirectURL();
        const result = await identity.launchWebAuthFlow({ url: this.syncAuthUrl(redirect, state, interactive), interactive });
        if (!result || !await this.acceptSyncToken(result, state, redirect)) {
          throw new Error("Googleに接続してください");
        }
        return true;
      }
      if (!interactive && (this.syncRedirectHandled || sessionStorage.getItem("shukatsu-sync-silent")
          || sessionStorage.getItem("shukatsu-sync-reconnect"))) return false;
      // Never leave the editor until all pending notebook changes have been saved.
      while (this.saving) await new Promise(resolve => setTimeout(resolve, 20));
      while (this.loaded && this.revision !== this.savedRevision) {
        const before = this.savedRevision;
        await this.save();
        if (this.savedRevision === before && this.revision !== this.savedRevision) {
          throw new Error("未保存の変更を保存してください");
        }
      }
      const redirect = location.origin + location.pathname;
      sessionStorage.setItem("shukatsu-sync-state", state);
      if (!interactive) {
        sessionStorage.setItem("shukatsu-sync-return", location.hash || "#today");
        sessionStorage.setItem("shukatsu-sync-silent", "1");
      }
      location.href = this.syncAuthUrl(redirect, state, interactive);
      return false;
    } catch (error) {
      await this.clearSyncToken();
      this.syncNeedsReconnect = true;
      this.message(interactive ? "同期できませんでした:Googleに接続してください" : "Googleに接続してください");
      return false;
    } finally {
      this.syncConnecting = false;
    }
  },
  // Await before app.js starts routing, even before the data has loaded.
  async consumeSyncRedirect() {
    if (this.syncIdentity() || typeof location === "undefined") return false;
    const params = new URLSearchParams(location.hash.slice(1));
    if (!params.has("access_token") && !params.has("error")) return false;
    const expectedState = sessionStorage.getItem("shukatsu-sync-state");
    const silent = Boolean(sessionStorage.getItem("shukatsu-sync-silent"));
    const savedHash = sessionStorage.getItem("shukatsu-sync-return");
    const returnHash = silent ? (savedHash?.startsWith("#") ? savedHash : "#today") : "#data";
    this.syncRedirectHandled = true;
    sessionStorage.removeItem("shukatsu-sync-state");
    sessionStorage.removeItem("shukatsu-sync-silent");
    sessionStorage.removeItem("shukatsu-sync-return");
    const callback = location.href;
    history.replaceState(null, "", location.pathname + location.search + returnHash);
    if (!this.syncConfigured()) return false;
    try {
      const accepted = await this.acceptSyncToken(callback, expectedState, location.origin + location.pathname);
      if (accepted) return true;
    } catch (error) { /* A malformed or rejected callback never becomes a token. */ }
    await this.clearSyncToken();
    this.syncNeedsReconnect = true;
    if (silent) sessionStorage.setItem("shukatsu-sync-reconnect", "1");
    if (!silent) this.message("Googleに再接続");
    return false;
  },
  async disconnectSync() {
    this.syncGeneration = (this.syncGeneration || 0) + 1;
    clearTimeout(this.syncSaveTimer);
    await this.clearSyncToken();
    await chrome.storage.local.remove("syncLinked");
    this.syncLinked = false;
    if (!this.syncIdentity()) {
      for (const key of ["shukatsu-sync-silent", "shukatsu-sync-return", "shukatsu-sync-state", "shukatsu-sync-reconnect"]) {
        sessionStorage.removeItem(key);
      }
    }
    this.syncNeedsReconnect = false;
    this.syncTokenExpired = false;
  },
  async getSyncToken() {
    if (!this.syncConfigured()) return null;
    const token = await this.readSyncToken();
    if (token) return token;
    if ((this.syncTokenExpired || this.syncLinked) && this.syncIdentity() && await this.connectSync(false)) return this.readSyncToken();
    this.syncStatus = "未接続";
    if (this.syncTokenExpired || this.syncLinked) {
      this.syncNeedsReconnect = true;
    }
    return null;
  },
  async syncRequest(path, token, options = {}) {
    const url = new URL(path, "https://www.googleapis.com");
    if (url.origin !== "https://www.googleapis.com" || url.username || url.password) {
      throw new Error("同期先が不正です");
    }
    const response = await fetch(url.href, {
      ...options, redirect: "error", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { ...options.headers, Authorization: "Bearer " + token }
    });
    if (response.status === 401) {
      await this.clearSyncToken();
      this.syncNeedsReconnect = true;
      const error = new Error("Googleに再接続");
      error.syncUnauthorized = true;
      throw error;
    }
    if (!response.ok) throw new Error("Google ドライブの応答 " + response.status);
    return response;
  },
  async findSyncFile(token) {
    const name = ShukatsuSyncConfig.fileName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    let pageToken = "";
    const files = [];
    do {
      const query = new URLSearchParams({ spaces: "appDataFolder", q: "name='" + name + "' and trashed=false",
        fields: "files(id,modifiedTime),nextPageToken" });
      if (pageToken) query.set("pageToken", pageToken);
      const response = await this.syncRequest("/drive/v3/files?" + query, token);
      const result = await response.json();
      if (!Array.isArray(result.files)) throw new Error("ファイル一覧が不正です");
      files.push(...result.files);
      pageToken = result.nextPageToken || "";
    } while (pageToken);
    files.sort((a, b) => (Date.parse(b.modifiedTime) || 0) - (Date.parse(a.modifiedTime) || 0));
    if (files.length && (typeof files[0].id !== "string" || !files[0].id)) throw new Error("ファイルIDが不正です");
    return files[0] || null;
  },
  async createSyncFile(token, data) {
    const boundary = "shukatsu_" + crypto.randomUUID();
    const metadata = { name: ShukatsuSyncConfig.fileName, parents: ["appDataFolder"] };
    const body = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
      + JSON.stringify(metadata) + "\r\n--" + boundary
      + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(data)
      + "\r\n--" + boundary + "--\r\n";
    const response = await this.syncRequest("/upload/drive/v3/files?uploadType=multipart", token, {
      method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body
    });
    const file = await response.json();
    if (typeof file.id !== "string" || !file.id) throw new Error("ファイルIDが不正です");
    return file.id;
  },
  mergeForSync(current, incoming) {
    const copy = value => JSON.parse(JSON.stringify(value));
    // Object spread preserves unknown keys without assigning to special object setters.
    const data = { ...copy(incoming), ...copy(current) };
    const time = item => {
      const value = Date.parse(item.updatedAt || item.createdAt);
      return Number.isFinite(value) ? value : -Infinity;
    };
    for (const key of ["deadlines", "mypages", "esQuestions", "gakuchika", "reverseQuestions", "companies",
      "genres", "availability", "weeks", "plans", "preparation"]) {
      if (!Object.hasOwn(current, key) && !Object.hasOwn(incoming, key)) continue;
      const identity = item => key === "genres" ? item
        : item[key === "companies" ? "name" : key === "availability" ? "date" : key === "weeks" ? "week" : "id"];
      const entries = new Map();
      for (const item of [...(current[key] || []), ...(incoming[key] || [])]) {
        const id = identity(item);
        if (!entries.has(id) || (key !== "genres" && time(item) > time(entries.get(id)))) entries.set(id, copy(item));
      }
      data[key] = [...entries.values()];
    }
    const trash = new Map();
    for (const entry of [...(current.trash || []), ...(incoming.trash || [])]) {
      if (!trash.has(entry.id) || Date.parse(entry.deletedAt) > Date.parse(trash.get(entry.id).deletedAt)) {
        trash.set(entry.id, copy(entry));
      }
    }
    // Apply all tombstones before capping the stored trash, so the cap cannot resurrect a record.
    const top = { plan: "plans", deadline: "deadlines", mypage: "mypages", question: "esQuestions",
      gakuchika: "gakuchika", reverse: "reverseQuestions", preparation: "preparation" };
    const nested = { answer: ["esQuestions", "answers"], version: ["gakuchika", "versions"],
      use: ["gakuchika", "usedIn"], interview: ["companies", "interviews"], meeting: ["companies", "meetings"] };
    for (const entry of trash.values()) {
      const remove = list => list.filter(item => item.id !== entry.item.id || !(Date.parse(entry.deletedAt) > time(item)));
      if (Object.hasOwn(top, entry.type)) {
        const key = top[entry.type];
        if (data[key]) data[key] = remove(data[key]);
      } else if (Object.hasOwn(nested, entry.type)) {
        const [key, child] = nested[entry.type];
        for (const parent of data[key] || []) {
          if (parent.id === entry.parentId && parent[child]) parent[child] = remove(parent[child]);
        }
      }
    }
    if (Object.hasOwn(current, "trash") || Object.hasOwn(incoming, "trash")) {
      data.trash = [...trash.values()].sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt)).slice(0, 200);
    }
    return data;
  },
  async syncNow() {
    if (!this.syncConfigured() || !this.loaded || this.syncing) return;
    this.syncing = true;
    const generation = this.syncGeneration || 0;
    const active = () => generation === (this.syncGeneration || 0);
    try {
      const token = await this.getSyncToken();
      if (!token || !active()) return;
      this.syncStatus = "同期中";
      this.updateSyncState();
      const file = await this.findSyncFile(token);
      if (!active()) return;
      let fileId;
      if (!file) {
        fileId = await this.createSyncFile(token, this.data);
      } else {
        fileId = file.id;
        const path = "/drive/v3/files/" + encodeURIComponent(fileId) + "?alt=media";
        const response = await this.syncRequest(path, token);
        let remote;
        try { remote = this.validate(await response.json()); }
        catch (error) {
          this.message("ドライブのデータが壊れているため同期を止めました");
          return;
        }
        if (!active()) return;
        const merged = this.mergeForSync(this.data, remote);
        this.validate(merged);
        if (JSON.stringify(merged) !== JSON.stringify(this.data)) {
          this.data = merged;
          this.changed();
          this.render();
        }
        if (JSON.stringify(merged) !== JSON.stringify(remote)) {
          await this.syncRequest("/upload/drive/v3/files/" + encodeURIComponent(fileId) + "?uploadType=media", token, {
            method: "PATCH", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(merged)
          });
        }
      }
      if (!active()) return;
      const syncState = { lastSyncAt: new Date().toISOString(), fileId };
      await chrome.storage.local.set({ syncState });
      this.syncState = syncState;
      this.syncStatus = "接続中";
    } catch (error) {
      this.message(error.syncUnauthorized ? "Googleに再接続" : "同期できませんでした:" + error.message);
    } finally {
      this.syncing = false;
      if (this.syncStatus === "同期中") this.syncStatus = "接続中";
      this.updateSyncState();
    }
  },
  updateSyncState() {
    if (typeof document === "undefined") return;
    const node = document.getElementById("sync-state");
    if (!node) return;
    node.hidden = !this.syncConfigured();
    const date = new Date(this.syncState?.lastSyncAt);
    const label = Number.isFinite(date.getTime())
      ? String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0") : "";
    node.textContent = this.syncNeedsReconnect ? "再接続が必要" : this.syncing && this.syncStatus === "同期中" ? "同期中"
      : this.syncStatus === "未接続" || !this.syncStatus ? "未接続" : label ? "同期済み " + label : "接続中";
  },
  scheduleSyncAfterSave() {
    clearTimeout(this.syncSaveTimer);
    if (!this.syncConfigured()) return;
    this.syncSaveTimer = setTimeout(() => { void this.syncNow(); }, 5000);
  },
  // Called after successful notebook load. consumeSyncRedirect is called separately before routing.
  async initSync() {
    if (!this.syncConfigured() || !this.loaded) return;
    try {
      const { syncState, syncLinked } = await chrome.storage.local.get(["syncState", "syncLinked"]);
      this.syncState = syncState || null;
      this.syncLinked = Boolean(syncLinked);
      this.syncStatus = await this.readSyncToken() ? "接続中" : "未接続";
      if (this.syncLinked && this.syncStatus === "未接続" && !this.syncIdentity()) {
        this.syncNeedsReconnect = true;
        await this.connectSync(false);
      }
      if (!this.syncInterval) this.syncInterval = setInterval(() => { void this.syncNow(); }, 300000);
      await this.syncNow();
    } catch (error) {
      this.message("同期できませんでした:" + error.message);
    }
    this.updateSyncState();
  }
});
