"use strict";

const ShukatsuIcons = {
  names: ["plus", "pencil", "trash", "copy", "check", "clipboard", "calendar", "list",
    "download", "upload", "arrow-left", "external", "clock", "building", "star",
    "document", "database", "book", "search", "scale"],

  make(name) {
    // Original line drawings on a 24 by 24 grid.
    const drawings = {
      plus: [["path", { d: "M12 5V19M5 12H19" }]],
      pencil: [["path", { d: "M5 15L15 5L19 9L9 19L4 20Z M13 7L17 11" }]],
      trash: [["path", { d: "M4 7H20M9 7V4H15V7M6 7L7 20H17L18 7M10 11V16M14 11V16" }]],
      copy: [["rect", { x: "8", y: "8", width: "12", height: "13", rx: "2" }],
        ["path", { d: "M5 16H4V3H16V4" }]],
      check: [["polyline", { points: "4,12 9,18 20,6" }]],
      clipboard: [["path", { d: "M8 5H5V21H19V5H16" }],
        ["rect", { x: "8", y: "3", width: "8", height: "5", rx: "1" }]],
      calendar: [["rect", { x: "3", y: "5", width: "18", height: "16", rx: "2" }],
        ["path", { d: "M7 3V8M17 3V8M3 11H21M7 15H9M15 15H17M7 18H9" }]],
      list: [["path", { d: "M9 6H21M9 12H21M9 18H21M3 6H4M3 12H4M3 18H4" }]],
      download: [["path", { d: "M12 3V15M7 10L12 15L17 10M4 16V21H20V16" }]],
      upload: [["path", { d: "M12 15V3M7 8L12 3L17 8M4 16V21H20V16" }]],
      "arrow-left": [["path", { d: "M20 12H4L10 6M4 12L10 18" }]],
      external: [["path", { d: "M13 4H20V11M20 4L10 14M9 5H4V20H19V15" }]],
      clock: [["circle", { cx: "12", cy: "12", r: "9" }],
        ["polyline", { points: "12,6 12,12 16,14" }]],
      building: [["rect", { x: "5", y: "3", width: "14", height: "18", rx: "1" }],
        ["path", { d: "M9 7H10M14 7H15M9 11H10M14 11H15M10 21V16H14V21" }]],
      star: [["path", { d: "M12 3L15 9L21 10L17 15L18 21L12 18L6 21L7 15L3 10L9 9Z" }]],
      document: [["path", { d: "M5 3H14L19 8V21H5ZM14 3V8H19M8 12H16M8 16H14" }]],
      database: [["path", { d: "M4 6C4 2 20 2 20 6C20 10 4 10 4 6ZM4 6V18C4 22 20 22 20 18V6M4 12C4 16 20 16 20 12" }]],
      book: [["path", { d: "M12 6C9 4 6 4 3 5V20C6 19 9 19 12 21C15 19 18 19 21 20V5C18 4 15 4 12 6ZM12 6V21" }]],
      scale: [["path", { d: "M12 3V21M8 21H16M4 6H20M6 6L2 14H10L6 6M18 6L14 14H22L18 6M2 14Q6 20 10 14M14 14Q18 20 22 14" }]],
      search: [["circle", { cx: "10", cy: "10", r: "6" }],
        ["line", { x1: "15", y1: "15", x2: "21", y2: "21" }]]
    };
    if (!Object.prototype.hasOwnProperty.call(drawings, name)) return null;
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    const attributes = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
      "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round",
      "aria-hidden": "true", focusable: "false", class: "icon" };
    for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
    for (const [tag, properties] of drawings[name]) {
      const child = document.createElementNS(namespace, tag);
      for (const [key, value] of Object.entries(properties)) child.setAttribute(key, value);
      svg.append(child);
    }
    return svg;
  }
};

if (typeof module !== "undefined") module.exports = ShukatsuIcons;
