"use strict";
const ShukatsuShared = {
  readPageES: function () {
    const pairs = [];
    const personal = q => /氏名|名前|フリガナ|ふりがな|住所|郵便|電話|携帯|メール|生年月日|年齢|性別|出身|所在地|学校名|大学名|学部名|学科名|学籍|パスワード|ID/i.test(q);
    const asks = q => /教えて|ください|下さい|ですか|ますか|[?？]|理由|動機|志望|自己PR|自己ＰＲ|力を入れ|強み|弱み|経験|エピソード/.test(q);
    const tidy = q => q.replace(/\s+/g, " ").replace(/[（(]\s*全角\s*[)）]|[0-9０-９]+\s*(?:文字|字)\s*(?:以下|以内|程度)/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    const text = node => node ? (node.innerText || node.textContent || "") : "";
    const withoutSupport = node => {
      let value = text(node);
      for (const support of node.querySelectorAll('[class*="support"]')) value = value.split(text(support)).join(" ");
      return value;
    };
    const readLimit = (question, node, field) => {
      const source = [question];
      if (node?.querySelectorAll) for (const support of node.querySelectorAll('[class*="support"]')) source.push(text(support));
      const numbers = Array.from(source.join(" ").matchAll(/([0-9０-９]+)\s*(?:文字|字)/g), match =>
        Number(match[1].replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0))));
      if (numbers.length) return Math.max(...numbers);
      return field && field.maxLength >= 1 && field.maxLength <= 5000 ? field.maxLength : 0;
    };
    const add = (question, answer, longTextarea = false, limit = 0) => {
      question = tidy(question);
      if (personal(question) || !(longTextarea && answer.length >= 30 || answer.length >= 10 && asks(question))) return;
      if (pairs.length < 20 && !pairs.some(pair => pair.question === question && pair.answer === answer)) pairs.push({ question, answer, limit });
    };
    for (const field of document.querySelectorAll('textarea, input')) {
      if (field.tagName === "INPUT" && field.type && field.type !== "text") continue;
      if (!field.offsetParent && !field.getClientRects().length) continue;
      const answer = (field.value || "").trim();
      if (answer.length < 10) continue;
      const label = field.id && Array.from(document.querySelectorAll("label[for]")).find(item => item.htmlFor === field.id && item.textContent.trim());
      let group, ancestor = field.parentElement;
      for (let depth = 0; ancestor && depth < 5; depth++, ancestor = ancestor.parentElement) {
        if (ancestor.querySelectorAll("textarea, input, select").length === 1) group = ancestor;
      }
      let question = label ? label.textContent.trim() : (field.getAttribute("aria-label") || "").trim();
      if (!question) question = (field.closest("tr")?.querySelector("th")?.textContent || "").trim();
      if (!question && field.previousElementSibling?.tagName === "DT") question = field.previousElementSibling.textContent.trim();
      if (!question) {
        if (group) {
          const heading = group.querySelector(".memo__question, label, legend, th, dt, b, strong");
          question = withoutSupport(heading || group);
        }
      }
      if (!question) {
        let previous = field.previousElementSibling;
        while (previous && !question) {
          question = (previous.textContent || "").trim().slice(0,300);
          previous = previous.previousElementSibling;
        }
      }
      add(question, answer, field.tagName === "TEXTAREA", readLimit(question, group || label, field));
      if (pairs.length === 20) break;
    }
    if (!pairs.length) {
      const visible = node => !!(node.offsetParent || node.getClientRects().length);
      for (const row of document.querySelectorAll("tr, dt")) {
        if (!visible(row)) continue;
        const cells = row.tagName === "TR" ? Array.from(row.children).filter(cell => cell.tagName === "TH" || cell.tagName === "TD") : [];
        const questionNode = row.tagName === "DT" ? row : cells[0];
        const answerNode = row.tagName === "DT" ? row.nextElementSibling : cells[1];
        if (!questionNode || !answerNode || (row.tagName === "DT" && answerNode.tagName !== "DD")) continue;
        if (!visible(answerNode) || row.querySelector("input, textarea, select") || answerNode.querySelector("input, textarea, select")) continue;
        const question = (questionNode.innerText || "").trim();
        const answer = (answerNode.innerText || "").trim();
        if (!question || question.length > 300 || question === answer) continue;
        add(withoutSupport(questionNode), answer, true, readLimit(text(questionNode), questionNode));
        if (pairs.length === 20) break;
      }
      for (const answerNode of document.querySelectorAll('[class*="answer"]')) {
        if (!visible(answerNode) || answerNode.querySelector("input, textarea, select")) continue;
        let ancestor = answerNode.parentElement;
        for (let depth = 0; ancestor && depth < 4; depth++, ancestor = ancestor.parentElement) {
          const heading = Array.from(ancestor.querySelectorAll('[class*="question"], [class*="item__text"], th, dt, label, b, strong'))
            .find(node => !answerNode.contains(node) && !node.contains(answerNode));
          if (!heading) continue;
          add(withoutSupport(heading), text(answerNode).trim(), false, readLimit(text(heading), ancestor));
          break;
        }
        if (pairs.length === 20) break;
      }
    }
    return pairs;
  },
  isJobPage(text) {
    return typeof text === "string" && /締切|締め切り|〆切|提出期限|応募期限|エントリー|選考|マイページ|説明会|インターン|面接|Webテスト|適性検査/.test(text);
  },
  cleanPageUrl(value) {
    return typeof value === "string" && /^https?:[/][/]/.test(value) ? value.split(/[?#]/)[0] : "";
  },
  mypageBase(pathname) {
    const parts = pathname.split("/").filter(Boolean);
    while (parts.length && (parts[parts.length - 1].includes(".")
      || /^(mypage|top|home|index|login|logout|menu|main|portal|entry|default|member|members|dashboard)$/i.test(parts[parts.length - 1]))) parts.pop();
    return parts;
  },
  matchMypages(value, mypages = []) {
    const parse = input => { try { return new URL(this.cleanPageUrl(input)); } catch { return null; } };
    const current = parse(value);
    if (!current) return [];
    return mypages.filter(page => {
      const saved = parse(page.url);
      const base = saved ? this.mypageBase(saved.pathname) : [];
      const currentParts = current.pathname.split("/").filter(Boolean);
      return saved && saved.hostname.replace(/^www\./, "") === current.hostname.replace(/^www\./, "")
        && base.every((part, index) => part === currentParts[index]);
    });
  },
  guessCompanyName(title, url, data = {}) {
    const limit = value => Array.from(value).slice(0, 40).join("");
    const matched = [...new Set(this.matchMypages(url, data.mypages).map(p => p.company).filter(Boolean))];
    if (matched.length === 1) return limit(matched[0]);
    title = typeof title === "string" ? title : "";
    const known = [...(data.deadlines || []), ...(data.mypages || [])].map(p => p.company)
      .filter(name => name && title.includes(name)).sort((a, b) => Array.from(b).length - Array.from(a).length);
    if (known.length) return limit(known[0]);
    const parts = title.split(/[|｜:：/／【】「」\[\]]|\s+[-–—]\s+/).map(part => part
      .replace(/マイページ|My\s?Page|ログイン|Login|新卒採用|採用情報|採用サイト|採用ページ|採用|新卒|エントリー|Entry|トップ|TOP|ホーム|会員|インターンシップ|インターン|説明会|選考|応募|募集|20\d{2}年卒|\d{2}卒|20\d{2}年度/gi, "")
      .replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "").trim()).filter(Boolean);
    return limit(parts.find(part => /株式会社|[（(]株[）)]|有限会社|合同会社|ホールディングス|グループ/.test(part)) || parts[0] || "");
  },
  remaining(item, now = new Date()) {
    const date = new Date(item.dueAt.slice(0, 10) + "T00:00");
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((date - today) / 86400000);
    const expired = item.dueAt.length > 10 ? new Date(item.dueAt) < now : days < 0;
    return { days, expired, text: expired ? "期限切れ" : days === 0 ? "今日" : days === 1 ? "明日" : `あと${days}日` };
  },
  activeDeadlines(items = [], days = Infinity, now = new Date()) {
    return items.filter(item => ["未着手", "進行中"].includes(item.status)
      && (this.remaining(item, now).expired || this.remaining(item, now).days <= days))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  },
  dueNotices(deadlines = [], notified = {}, now = new Date(), settings = {}) {
    if (settings.notify === false) return [];
    const notices = [];
    for (const item of deadlines) {
      if (!["未着手", "進行中"].includes(item.status)) continue;
      const timed = item.dueAt.length > 10;
      const due = new Date(item.dueAt + (timed ? "" : "T00:00"));
      if (!Number.isFinite(due.getTime()) || this.remaining(item, now).expired) continue;
      const sameDay = due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate();
      const todayReady = sameDay && now.getHours() >= 8 && settings.sameDay !== false;
      const previous = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 1, 9);
      const hours = (due - now) / 3600000;
      const kinds = notified[item.id]?.dueAt === item.dueAt ? notified[item.id].kinds || [] : [];
      const date = `${due.getMonth() + 1}/${due.getDate()}` + (timed ? ` ${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}` : "");
      const pending = (item.checklist || []).filter(entry => entry.done === false).map(entry => entry.label);
      const submissions = pending.length ? `\n未提出: ${pending.join("・")}` : "";
      for (const [kind, enabled, ready] of [
        ["前日", settings.dayBefore, !todayReady && (timed ? hours > 0 && hours < 24 : now >= previous)],
        ["当日", settings.sameDay, sameDay && now.getHours() >= 8]
      ]) {
        if (enabled === false || !ready || kinds.includes(kind)) continue;
        const remaining = sameDay ? "今日" : `あと${Math.ceil(hours)}時間`;
        notices.push({ item, kind, ...(kind === "当日" ? { skip: ["前日"] } : {}), message: `${item.company}:${item.title}(${date}、${remaining})${submissions}` });
      }
    }
    return notices;
  },
  badgeCount(items, now = new Date()) { return this.activeDeadlines(items, 3, now).length; },
  async updateBadge(items, now = new Date()) {
    if (typeof chrome === "undefined" || !chrome.action) return;
    try {
      const active = this.activeDeadlines(items, 3, now);
      await chrome.action.setBadgeBackgroundColor({ color: active.some(item => this.remaining(item, now).expired) ? "#c0392b" : "#1f5fbf" });
      await chrome.action.setBadgeText({ text: active.length ? String(active.length) : "" });
    } catch { /* バッジの失敗でデータ操作を止めない。 */ }
  }
};
