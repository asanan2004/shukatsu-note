"use strict";

const ShukatsuParse = {
  findSubmissions(text) {
    const rules = [
      [/(?:^|[^A-Za-z])ES(?:$|[^A-Za-z])|エントリーシート/, "ES"],
      [/履修履歴/, "履修履歴"],
      [/成績証明書/, "成績証明書"],
      [/卒業見込み?証明書/, "卒業見込証明書"],
      [/健康診断書/, "健康診断書"],
      [/証明写真|顔写真/, "証明写真"],
      [/履歴書/, "履歴書"],
      [/ポートフォリオ/, "ポートフォリオ"],
      [/動画|録画/, "動画"],
      [/TOEIC|TOEFL|IELTS|語学スコア/, "語学スコア"]
    ];
    return rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  },
  quickParse(text, now = new Date()) {
    const candidate = this.parseDeadlineText(text, now)[0];
    if (!candidate) return null;
    const words = text
      .replace(/(?:(?:\d{4})[年/-])?\d{1,2}[月/-]\d{1,2}日?/g, " ")
      .replace(/\d{1,2}[:時]\d{1,2}分?|正午/g, " ")
      .replace(/エントリーシート|Webテスト|テストセンター|パーソナリティ|性格検査|能力検査|適性|SPI|玉手箱|AI面接|面接|説明会|セミナー|イベント|インターン(?:応募)?|\bES\b/gi, " ")
      .trim().split(/\s+/);
    const company = words.shift();
    if (!company) return null;
    return { company, kind: candidate.kind, title: words.join(" ") || candidate.kind,
      dueAt: candidate.date + (candidate.time ? "T" + candidate.time : "") };
  },
  parseDeadlineText(text, now = new Date()) {
    const candidates = [];
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lines = text.split(/\r\n|\r|\n/);
    const periods = lines.map(line => {
      const dates = Array.from(line.matchAll(/(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})日?/g));
      return dates.slice(0, -1).flatMap((start, i) => {
        const end = dates[i + 1];
        const between = line.slice(start.index + start[0].length, end.index);
        const rest = between.replace(/[（(][日月火水木金土](?:曜日)?[）)]|(?:午前|午後)?\d{1,2}[:時]\d{1,2}分?|正午/g, "");
        return /^[\s〜～~ー至-]+$/.test(rest) && /[〜～~ー至-]/.test(rest)
          ? [{ start: start.index, end: end.index, text: `${Number(start[2])}/${Number(start[3])}〜${Number(end[2])}/${Number(end[3])}` }] : [];
      });
    });
    lines.forEach((line, index) => {
      const pattern = /(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})日?/g;
      let match;
      while ((match = pattern.exec(line))) {
        if (match.index > 0 && /[\d/-]/.test(line[match.index - 1])) continue;
        const month = Number(match[2]), day = Number(match[3]);
        let year = match[1] ? Number(match[1]) : today.getFullYear();
        if (!match[1]) {
          const attempt = new Date(year, month - 1, day);
          const before = new Date(today); before.setMonth(before.getMonth() - 6);
          const after = new Date(today); after.setMonth(after.getMonth() + 6);
          if (attempt <= before) year++;
          else if (attempt >= after) year--;
        }
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) continue;
        const next = line.slice(pattern.lastIndex).search(/(?:(?:\d{4})[年/-])?\d{1,2}[月/-]\d{1,2}/);
        const nearby = line.slice(pattern.lastIndex, next < 0 ? undefined : pattern.lastIndex + next);
        const clockPattern = /(?:(午前|午後|AM|PM|a\.m\.|p\.m\.)\s*)?(\d{1,2})(?::(\d{1,2})|時(?:(\d{1,2})分?)?)|正午/i;
        const clock = nearby.match(clockPattern) || line.slice(0, match.index).match(clockPattern);
        let time = "";
        if (clock) {
          let hour = clock[0] === "正午" ? 12 : Number(clock[2]);
          const minute = clock[0] === "正午" ? 0 : Number(clock[3] || clock[4] || 0);
          if (/^(午後|pm|p\.m\.)$/i.test(clock[1]) && hour >= 1 && hour <= 11) hour += 12;
          else if (/^(午前|am|a\.m\.)$/i.test(clock[1]) && hour === 12) hour = 0;
          if (hour < 24 && minute < 60) time = String(hour).padStart(2,"0") + ":" + String(minute).padStart(2,"0");
        }
        const period = periods[index].find(p => p.start === match.index || p.end === match.index);
        const dateText = date.getFullYear() + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
        if (period && period.start === match.index) period.startDate = dateText;
        const testContext = lines.slice(Math.max(0, index - 3), index + 1).join("\n");
        const isWebtest = /テストセンター|適性検査|Webテスト|SPI|玉手箱|TG-WEB|GAB|CAB/i.test(testContext) && !/面接/.test(line);
        if (period && period.start === match.index && isWebtest) continue;
        const roleLine = line.replace(/締切済|締め切り済|〆切済|締め切りました|受付終了|終了しました/g, "");
        let previousLine = "";
        for (let i = index - 1; i >= 0; i--) {
          if (lines[i].trim()) { previousLine = lines[i]; break; }
        }
        const deadlineHeading = !period && !/締切|締め切り|〆切|期限|まで|迄|必着|提出日/.test(roleLine)
          && /締切|締め切り|〆切|期限|提出日/.test(previousLine)
          && /[：:]\s*$/.test(previousLine) ? previousLine : "";
        const role = /締切|締め切り|〆切|期限|まで|迄|必着|提出日/.test(roleLine) ? "締切"
          : period ? (period.start === match.index ? "開始" : "終了")
          : deadlineHeading ? "締切"
          : /開催|日程|日時|実施|開始|当日|会場|オンライン|対面|説明会/.test(lines.slice(Math.max(0, index - 3), index + 1).join("\n")) ? "開催" : "日付";
        let previousPeriod;
        for (let i = index - 1; i >= Math.max(0, index - 3); i--) {
          if (periods[i].length) { previousPeriod = periods[i][periods[i].length - 1]; break; }
        }
        const roleText = role === "締切" ? (previousPeriod ? previousPeriod.text + "の回の締切" : "締切")
          : period ? period.text + "の期間の" + (role === "開始" ? "初日" : "最終日")
          : role === "開催" ? "開催日" : "日付(用途不明)";
        const rules = [[/(?:^|[^a-z])ES(?:$|[^a-z])|エントリーシート/i,"ES"], [/Webテスト|テストセンター|パーソナリティ|性格検査|能力検査|適性|SPI|玉手箱/i,"Webテスト"], [/AI面接|面接/,"面接"], [/説明会|セミナー|イベント/,"説明会"], [/インターン|オープンカンパニー|仕事体験|職業体験/,"インターン応募"]];
        let rule = rules.find(r => r[0].test(line));
        let heading = "";
        if (!rule && deadlineHeading) {
          rule = rules.find(r => r[0].test(deadlineHeading));
          if (rule) heading = deadlineHeading.trim();
        }
        if (!rule) {
          for (let i = index - 1; i >= Math.max(0, index - 3); i--) {
            rule = rules.find(r => r[0].test(lines[i]));
            if (rule) {
              heading = lines[i].replace(/^[\s【】\[\]■◆・:：\d０-９└]+|[\s【】\[\]■◆・:：]+$/g, "");
              break;
            }
          }
        }
        if (role === "締切" && !(deadlineHeading && heading) && !rules.some(r => r[0].test(line))) {
          for (let i = index - 1; i >= 0; i--) {
            if (!/概要|▼|■|【/.test(lines[i])) continue;
            const headingRule = rules.find(r => r[0].test(lines[i]));
            if (!headingRule) continue;
            if (!rule) rule = headingRule;
            heading = lines[i].trim();
            break;
          }
        }
        const submissionLines = [heading, line];
        if (role === "締切") {
          for (let i = index + 1; i < Math.min(lines.length, index + 6); i++) {
            if (/(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})日?/.test(lines[i])) break;
            submissionLines.push(lines[i]);
          }
        }
        const submissions = role === "締切" ? this.findSubmissions(submissionLines.join("\n")) : [];
        candidates.push({ sourceText: Array.from(line.trim()).slice(0, 200).join(""), date: date.getFullYear() + "-" + String(month).padStart(2,"0") + "-" + String(day).padStart(2,"0"), time, kind: rule ? rule[1] : "その他", title: Array.from((heading ? heading + " " : "") + line.trim()).slice(0,60).join(""), role, roleText, heading, submissions });
        if (isWebtest && (!rule || rule[1] === "Webテスト") && (role === "終了" || (role === "締切" && !period))) {
          const candidate = candidates[candidates.length - 1];
          candidate.kind = "Webテスト";
          candidate.webtest = { start: period?.startDate || "", deadline: dateText + (time ? "T" + time : ""),
            center: /テストセンター/.test(testContext),
            format: testContext.match(/SPI|玉手箱|TG-WEB|GAB|CAB/i)?.[0].toUpperCase() || "その他" };
        }
      }
    });
    return candidates;
  }
};

if (typeof module !== "undefined") module.exports = ShukatsuParse;
