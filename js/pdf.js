// PDF generation: a real page-layout engine on pdf-lib. Runs in the browser, free, no server.
// It lays out text with the template's fonts, margins, spacing and indents, paginates, numbers pages,
// and builds the table of contents and lists with true page numbers (several passes until stable).
const PDFLIB_URL = "https://esm.sh/pdf-lib@1.17.1";
let libP; const getLib = () => (libP ||= import(PDFLIB_URL));

// pdf-lib's widthOfTextAtSize applies kerning, but drawText does not, so measure glyph by glyph instead.
const GW = new WeakMap();
const tw = (font, s, size) => {
  let m = GW.get(font); if (!m) GW.set(font, (m = new Map())); let w = 0;
  for (const ch of s) { let g = m.get(ch); if (g === undefined) { g = font.widthOfTextAtSize(ch, 1000) / 1000; m.set(ch, g); } w += g; }
  return w * size;
};
const roman = (n) => { let s = ""; for (const [v, r] of [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]]) while (n >= v) { s += r; n -= v; } return s; };
const alpha = (n) => { let s = ""; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
const cap = (s) => s.replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
const authorStr = (a) => [a.last && (a.first ? a.last + "," : a.last), a.first, a.mi].filter(Boolean).join(" ");
const MAP = { "\u2010": "-", "\u2011": "-", "\u2212": "-", "\u2264": "<=", "\u2265": ">=", "\u00a0": " ", "\u200b": "", "\u2192": "->", "\u2190": "<-" };
function mkSafe(font) {
  const ok = new Map();
  return (s) => { let o = ""; for (const ch of s) { let r = ok.get(ch); if (r === undefined) { try { font.encodeText(ch); r = ch; } catch { r = MAP[ch] ?? "?"; } ok.set(ch, r); } o += r; } return o; };
}
function fill(s, P) {
  const m = P.meta, v = { title: P.title, authors: m.authorList.map(authorStr).filter(Boolean).join("; "), degree: m.degree, program: m.program, specialization: m.specialization,
    university: m.university, campus: m.campus, department: m.department, college: m.college, year: m.academicYear, date: m.submissionDate };
  return (s || "").replace(/\{(\w+)\}/g, (x, k) => (k in v ? v[k] || "" : x));
}
function runsOf(html) {
  const out = [], t = document.createElement("template"); t.innerHTML = html || "";
  (function walk(n, st) {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out.push({ t: c.textContent, ...st });
      else if (c.nodeType === 1) { const g = c.tagName; if (g === "BR") out.push({ br: true }); else walk(c, { b: st.b || g === "B" || g === "STRONG", i: st.i || g === "I" || g === "EM", u: st.u || g === "U" }); }
    }
  })(t.content, {});
  return out;
}
const plainRuns = (txt, st = {}) => String(txt || "").split("\n").flatMap((l, i) => (i ? [{ br: true }, { t: l, ...st }] : [{ t: l, ...st }]));
const plain = (html) => runsOf(html).map((r) => (r.br ? " " : r.t)).join("").replace(/\s+/g, " ").trim();
const listItems = (html) => { const t = document.createElement("template"); t.innerHTML = html || ""; const li = [...t.content.querySelectorAll("li")]; return (li.length ? li.map((x) => runsOf(x.innerHTML)) : [runsOf(html)]).filter((r) => r.some((x) => x.t?.trim())); };
const hasText = (r) => r.some((x) => x.t && x.t.trim());

// Break styled runs into lines. Spaces are separate tokens so lines can be justified.
function wrap(runs, size, width, first, fontFor, safe) {
  const toks = [];
  for (const r of runs) {
    if (r.br) { toks.push({ br: true }); continue; }
    const f = fontFor(r);
    for (const part of safe(r.t.replace(/\s+/g, " ")).split(/( )/)) if (part !== "") toks.push({ t: part, f, u: r.u, sp: part === " ", w: tw(f, part, size) });
  }
  const lines = []; let cur = { segs: [], w: 0, avail: width - first };
  const push = (forced) => { while (cur.segs.length && cur.segs.at(-1).sp) cur.w -= cur.segs.pop().w; cur.forced = forced; lines.push(cur); cur = { segs: [], w: 0, avail: width }; };
  const add = (s) => { cur.segs.push(s); cur.w += s.w; };
  for (const k of toks) {
    if (k.br) { push(true); continue; }
    if (k.sp && !cur.segs.length) continue;
    if (!k.sp && cur.w + k.w > cur.avail && cur.segs.length) push(false);
    if (!k.sp && k.w > cur.avail) { // a single word wider than the line: split it
      let piece = "";
      for (const ch of k.t) {
        if (piece && tw(k.f, piece + ch, size) > cur.avail - cur.w) { add({ ...k, t: piece, w: tw(k.f, piece, size) }); push(false); piece = ch; } else piece += ch;
      }
      if (piece) add({ ...k, t: piece, w: tw(k.f, piece, size) });
      continue;
    }
    add(k);
  }
  if (cur.segs.length || !lines.length) push(true);
  return lines;
}
function drawSegs(page, ln, x, base, size, extra, rgb) {
  for (const s of ln.segs) {
    if (s.sp) { page.drawText(" ", { x, y: base, size, font: s.f }); x += s.w + extra; continue; } // draw spaces too so text can be copied and searched
    page.drawText(s.t, { x, y: base, size, font: s.f });
    if (s.u) page.drawLine({ start: { x, y: base - 1.5 }, end: { x: x + s.w, y: base - 1.5 }, thickness: 0.6, color: rgb(0, 0, 0) });
    x += s.w;
  }
}
async function defaultLoad(url) { // WebP -> JPEG on a white background (pdf-lib embeds JPG and PNG only)
  const r = await fetch(url, { mode: "cors" }); if (!r.ok) throw new Error("image fetch failed");
  const bmp = await createImageBitmap(await r.blob()), cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0);
  const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.92));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: "jpg" };
}

async function onePass(L, data, pageMap, imgCache, loadImage) {
  const { PDFDocument, StandardFonts, rgb } = L, P = data.project, f = P.format, m = P.meta;
  const pdf = await PDFDocument.create(); pdf.setTitle(P.title || "Manuscript"); pdf.setCreator("ririrish"); pdf.setProducer("ririrish");
  const fam = f.fontFamily === "Arial" ? ["Helvetica", "HelveticaBold", "HelveticaOblique", "HelveticaBoldOblique"] : ["TimesRoman", "TimesRomanBold", "TimesRomanItalic", "TimesRomanBoldItalic"];
  const F = { r: await pdf.embedFont(StandardFonts[fam[0]]), b: await pdf.embedFont(StandardFonts[fam[1]]), i: await pdf.embedFont(StandardFonts[fam[2]]), bi: await pdf.embedFont(StandardFonts[fam[3]]) };
  const fontFor = (s) => (s.b && s.i ? F.bi : s.b ? F.b : s.i ? F.i : F.r), safe = mkSafe(F.r);
  const a4 = f.paper === "a4", W = a4 ? 595.28 : 612, H = a4 ? 841.89 : 792, M = f.margin * 72, CW = W - 2 * M;
  const pages = [], marks = {}, imgs = new Map(); let cur, y;
  const newPage = (sec) => { cur = { page: pdf.addPage([W, H]), sec }; pages.push(cur); y = H - M; };
  const ensure = (h) => { if (y - h < M && y < H - M - 0.5) newPage(cur.sec); };
  const begin = (k) => { marks[k] = pages.length - 1; };
  const black = rgb(0, 0, 0);

  function para(runs, o = {}) {
    const size = o.size || f.fontSize, lh = size * 1.15 * (o.ls ?? f.lineSpacing), left = o.left || 0, width = CW - left;
    const lines = wrap(runs, size, width, o.indent || 0, fontFor, safe);
    if (o.at != null) y = o.at;
    ensure(lh * (Math.min(lines.length, o.keep || 2) + (o.reserve || 0)));
    lines.forEach((ln, i) => {
      if (y - lh < M && y < H - M - 0.5) newPage(cur.sec);
      const ind = i === 0 ? o.indent || 0 : 0, avail = width - ind, base = y - lh + size * 0.22, al = o.align || "left";
      let x = M + left + ind; if (al === "center") x += (avail - ln.w) / 2; else if (al === "right") x += avail - ln.w;
      const gaps = ln.segs.filter((s) => s.sp).length, extra = al === "justify" && !ln.forced && i < lines.length - 1 && gaps ? (avail - ln.w) / gaps : 0;
      if (i === 0 && o.marker) cur.page.drawText(o.marker, { x: M + left - 8 - tw(F.r, o.marker, size), y: base, size, font: F.r });
      drawSegs(cur.page, ln, x, base, size, extra, rgb); y -= lh;
    });
    y -= o.after || 0;
  }
  const heading = (t, key) => { ensure(f.chapterSize * 1.15 * 3); if (key) begin(key); para([{ t, b: true }], { size: f.chapterSize, ls: 1, align: "center", after: 14, keep: 3 }); };
  const centered = (page, text, font, size, cx, yy, under) => { const w = tw(font, safe(text), size); page.drawText(safe(text), { x: cx - w / 2, y: yy, size, font }); if (under) page.drawLine({ start: { x: cx - w / 2, y: yy - 1.5 }, end: { x: cx + w / 2, y: yy - 1.5 }, thickness: 0.7, color: black }); };
  function sig(s, x, w) { // signature line, name, designation
    ensure(46); const page = cur.page, yy = y;
    page.drawLine({ start: { x, y: yy }, end: { x: x + w, y: yy }, thickness: 0.7, color: black });
    centered(page, [s.position, s.name].filter(Boolean).join(" ") || "Name", F.b, f.fontSize, x + w / 2, yy - 13);
    const lab = s.label || { Adviser: "Adviser", Chairperson: "Chairman", "Panel Member": "Member", Dean: "Dean", Other: "" }[s.role] || "";
    if (lab) centered(page, lab, F.r, f.fontSize, x + w / 2, yy - 27);
  }
  async function getImg(url) {
    if (!imgs.has(url)) { let d = imgCache.get(url); if (!d) { d = await loadImage(url); imgCache.set(url, d); } imgs.set(url, d.kind === "png" ? await pdf.embedPng(d.bytes) : await pdf.embedJpg(d.bytes)); }
    return imgs.get(url);
  }
  async function fig(b) {
    const info = data.media.get(b.id), cs = 11, lh = cs * 1.15;
    if (!b.url && !(b.caption || "").trim()) return;
    let w = (b.w || 4) * 72, h = (b.lock === false ? b.h || 3 : (b.w || 4) * (b.nh || 3) / (b.nw || 4)) * 72;
    if (w > CW) { h *= CW / w; w = CW; } const maxH = H - 2 * M - 70; if (h > maxH) { w *= maxH / h; h = maxH; }
    let img = null; if (b.url) { try { img = await getImg(b.url); } catch (e) { console.warn("Image skipped", e); } }
    const capLines = wrap([{ t: `Figure ${info.num}.`, b: true }, { t: " " + (b.caption || "") }], cs, CW, 0, fontFor, safe).length;
    if (y < H - M - 1) y -= 8;
    ensure(h + 8 + capLines * lh + 14); begin("fig_" + b.id);
    if (b.url) {
      const x = M + ({ left: 0, center: (CW - w) / 2, right: CW - w }[b.align || "center"] ?? 0);
      if (img) cur.page.drawImage(img, { x, y: y - h, width: w, height: h });
      else { cur.page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.7 }); centered(cur.page, "Image unavailable", F.i, 10, x + w / 2, y - h / 2); }
      y -= h + 8;
    }
    para([{ t: `Figure ${info.num}.`, b: true }, { t: " " + (b.caption || "") }], { size: cs, ls: 1, align: "center", after: 14 });
  }
  function tbl(b) {
    const info = data.media.get(b.id), size = Math.min(f.fontSize, 11), lh = size * 1.15, pad = 3, rows = b.cells.length, cols = b.colW.length;
    if (y < H - M - 1) y -= 8;
    ensure(lh * 4); begin("tbl_" + b.id);
    para([{ t: `Table ${info.num}.`, b: true }, { t: " " + (b.caption || "") }], { size, ls: 1, align: "center", after: 6, keep: 2, reserve: 2 });
    const cw = b.colW.map((p) => (p / 100) * CW), xs = cw.map((_, i) => M + cw.slice(0, i).reduce((a, c) => a + c, 0)), hs = Array(rows).fill(lh + 2 * pad);
    const owner = Array.from({ length: rows }, () => Array(cols).fill(null)), cells = [];
    b.cells.forEach((row, r) => row.forEach((x, c) => { if (x.hide) return; for (let i = 0; i < x.rs; i++) for (let j = 0; j < x.cs; j++) owner[r + i][c + j] = r; const wd = cw.slice(c, c + x.cs).reduce((a, v) => a + v, 0);
      const hd = r === 0 && b.header, lines = wrap(runsOf(x.h).map((t) => (hd ? { ...t, b: true } : t)), size, wd - 2 * pad, 0, fontFor, safe); cells.push({ r, c, x, wd, lines, hd }); }));
    cells.filter((k) => k.x.rs === 1).forEach((k) => { hs[k.r] = Math.max(hs[k.r], k.lines.length * lh + 2 * pad); });
    cells.filter((k) => k.x.rs > 1).forEach((k) => { const tot = hs.slice(k.r, k.r + k.x.rs).reduce((a, v) => a + v, 0), need = k.lines.length * lh + 2 * pad; if (need > tot) hs[k.r + k.x.rs - 1] += need - tot; });
    const chunks = []; for (let r = 0; r < rows; r++) { const tied = r > 0 && owner[r].some((o) => o !== null && o < r); if (tied) chunks.at(-1)[1] = r + 1; else chunks.push([r, r + 1]); }
    for (const [r0, r1] of chunks) {
      const Hh = hs.slice(r0, r1).reduce((a, v) => a + v, 0); ensure(Hh);
      for (const k of cells.filter((q) => q.r >= r0 && q.r < r1)) {
        const hh = hs.slice(k.r, k.r + k.x.rs).reduce((a, v) => a + v, 0), top = y - hs.slice(r0, k.r).reduce((a, v) => a + v, 0);
        cur.page.drawRectangle({ x: xs[k.c], y: top - hh, width: k.wd, height: hh, borderColor: black, borderWidth: 0.5, ...(k.hd ? { color: rgb(0.94, 0.94, 0.94) } : {}) });
        k.lines.forEach((ln, i) => { const al = b.colAlign[k.c] || "left", inner = k.wd - 2 * pad; let x = xs[k.c] + pad; if (al === "center") x += (inner - ln.w) / 2; else if (al === "right") x += inner - ln.w;
          drawSegs(cur.page, ln, x, top - pad - (i + 1) * lh + size * 0.22, size, 0, rgb); });
      }
      y -= Hh;
    }
    y -= 14;
  }
  async function blocks(c, o = {}) {
    const nn = data.nums(c);
    for (let i = 0; i < c.blocks.length; i++) {
      const b = c.blocks[i];
      if (b.type === "p") { const r = runsOf(b.html); if (!hasText(r)) continue; const al = b.align || f.align; para(r, { ls: o.ls, align: al, indent: al === "justify" || al === "left" ? f.indent * 72 : 0 }); }
      else if (b.type === "kw") { const r = runsOf(b.html).map((t) => (t.br ? t : { ...t, i: true })); if (hasText(r)) para([{ t: "Keywords: ", i: true }, ...r], { ls: 1, align: "left", before: 0 }); }
      else if (b.type === "list") listItems(b.html).forEach((r, k) => para(r, { ls: o.ls, left: 36, align: "left", marker: { bullet: "\u2022", decimal: `${k + 1}.`, "upper-alpha": `${alpha(k + 1).toUpperCase()}.`, "lower-alpha": `${alpha(k + 1)}.`, "upper-roman": `${roman(k + 1).toUpperCase()}.`, "lower-roman": `${roman(k + 1)}.` }[b.listStyle || "bullet"] }));
      else if (b.type === "h1" || b.type === "h2" || b.type === "h3") {
        const t = plain(b.html); if (!t) continue; const lead = nn[i] ? nn[i] + " " : "", lh = f.fontSize * 1.15 * f.lineSpacing;
        ensure(lh * 3); if (b.type === "h1") begin("b_" + b.id);
        para([{ t: lead + (b.type === "h1" ? t.toUpperCase() : cap(t)), b: true }], { ls: o.ls, left: b.type === "h2" ? 5 : b.type === "h3" ? 10 : 0, reserve: 2 });
      } else if (b.type === "fig") await fig(b); else if (b.type === "tbl") tbl(b);
    }
  }
  function entries(list, title, key) {
    newPage("front"); heading(title, key);
    const size = f.fontSize, lh = size * 1.15, numW = 34, dw = tw(F.r, ".", size);
    for (const e of list) {
      const ind = e.level ? 18 : 0, lines = wrap([{ t: e.label }], size, CW - ind - numW, 0, fontFor, safe);
      ensure(lh * lines.length + 6);
      lines.forEach((ln, i) => {
        if (y - lh < M && y < H - M - 0.5) newPage(cur.sec);
        const base = y - lh + size * 0.22; drawSegs(cur.page, ln, M + ind, base, size, 0, rgb);
        if (i === lines.length - 1) {
          const num = pageMap[e.key] ?? "00", nw = tw(F.r, num, size), x0 = M + ind + ln.w + 4, n = Math.floor((W - M - nw - 4 - x0) / dw);
          if (n > 0) cur.page.drawText(".".repeat(n), { x: x0, y: base, size, font: F.r }); cur.page.drawText(num, { x: W - M - nw, y: base, size, font: F.r });
        }
        y -= lh;
      });
      y -= 6;
    }
  }

  // ---- Title page ----
  newPage("title");
  const at = (frac) => H * (1 - frac), tp = (txt, frac, o = {}) => { if (String(txt || "").trim()) para(plainRuns(txt, o.b ? { b: true } : {}), { ls: 1, align: "center", at: at(frac), size: o.size }); };
  tp(P.title || "Research title", 0.1, { b: true, size: f.chapterSize }); tp(fill(m.introStatement, P), 0.25); tp(fill(m.degreeStatement, P), 0.49);
  tp(m.authorList.map(authorStr).filter(Boolean).join("\n"), 0.675); tp(m.submissionDate, 0.86);
  // ---- Approval sheet ----
  newPage("front"); begin("approval"); para([{ t: "APPROVAL SHEET", b: true }], { ls: 1, align: "center", after: 14, size: f.fontSize });
  para(plainRuns(fill(m.approvalStatement, P)), { align: "justify", indent: f.indent * 72, after: 10 });
  if (m.certification.trim()) para(plainRuns(fill(m.certification, P)), { align: "justify", indent: f.indent * 72, after: 10 });
  const by = (r) => m.signatories.filter((s) => s.role === r), ch = by("Chairperson"), mem = by("Panel Member"), sw = CW * 0.5;
  y -= 22; by("Adviser").forEach((s) => { sig(s, M + CW - sw - 10, sw); y -= 40; });
  if (ch.length || mem.length) {
    ensure(90); para([{ t: "PANEL OF EXAMINERS", b: true }], { ls: 1, align: "center", after: 6, size: f.fontSize });
    if (m.gradeStatement.trim()) para(plainRuns(fill(m.gradeStatement, P)), { ls: 1.5, align: "justify", indent: f.indent * 72, after: 8 });
  }
  y -= 18; ch.forEach((s) => { sig(s, M + (CW - sw) / 2, sw); y -= 40; });
  const row = [...mem, ...by("Other")]; for (let i = 0; i < row.length; i += 2) { const yy = y; sig(row[i], M, CW * 0.45); if (row[i + 1]) { y = yy; sig(row[i + 1], M + CW * 0.55, CW * 0.45); } y -= 40; }
  if (m.acceptanceStatement.trim()) para(plainRuns(fill(m.acceptanceStatement, P)), { align: "justify", indent: f.indent * 72, after: 14 });
  y -= 24; ensure(60); { const yy = y; centered(cur.page, m.submissionDate || "Month YYYY", F.b, f.fontSize, M + 60, yy - 13, true); centered(cur.page, "Date", F.r, f.fontSize, M + 60, yy - 27);
    const deans = by("Dean"); deans.forEach((s, i) => { y = yy; sig(s, M + CW * 0.52, CW * 0.48); y -= 40; }); }
  // ---- Abstract, acknowledgement ----
  const get = (id) => data.chapters.find((c) => c.id === id);
  if (get("abstract")) { newPage("front"); heading("ABSTRACT", "abstract"); await blocks(get("abstract"), { ls: 1 }); }
  if (get("acknowledgement")) { newPage("front"); heading("ACKNOWLEDGEMENT", "ack"); await blocks(get("acknowledgement")); }
  // ---- Contents and lists ----
  const mains = data.mains, tables = [...data.media].filter(([, v]) => v.kind === "table"), figs = [...data.media].filter(([, v]) => v.kind === "figure");
  const toc = [{ label: "APPROVAL SHEET", key: "approval" }, { label: "ABSTRACT", key: "abstract" }, { label: "ACKNOWLEDGEMENT", key: "ack" }, { label: "TABLE OF CONTENTS", key: "toc" }];
  if (tables.length) toc.push({ label: "LIST OF TABLES", key: "lot" }); if (figs.length) toc.push({ label: "LIST OF FIGURES", key: "lof" });
  mains.forEach((c, n) => { toc.push({ label: `CHAPTER ${n + 1}. ${c.title.toUpperCase()}`, key: "ch" + n }); const nn = data.nums(c); c.blocks.forEach((b, i) => { if (b.type === "h1" && plain(b.html)) toc.push({ label: `${nn[i]} ${plain(b.html).toUpperCase()}`, key: "b_" + b.id, level: 1 }); }); });
  if (get("appendices")) toc.push({ label: get("appendices").title.toUpperCase(), key: "app" });
  entries(toc, "TABLE OF CONTENTS", "toc");
  if (tables.length) entries(tables.map(([id, v]) => ({ label: `Table ${v.num}. ${v.caption || "(no caption)"}`, key: "tbl_" + id })), "LIST OF TABLES", "lot");
  if (figs.length) entries(figs.map(([id, v]) => ({ label: `Figure ${v.num}. ${v.caption || "(no caption)"}`, key: "fig_" + id })), "LIST OF FIGURES", "lof");
  // ---- Chapters and appendix ----
  for (let n = 0; n < mains.length; n++) { newPage("body"); heading(`CHAPTER ${n + 1}. ${mains[n].title.toUpperCase()}`, "ch" + n); await blocks(mains[n]); }
  if (get("appendices")) { newPage("body"); heading(get("appendices").title.toUpperCase(), "app"); await blocks(get("appendices")); }
  // ---- Page numbers: title unnumbered, front matter roman (ii...), body arabic from 1 ----
  let fi = 0, bi = 0; pages.forEach((p) => { p.label = p.sec === "title" ? (fi++, null) : p.sec === "front" ? roman(++fi) : String(++bi); });
  pages.forEach((p) => { if (p.label) { const w = tw(F.r, p.label, f.fontSize); p.page.drawText(p.label, { x: (W - w) / 2, y: M / 2 - 4, size: f.fontSize, font: F.r }); } });
  const out = {}; for (const [k, i] of Object.entries(marks)) out[k] = pages[i]?.label || ""; return { pdf, marks: out, pageCount: pages.length };
}

// data: { project, chapters, mains, nums(chapter), media: Map(blockId -> {kind, num, caption}), loadImage? }
export async function buildPdf(data, lib) {
  const L = lib || (await getLib()), imgCache = new Map(), loadImage = data.loadImage || defaultLoad;
  let map = {}, res;
  for (let i = 0; i < 4; i++) { res = await onePass(L, data, map, imgCache, loadImage); if (JSON.stringify(res.marks) === JSON.stringify(map)) break; map = res.marks; }
  return { bytes: await res.pdf.save(), pages: res.pageCount };
}
