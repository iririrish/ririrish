import { watchAuth } from "./auth.js";
import { getProject } from "./projects.js";
import { block, clean, text, LIST_CSS, LIST_LABELS, loadChapters, saveChapter, removeChapter, ensureDefaults, saveMeta, DEFAULT_FORMAT, ConflictError, touchProject } from "./doc-model.js";
import { renderSpecial } from "./frontmatter.js";
import { figBody, tblBody, newTable } from "./blocks-media.js";
import { prepareImage, uploadImage, deleteImage, updateCaption } from "./images.js";
import { storageReady } from "./supabase-config.js";
import { initHistory } from "./history.js";
import { initPreview, showPdf, setBusy, setMessage, setStale } from "./preview.js";

const $ = (s) => document.querySelector(s);
const pid = new URLSearchParams(location.search).get("id");
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v; else if (k.startsWith("on")) e[k] = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...kids); return e;
}
let project, chs = [], curId = null, canEdit = false, focusId = null, toFocus = null, started = false;
const collapsed = {}, dirty = new Set(), H = {};
let saveT, commitT, statusT;
const cur = () => chs.find((c) => c.id === curId);
const mains = (l = chs) => l.filter((c) => c.kind === "main").sort((a, b) => a.order - b.order);
const lvl = (b) => (b.type === "h1" ? 1 : b.type === "h2" ? 2 : b.type === "h3" ? 3 : 9);
let me, mm = new Map(), replaceTarget = null;
const toast = (m, ok) => { const t = $("#toast"); t.textContent = m; t.className = "toast show" + (ok ? "" : " err"); setTimeout(() => (t.className = "toast"), 4000); };

// ---------- Save + undo ----------
function setState(s, msg) {
  const el = $("#save"); el.className = "save " + s;
  el.textContent = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes", offline: "Offline. Changes will save when you reconnect.", conflict: "Changed elsewhere. Click to resolve.", error: "Save failed: " + (msg || "") + " (click to retry)" }[s];
}
function markDirty(id = curId) {
  if (!canEdit) return; setStale(true); dirty.add(id); setState("unsaved"); firstDirty ||= Date.now();
  clearTimeout(saveT); saveT = setTimeout(flush, Date.now() - firstDirty > 20000 ? 0 : 1500); // wait for a pause, but never longer than 20 s
}
let saved = {}, savedMeta = "", savingP = null, again = false, firstDirty = 0, retryT, conflictOpen = false;
const sig = (c) => JSON.stringify([c.title, c.order, c.blocks]), metaSig = () => JSON.stringify([project.title, project.meta, project.format]);
function initSaved() { saved = {}; chs.forEach((c) => (saved[c.id] = sig(c))); savedMeta = metaSig(); }
function conflict() {
  setState("conflict"); if (conflictOpen) return; conflictOpen = true; const d = $("#conflict-dlg"); d.returnValue = "";
  d.onclose = () => { conflictOpen = false; if (d.returnValue === "reload") { dirty.clear(); location.reload(); } else if (d.returnValue === "keep") flush(true); };
  d.showModal();
}
function flush(force) {
  clearTimeout(saveT); commitNow();
  if (savingP) { again = true; return savingP; }
  savingP = doFlush(force === true).finally(() => { savingP = null; if (again) { again = false; if (dirty.size) flush(); } });
  return savingP;
}
async function doFlush(force) {
  if (!dirty.size) return;
  const ids = [...dirty]; dirty.clear(); setState("saving"); let wrote = false;
  try {
    for (const id of ids) { // only changed content is written
      if (id === "__meta") { const j = metaSig(); if (force || j !== savedMeta) { await saveMeta(pid, project, force); savedMeta = j; wrote = "meta"; } continue; }
      const c = chs.find((x) => x.id === id); if (!c) continue;
      const j = sig(c); if (!force && saved[id] === j) continue;
      await saveChapter(pid, c, force); saved[id] = j; wrote ||= true;
    }
    if (wrote === true) await touchProject(pid);
    firstDirty = 0; setState(dirty.size ? "unsaved" : "saved");
  } catch (e) {
    console.error(e); ids.forEach((i) => dirty.add(i));
    if (e instanceof ConflictError) conflict();
    else if (!navigator.onLine || ["unavailable", "deadline-exceeded"].includes(e.code)) { setState("offline"); clearTimeout(retryT); retryT = setTimeout(() => flush(), 8000); }
    else setState("error", e.message);
  }
}
const hist = (c) => (H[c.id] ||= { u: [JSON.stringify(c.blocks)], r: [] });
function commitNow() {
  clearTimeout(commitT); const c = cur(); if (!c) return;
  const x = hist(c), j = JSON.stringify(c.blocks);
  if (j !== x.u.at(-1)) { x.u.push(j); if (x.u.length > 100) x.u.shift(); x.r = []; }
}
const schedule = () => { clearTimeout(commitT); commitT = setTimeout(commitNow, 600); };
function restore(c) { markDirty(); renderEditor(); renderOutline(); renderStatus(); }
function undo() { if (!canEdit || !cur()) return; commitNow(); const c = cur(), x = hist(c); if (x.u.length < 2) return; x.r.push(x.u.pop()); c.blocks = JSON.parse(x.u.at(-1)); restore(c); }
function redo() { if (!canEdit || !cur()) return; commitNow(); const c = cur(), x = hist(c); if (!x.r.length) return; const j = x.r.pop(); x.u.push(j); c.blocks = JSON.parse(j); restore(c); }
function mutate(fn) {
  commitNow(); if (fn(cur().blocks) === false) return;
  commitNow(); markDirty(); renderEditor(); renderOutline(); renderStatus();
}
const fi = () => { const bl = cur().blocks, i = bl.findIndex((b) => b.id === focusId); return i < 0 ? bl.length - 1 : i; };

// ---------- Block operations ----------
const endOf = (bl, i) => { let j = i + 1; if (lvl(bl[i]) === 9) return j; while (j < bl.length && lvl(bl[j]) > lvl(bl[i])) j++; return j; };
function moveBlock(i, d) {
  mutate((bl) => {
    const L = lvl(bl[i]);
    if (L === 9) { const j = i + d; if (j < 0 || j >= bl.length) return false; [bl[i], bl[j]] = [bl[j], bl[i]]; return; }
    const e = endOf(bl, i);
    if (d > 0) {
      if (e >= bl.length || lvl(bl[e]) < L) return false;
      const e2 = endOf(bl, e), seg = bl.splice(i, e - i); bl.splice(e2 - seg.length, 0, ...seg);
    } else {
      let j = i - 1; if (j < 0) return false;
      while (j >= 0 && lvl(bl[j]) > L) j--;
      if (j >= 0 && lvl(bl[j]) < L) return false;
      if (j < 0) j = 0;
      const seg = bl.splice(i, e - i); bl.splice(j, 0, ...seg);
    }
    toFocus = bl.find((b) => b.id === focusId)?.id || null;
  });
}
function insertAfter(i, nb) { mutate((bl) => { bl.splice(i + 1, 0, nb); toFocus = nb.id; }); }
function removeBlock(i) {
  mutate((bl) => { const prev = bl[i - 1] || bl[i + 1]; bl.splice(i, 1); if (!bl.length) bl.push(block()); toFocus = prev?.id || bl[0].id; });
}
function shiftLevel(i, d) { mutate((bl) => { const T = ["h1", "h2", "h3"], k = T.indexOf(bl[i].type) + d; if (k < 0 || k > 2) return false; bl[i].type = T[k]; toFocus = bl[i].id; }); }
function align(v) { if (!canEdit || !cur()) return; mutate((bl) => { const b = bl.find((x) => x.id === focusId); if (!b) return false; b.align = v; toFocus = b.id; }); }

// ---------- Rendering ----------
function nums(c, l = chs) {
  const r = []; let s = 0, ss = 0, sss = 0;
  const n = c.kind === "main" ? mains(l).findIndex((x) => x.id === c.id) + 1 : 0;
  for (const b of c.blocks) {
    if (b.type === "h1") { s++; ss = 0; sss = 0; r.push(n ? `${n}.${s}` : ""); }
    else if (b.type === "h2") { ss++; sss = 0; r.push(n ? `${n}.${s}.${ss}` : ""); }
    else if (b.type === "h3") { sss++; r.push(n ? `${n}.${s}.${ss}.${sss}` : ""); }
    else r.push("");
  }
  return r;
}
function focusEnd(el) {
  el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function blockEl(b, i, num) {
  const wrap = h("div", { class: "blk " + b.type, "data-id": b.id });
  const ctl = h("div", { class: "ctl" },
    h("button", { title: "Move up", "aria-label": "Move up", onclick: () => moveBlock(i, -1) }, "↑"),
    h("button", { title: "Move down", "aria-label": "Move down", onclick: () => moveBlock(i, 1) }, "↓"));
  if (lvl(b) < 9) ctl.append(h("button", { title: "Promote (section ← subsection)", onclick: () => shiftLevel(i, -1) }, "←"), h("button", { title: "Demote (section → subsection)", onclick: () => shiftLevel(i, 1) }, "→"));
  ctl.append(h("button", { title: "Delete", "aria-label": "Delete block", onclick: () => (b.type === "fig" && b.imageId ? delFigure(b) : removeBlock(i)) }, "✕"));
  if (b.type === "fig" || b.type === "tbl") {
    if (canEdit) wrap.append(ctl);
    const k = mm.get(b.id)?.num || 1;
    wrap.append(b.type === "fig" ? figBody(b, M(), k) : tblBody(b, M(), k)); return wrap;
  }
  let ed;
  if (b.type === "list") { ed = h(b.listStyle === "bullet" ? "ul" : "ol", { class: "ed list" }); ed.style.listStyleType = LIST_CSS[b.listStyle || "bullet"]; ed.innerHTML = b.html || "<li><br></li>"; }
  else { ed = h("div", { class: "ed", "data-ph": "" }); ed.innerHTML = b.html; }
  if (b.align) ed.style.textAlign = b.align;
  if (canEdit) {
    ed.contentEditable = "true"; ed.spellcheck = true;
    ed.setAttribute("aria-label", { p: "Paragraph", h1: "Section heading", h2: "Subsection heading", h3: "2nd subsection heading", kw: "Keywords", list: "List" }[b.type]);
    ed.onfocus = () => (focusId = b.id);
    ed.oninput = () => {
      if (b.type === "list" && !ed.querySelector("li")) ed.innerHTML = "<li><br></li>";
      b.html = clean(ed.innerHTML); schedule(); markDirty();
      if (lvl(b) < 9) renderOutline(); clearTimeout(statusT); statusT = setTimeout(renderStatus, 300);
    };
    ed.onpaste = (e) => { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData.getData("text/plain") || "").replace(/\s*\n+\s*/g, " ")); };
    ed.onkeydown = (e) => {
      const bl = cur().blocks, idx = bl.findIndex((x) => x.id === b.id);
      if (e.key === "Enter" && !e.shiftKey && b.type !== "list" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const sc = b.type === "p" && /^\[\[(figure|table):\s*(.*?)\s*\]\]$/i.exec(text(b.html).trim());
        if (!sc) { insertAfter(idx, block()); return; }
        mutate((bl) => {
          const nb = sc[1].toLowerCase() === "figure" ? block("fig", "", { lock: true, align: "center", caption: sc[2], w: 4, h: 3, nw: 4, nh: 3 }) : block("tbl", "", { ...newTable(3, 3), caption: sc[2], label: "" });
          bl.splice(idx, 1, nb); if (!bl[idx + 1]) bl.push(block()); toFocus = bl[idx + 1].id;
        });
      }
      else if (e.key === "Backspace" && ed.textContent === "" && bl.length > 1) { e.preventDefault(); removeBlock(idx); }
    };
    wrap.append(ctl);
  } else ed.contentEditable = "false";
  if (b.type === "kw") num = "Keywords:";
  if (num) wrap.append(h("span", { class: "num" }, num));
  wrap.append(ed); return wrap;
}
function renderEditor() {
  const D = $("#doc"), special = curId.startsWith("__");
  $("#sheet").classList.toggle("bare", special); applyFormat();
  if (special) { renderSpecial(curId, ctx(), D); return; }
  const c = cur(); D.replaceChildren(); if (!c) return;
  mm = mediaMap();
  const chNo = mains().findIndex((x) => x.id === c.id) + 1;
  const title = h("textarea", { rows: 1, "aria-label": "Chapter title", readonly: c.kind !== "main" || !canEdit });
  title.value = c.title;
  const fit = () => { title.style.height = "auto"; title.style.height = title.scrollHeight + "px"; };
  title.oninput = () => { c.title = title.value.replace(/\n/g, " "); fit(); markDirty(c.id); renderTree(); renderStatus(); };
  title.onkeydown = (e) => { if (e.key === "Enter") e.preventDefault(); };
  D.append(h("div", { class: "chead" + (c.kind === "main" ? "" : " solo") }, c.kind === "main" ? h("span", { class: "k" }, `Chapter ${chNo}.`) : "", title));
  requestAnimationFrame(fit);
  const n = nums(c); c.blocks.forEach((b, i) => D.append(blockEl(b, i, n[i])));
  if (canEdit) {
    const add = (type, label) => h("button", { class: "btn", onclick: () => {
      const nb = block(type, type === "list" ? "<li><br></li>" : "", type === "list" ? { listStyle: "bullet" } : {}); insertAfter(fi(), nb);
    } }, "+ " + label);
    D.append(h("div", { class: "addbar" }, add("p", "Paragraph"), add("h1", "Section"), add("h2", "Subsection"), add("h3", "2nd subsection"), add("list", "List"), ...(c.id === "abstract" && !c.blocks.some((b) => b.type === "kw") ? [add("kw", "Keywords")] : [])));
  }
  if (toFocus) { const el = D.querySelector(`[data-id="${toFocus}"] .ed`); if (el) focusEnd(el); toFocus = null; }
}
function renderTree() {
  const T = $("#tree"); T.replaceChildren();
  const auto = (l) => h("div", { class: "ti auto" }, h("span", {}, l), h("em", {}, "auto"));
  const ia = (g, t, fn) => h("button", { class: "ia", title: t, "aria-label": t, onclick: fn }, g);
  const item = (c, label, tools) => h("div", { class: "ti" + (c.id === curId ? " on" : "") },
    h("button", { class: "tl", title: label, onclick: () => open(c.id) }, label), ...(tools || []));
  const group = (key, label, items) => {
    const open = !collapsed[key];
    T.append(h("button", { class: "grp", "aria-expanded": open, onclick: () => { collapsed[key] = open; renderTree(); } }, open ? "▾" : "▸", label));
    if (open) items.forEach((i) => T.append(i));
  };
  const get = (id) => chs.find((c) => c.id === id);
  group("front", "Front matter", [item({ id: "__title" }, "Title Page"), item({ id: "__approval" }, "Approval Sheet"), item(get("abstract"), "Abstract"), item(get("acknowledgement"), "Acknowledgement"), item({ id: "__toc" }, "Table of Contents"), item({ id: "__lot" }, "List of Tables"), item({ id: "__lof" }, "List of Figures")]);
  group("main", "Main matter", mains().map((c, i) => item(c, `Chapter ${i + 1}: ${c.title}`, canEdit ? [
    ia("↑", "Move up", () => moveCh(c, -1)), ia("↓", "Move down", () => moveCh(c, 1)), ia("✎", "Rename", () => renameCh(c)), ia("✕", "Delete chapter", () => deleteCh(c))] : [])));
  group("back", "Back matter", [auto("Bibliography"), item(get("appendices"), "Appendices")]);
  $("#add-ch").hidden = !canEdit;
}
function renderOutline() {
  const O = $("#outline"), c = cur(); O.replaceChildren(); if (!c) return;
  const n = nums(c); let any = false;
  c.blocks.forEach((b, i) => {
    if (lvl(b) === 9) return; any = true;
    O.append(h("button", { class: "ol l" + lvl(b), onclick: () => jump(b.id) }, `${n[i] ? n[i] + " " : ""}${text(b.html).trim() || "(untitled)"}`));
  });
  if (!any) O.append(h("p", { class: "meta noheads" }, "Add a section to see it here."));
}
function jump(id) {
  const el = $(`#doc [data-id="${id}"]`); if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1300);
  el.querySelector(".ed")?.focus({ preventScroll: true });
}
function renderStatus() {
  const words = chs.reduce((n, c) => n + c.blocks.reduce((m, b) => m + (text(b.html).trim().split(/\s+/).filter(Boolean).length), 0), 0);
  $("#st-words").textContent = `${words.toLocaleString()} words`;
  $("#st-pages").textContent = `About ${Math.max(1, Math.ceil(words / 275))} pages double-spaced`;
  const c = cur(); $("#st-chap").textContent = c ? `Now editing: ${c.kind === "main" ? `Chapter ${mains().findIndex((x) => x.id === c.id) + 1}: ` : ""}${c.title}` : "";
  if (curId === "abstract") {
    const c = cur(), w = c.blocks.filter((b) => b.type !== "kw").reduce((n, b) => n + text(b.html).trim().split(/\s+/).filter(Boolean).length, 0);
    const k = c.blocks.filter((b) => b.type === "kw").reduce((n, b) => n + text(b.html).split(/[,;]/).filter((x) => x.trim()).length, 0);
    $("#st-chap").textContent += ` · Abstract: ${w} words (200–250), ${k} keywords (min 5)`;
  }
  if (curId?.startsWith("__")) $("#st-chap").textContent = "Now editing: " + { __title: "Title Page", __approval: "Approval Sheet", __toc: "Table of Contents", __lot: "List of Tables", __lof: "List of Figures" }[curId];
}
const renderAll = () => { renderTree(); renderEditor(); renderOutline(); renderStatus(); };
function open(id) { commitNow(); curId = id; focusId = null; document.body.classList.remove("show-left"); renderAll(); $(".center").scrollTop = 0; }

// ---------- Chapters ----------
function ask(title, val) {
  return new Promise((res) => {
    const d = $("#ask-dlg"), i = $("#ask-input"); $("#ask-title").textContent = title; i.value = val || "";
    d.returnValue = ""; d.onclose = () => res(d.returnValue === "ok" && i.value.trim() ? i.value.trim() : null);
    d.showModal(); i.select();
  });
}
function confirmDel(msg, title = "Delete chapter?", ok = "Delete chapter", keep = "Keep chapter") {
  return new Promise((res) => { const d = $("#conf-dlg"); $("#conf-text").textContent = msg; $("#conf-title").textContent = title; $("#conf-ok").textContent = ok; $("#conf-keep").textContent = keep; d.returnValue = ""; d.onclose = () => res(d.returnValue === "ok"); d.showModal(); });
}
async function addChapter() {
  const t = await ask("New chapter title", "Untitled chapter"); if (!t) return;
  const c = { id: "c_" + Math.random().toString(36).slice(2, 10), kind: "main", title: t, order: Math.max(-1, ...mains().map((x) => x.order)) + 1, blocks: [block()] };
  chs.push(c); markDirty(c.id); open(c.id); flush();
}
function moveCh(c, d) {
  const l = mains(), i = l.indexOf(c), o = l[i + d]; if (!o) return;
  [c.order, o.order] = [o.order, c.order]; markDirty(c.id); markDirty(o.id); renderTree(); renderEditor(); renderStatus();
}
async function renameCh(c) { const t = await ask("Rename chapter", c.title); if (!t) return; c.title = t; markDirty(c.id); renderAll(); }
async function deleteCh(c) {
  if (!(await confirmDel(`“${c.title}” and everything written in it will be permanently deleted.`))) return;
  try { await removeChapter(pid, c.id); } catch (e) { toast("Could not delete: " + e.message); return; }
  chs = chs.filter((x) => x.id !== c.id); dirty.delete(c.id); delete H[c.id];
  if (curId === c.id) curId = (mains()[0] || chs[0]).id; renderAll();
}

// ---------- Template settings ----------
const ctx = () => ({ project, canEdit, h, text, media: mediaList, chs: () => chs, mains, nums, dirty: () => { markDirty("__meta"); $("#ptitle").textContent = project.title; renderStatus(); } });
function applyFormat() {
  const f = project.format, st = $(".center").style, a4 = f.paper === "a4";
  Object.entries({ "--ff": `"${f.fontFamily}"`, "--fs": f.fontSize + "pt", "--lh": f.lineSpacing, "--ind": f.indent + "in", "--al": f.align, "--mg": f.margin + "in", "--cs": f.chapterSize + "pt", "--pw": a4 ? "8.27in" : "8.5in", "--ph": a4 ? "11.69in" : "11in" })
    .forEach(([k, v]) => st.setProperty(k, v));
  $("#sheet").classList.toggle("single", curId === "abstract");
}
const FMT = [["fontFamily", "Font", "select", ["Times New Roman", "Arial", "Georgia"]], ["fontSize", "Body font size (pt)", "number", [10, 14, 0.5]],
  ["paper", "Paper size", "select", [["letter", "US Letter"], ["a4", "A4"]]], ["margin", "Margins (inches, all sides)", "number", [0.5, 2, 0.25]],
  ["lineSpacing", "Line spacing", "select", [["1", "Single"], ["1.5", "1.5 lines"], ["2", "Double"]]], ["indent", "Paragraph indent (inches)", "number", [0, 1, 0.25]],
  ["align", "Alignment", "select", [["justify", "Justified"], ["left", "Left"]]], ["chapterSize", "Chapter heading size (pt)", "number", [12, 18, 1]]];
function openFormat() {
  const B = $("#fmt-body"); B.replaceChildren();
  FMT.forEach(([k, label, type, o]) => {
    const f = project.format; let i;
    if (type === "select") { i = h("select", {}, ...o.map((x) => { const [v, t] = Array.isArray(x) ? x : [x, x]; return h("option", { value: v }, t); })); }
    else i = h("input", { type: "number", min: o[0], max: o[1], step: o[2] });
    i.value = f[k]; i.disabled = !canEdit;
    i.onchange = () => { const n = typeof DEFAULT_FORMAT[k] === "number"; const v = n ? parseFloat(i.value) : i.value; if (n && !(v >= (o[0] ?? 0))) { i.value = f[k]; return; } f[k] = v; markDirty("__meta"); applyFormat(); };
    B.append(h("label", {}, label, i));
  });
  $("#fmt-restore").hidden = !canEdit; if (!$("#fmt-dlg").open) $("#fmt-dlg").showModal();
}
$("#fmt-btn").onclick = openFormat;
$("#fmt-restore").onclick = () => { project.format = { ...DEFAULT_FORMAT }; markDirty("__meta"); applyFormat(); openFormat(); };

// ---------- Images and tables ----------
const M = () => ({ h, canEdit, project, maxW: () => (project.format.paper === "a4" ? 8.27 : 8.5) - 2 * project.format.margin,
  touch: (s) => { if (s) commitNow(); else schedule(); markDirty(); }, toast, pick: (b) => pickImage(b), delFig: (b) => delFigure(b),
  removeBlock: (b) => { const i = cur().blocks.findIndex((x) => x.id === b.id); if (i >= 0) removeBlock(i); },
  syncCaption: (b) => b.imageId && updateCaption(pid, b.imageId, b.caption) });
const docOrder = (l = chs) => [...l.filter((c) => c.kind === "front").sort((a, b) => a.order - b.order), ...mains(l), ...l.filter((c) => c.kind === "back").sort((a, b) => a.order - b.order)];
function mediaMap(l = chs) {
  const m = new Map(); let f = 0, t = 0;
  for (const c of docOrder(l)) for (const b of c.blocks) {
    if (b.type === "fig") m.set(b.id, { kind: "figure", num: ++f, caption: b.caption }); else if (b.type === "tbl") m.set(b.id, { kind: "table", num: ++t, caption: b.caption });
  }
  return m;
}
const mediaList = (kind) => [...mediaMap().values()].filter((x) => x.kind === kind);
async function delFigure(b) {
  if (!(await confirmDel("This image will be permanently deleted from storage and cannot be undone.", "Delete image?", "Delete image", "Keep image"))) return;
  try { await deleteImage(pid, b.imageId, b.path); } catch (e) { toast(e.message); return; }
  const c = cur(), i = c.blocks.findIndex((x) => x.id === b.id); if (i < 0) return;
  c.blocks.splice(i, 1); if (!c.blocks.length) c.blocks.push(block());
  delete H[c.id]; markDirty(); renderEditor(); renderOutline(); renderStatus(); flush();
}
const fileIn = $("#img-file");
function pickImage(b) { if (!canEdit || !cur()) return; replaceTarget = b || null; fileIn.value = ""; fileIn.click(); }
fileIn.onchange = () => { const f = fileIn.files[0]; if (f) startImage(f, replaceTarget); replaceTarget = null; };
$("#tb-img").onclick = () => pickImage(null);
async function startImage(file, rb) {
  if (!canEdit || !cur()) return;
  if (!storageReady) { toast("Image storage is not set up yet. Add your Supabase URL and anon key in js/supabase-config.js (see README)."); return; }
  let prep; try { prep = await prepareImage(file); } catch (e) { toast(e.message); return; }
  const d = $("#img-dlg"), idx = fi();
  $("#img-prev").src = prep.url; $("#img-info").textContent = `${file.name} · ${prep.width}×${prep.height}px · ${Math.round(prep.blob.size / 1024)} KB after compression`;
  $("#img-cap").value = rb?.caption || ""; $("#img-alt").value = rb?.alt || ""; $("#img-ok").textContent = rb ? "Replace image" : "Insert image";
  d.returnValue = "";
  d.onclose = async () => {
    URL.revokeObjectURL(prep.url); if (d.returnValue !== "ok") return;
    const caption = $("#img-cap").value.trim(), alt = $("#img-alt").value.trim();
    try {
      toast("Uploading image…", true); const rec = await uploadImage(pid, me, prep, caption);
      const w = +Math.min(M().maxW(), 5, prep.width / 96).toFixed(2);
      const patch = { imageId: rec.id, url: rec.imageUrl, path: rec.storagePath, nw: prep.width, nh: prep.height, w, h: +(w * prep.height / prep.width).toFixed(2), lock: true, align: "center", caption, alt };
      if (rb) {
        const old = { id: rb.imageId, path: rb.path };
        mutate((bl) => { const b = bl.find((x) => x.id === rb.id); if (!b) return false; Object.assign(b, patch); });
        if (old.id) deleteImage(pid, old.id, old.path).catch(console.error);
      } else mutate((bl) => { bl.splice(idx + 1, 0, block("fig", "", patch)); });
      toast("Image added.", true);
    } catch (e) { console.error(e); toast(e.message); }
  };
  d.showModal();
}
const center = $(".center");
center.addEventListener("dragover", (e) => { if (canEdit && [...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); });
center.addEventListener("drop", (e) => {
  const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith("image/")); if (!f || !canEdit || !cur()) return;
  e.preventDefault(); const fg = e.target.closest?.(".blk.fig"), tb = fg && cur().blocks.find((x) => x.id === fg.dataset.id);
  startImage(f, tb && !tb.url ? tb : null);
});
$("#tb-tbl").onclick = () => {
  if (!canEdit || !cur()) return; const d = $("#tbl-dlg"); d.returnValue = "";
  d.onclose = () => {
    if (d.returnValue !== "ok") return;
    const r = Math.min(30, Math.max(1, parseInt($("#tbl-r").value) || 3)), c = Math.min(10, Math.max(1, parseInt($("#tbl-c").value) || 3)), idx = fi();
    mutate((bl) => { const nb = block("tbl", "", { ...newTable(r, c), caption: $("#tbl-cap").value.trim(), label: "" }); bl.splice(idx + 1, 0, nb); });
  };
  d.showModal();
};

// ---------- History glue ----------
function applyRestore(r) {
  for (const k of Object.keys(H)) delete H[k];
  chs = r.chapters.map((c) => ({ ...c, blocks: c.blocks?.length ? c.blocks.map((b) => ({ ...b, html: clean(b.html) })) : [block()] }));
  Object.assign(project, { title: r.snapshot.title, authors: r.snapshot.authors || [], meta: r.snapshot.meta, format: { ...DEFAULT_FORMAT, ...r.snapshot.format }, metaRev: r.metaRev });
  ensureDefaults(project); initSaved(); dirty.clear(); setState("saved");
  if (!curId.startsWith("__") && !chs.some((c) => c.id === curId)) curId = (mains()[0] || chs[0]).id;
  $("#ptitle").textContent = project.title; renderAll(); setStale(true);
}
async function previewVersion(v) {
  if (document.body.classList.contains("lay-editor")) setLayout("pdf");
  setBusy(true); setMessage(`Building a preview of “${v.name}”…`);
  try {
    const list = v.chapters.map((c) => ({ ...c, blocks: (c.blocks || []).map((b) => ({ ...b, html: clean(b.html) })) }));
    const { buildPdf } = await import("./pdf.js");
    const p = { ...project, title: v.snapshot.title, meta: v.snapshot.meta, format: { ...DEFAULT_FORMAT, ...v.snapshot.format } };
    const { bytes } = await buildPdf({ project: p, chapters: list, mains: mains(list), nums: (c) => nums(c, list), media: mediaMap(list) });
    await showPdf(bytes, "version_" + (v.name || "preview").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 40) + ".pdf");
    setMessage(`Previewing saved version “${v.name}”. Press Recompile to return to your current manuscript.`);
  } catch (e) { console.error(e); setMessage("Could not build the preview: " + e.message, true); }
  setBusy(false);
}
function startHistory() {
  initHistory({ h, pid: () => pid, me: () => me, canEdit: () => canEdit, toast, confirm: confirmDel,
    snapshot: () => ({ title: project.title, authors: project.authors || [], meta: project.meta, format: project.format, metaRev: project.metaRev || 0, chapters: chs }),
    flush: async () => { await flush(); if (dirty.size) throw new Error("Your latest changes are not saved yet. Try again once you are online."); },
    applyRestore, previewVersion });
}
$("#save").onclick = () => { const s = $("#save").className; if (s.includes("conflict")) conflict(); else if (s.includes("error") || s.includes("offline")) flush(); };
addEventListener("online", () => { if (dirty.size) flush(); });

// ---------- PDF preview and layout modes ----------
let compiled = false, compiling = false;
async function recompile() {
  if (compiling) return; compiling = true; setBusy(true); setMessage("Compiling…");
  try {
    const { buildPdf } = await import("./pdf.js");
    const { bytes } = await buildPdf({ project, chapters: chs, mains: mains(), nums, media: mediaMap() });
    await showPdf(bytes, ((project.title || "manuscript").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "manuscript") + ".pdf");
    compiled = true; setMessage("");
  } catch (e) { console.error(e); setMessage("Could not compile the PDF: " + e.message, true); }
  compiling = false; setBusy(false);
}
function setLayout(l) {
  document.body.classList.remove("lay-split", "lay-editor", "lay-pdf"); document.body.classList.add("lay-" + l);
  document.querySelectorAll("[data-lay]").forEach((b) => b.classList.toggle("on", b.dataset.lay === l));
  try { localStorage.setItem("ririrish-layout", l); } catch { /* preference only */ }
  if (l !== "editor" && !compiled && !compiling && project) recompile();
}
function startPreview() {
  initPreview({ compile: $("#pv-compile"), prev: $("#pv-prev"), next: $("#pv-next"), zin: $("#pv-zin"), zout: $("#pv-zout"), fit: $("#pv-fit"), dl: $("#pv-dl"),
    page: $("#pv-page"), zoom: $("#pv-zoom"), stale: $("#pv-stale"), msg: $("#pv-msg"), scroll: $("#pv-scroll"), pages: $("#pv-pages") }, { onCompile: recompile });
  let l = "split"; try { l = localStorage.getItem("ririrish-layout") || "split"; } catch { /* default */ }
  setLayout(["split", "editor", "pdf"].includes(l) ? l : "split");
}
document.querySelectorAll("[data-lay]").forEach((b) => (b.onclick = () => { setLayout(b.dataset.lay); $("#lay-menu").open = false; }));
document.addEventListener("click", (e) => { const m = $("#lay-menu"); if (m.open && !m.contains(e.target)) m.open = false; });

// ---------- Toolbar, shortcuts, init ----------
document.querySelectorAll("[data-cmd]").forEach((b) => {
  b.onmousedown = (e) => e.preventDefault();
  b.onclick = () => {
    const c = b.dataset.cmd;
    if (c === "undo") return undo(); if (c === "redo") return redo();
    if (c.startsWith("align-")) return align(c.slice(6));
    if (document.activeElement?.closest?.("#doc .ed")) document.execCommand(c);
  };
});
const ls = $("#list-style");
Object.entries(LIST_LABELS).forEach(([k, v]) => ls.append(h("option", { value: k }, v)));
ls.onchange = () => {
  const v = ls.value; ls.value = ""; if (!v || !canEdit || !cur()) return;
  mutate((bl) => {
    const i = fi(), b = bl[i];
    if (b && b.type === "list") { b.listStyle = v; toFocus = b.id; }
    else { const nb = block("list", "<li><br></li>", { listStyle: v }); bl.splice(i + 1, 0, nb); toFocus = nb.id; }
  });
};
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey)) return; const k = e.key.toLowerCase();
  if (k === "s") { e.preventDefault(); flush(); return; }
  if (!e.target.closest?.("#doc .ed")) return;
  if (k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (k === "y") { e.preventDefault(); redo(); }
  else if (k === "b" || k === "i" || k === "u") { e.preventDefault(); document.execCommand({ b: "bold", i: "italic", u: "underline" }[k]); }
});
$("#add-ch").onclick = addChapter;
$("#toggle-left").onclick = () => document.body.classList.toggle("show-left");
addEventListener("beforeunload", (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ""; } });
document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });

watchAuth(async (u) => {
  if (started) return;
  if (!u) { location.replace("index.html"); return; }
  started = true; me = u;
  try {
    project = pid && (await getProject(pid));
    if (!project) { $("#ptitle").textContent = "Project not found"; return; }
    $("#ptitle").textContent = project.title; document.title = project.title + " — ririrish";
    canEdit = project.ownerId === u.uid;
    $("#roban").hidden = canEdit; $(".toolbar").classList.toggle("ro", !canEdit);
    ensureDefaults(project); chs = await loadChapters(pid); curId = (mains()[0] || chs[0]).id; initSaved();
    setState("saved"); renderAll(); startPreview(); startHistory();
  } catch (e) { console.error(e); $("#ptitle").textContent = "Could not open this project"; toast(e.message); }
});
