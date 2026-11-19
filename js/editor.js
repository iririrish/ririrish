import { watchAuth } from "./auth.js";
import { getProject } from "./projects.js";
import { block, clean, text, LIST_CSS, LIST_LABELS, loadChapters, saveChapter, removeChapter } from "./doc-model.js";

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
const mains = () => chs.filter((c) => c.kind === "main").sort((a, b) => a.order - b.order);
const lvl = (b) => (b.type === "h1" ? 1 : b.type === "h2" ? 2 : 9);
const toast = (m) => { const t = $("#toast"); t.textContent = m; t.className = "toast show err"; setTimeout(() => (t.className = "toast"), 4000); };

// ---------- Save + undo ----------
function setState(s, msg) {
  const el = $("#save"); el.className = "save " + s;
  el.textContent = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes", error: "Save failed: " + (msg || "") }[s];
}
function markDirty(id = curId) { if (!canEdit) return; dirty.add(id); setState("unsaved"); clearTimeout(saveT); saveT = setTimeout(flush, 1500); }
async function flush() {
  clearTimeout(saveT); commitNow(); if (!dirty.size) return;
  const ids = [...dirty]; dirty.clear(); setState("saving");
  try {
    await Promise.all(ids.map((id) => { const c = chs.find((x) => x.id === id); return c && saveChapter(pid, c); }));
    setState(dirty.size ? "unsaved" : "saved");
  } catch (e) { console.error(e); ids.forEach((i) => dirty.add(i)); setState("error", e.message); }
}
const hist = (c) => (H[c.id] ||= { u: [JSON.stringify(c.blocks)], r: [] });
function commitNow() {
  clearTimeout(commitT); const c = cur(); if (!c) return;
  const x = hist(c), j = JSON.stringify(c.blocks);
  if (j !== x.u.at(-1)) { x.u.push(j); if (x.u.length > 100) x.u.shift(); x.r = []; }
}
const schedule = () => { clearTimeout(commitT); commitT = setTimeout(commitNow, 600); };
function restore(c) { markDirty(); renderEditor(); renderOutline(); renderStatus(); }
function undo() { if (!canEdit) return; commitNow(); const c = cur(), x = hist(c); if (x.u.length < 2) return; x.r.push(x.u.pop()); c.blocks = JSON.parse(x.u.at(-1)); restore(c); }
function redo() { if (!canEdit) return; commitNow(); const c = cur(), x = hist(c); if (!x.r.length) return; const j = x.r.pop(); x.u.push(j); c.blocks = JSON.parse(j); restore(c); }
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
function toggleLevel(i) { mutate((bl) => { bl[i].type = bl[i].type === "h1" ? "h2" : "h1"; toFocus = bl[i].id; }); }
function align(v) { if (!canEdit) return; mutate((bl) => { const b = bl.find((x) => x.id === focusId); if (!b) return false; b.align = v; toFocus = b.id; }); }

// ---------- Rendering ----------
function nums(c) {
  const r = []; let s = 0, ss = 0;
  const n = c.kind === "main" ? mains().findIndex((x) => x.id === c.id) + 1 : 0;
  for (const b of c.blocks) {
    if (b.type === "h1") { s++; ss = 0; r.push(n ? `${n}.${s}` : ""); }
    else if (b.type === "h2") { ss++; r.push(n ? `${n}.${s}.${ss}` : ""); }
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
  if (lvl(b) < 9) ctl.append(h("button", { title: b.type === "h1" ? "Make subsection" : "Make section", onclick: () => toggleLevel(i) }, "⇆"));
  ctl.append(h("button", { title: "Delete", "aria-label": "Delete block", onclick: () => removeBlock(i) }, "✕"));
  let ed;
  if (b.type === "list") { ed = h(b.listStyle === "bullet" ? "ul" : "ol", { class: "ed list" }); ed.style.listStyleType = LIST_CSS[b.listStyle || "bullet"]; ed.innerHTML = b.html || "<li><br></li>"; }
  else { ed = h("div", { class: "ed", "data-ph": "" }); ed.innerHTML = b.html; }
  if (b.align) ed.style.textAlign = b.align;
  if (canEdit) {
    ed.contentEditable = "true"; ed.spellcheck = true;
    ed.setAttribute("aria-label", { p: "Paragraph", h1: "Section heading", h2: "Subsection heading", list: "List" }[b.type]);
    ed.onfocus = () => (focusId = b.id);
    ed.oninput = () => {
      if (b.type === "list" && !ed.querySelector("li")) ed.innerHTML = "<li><br></li>";
      b.html = clean(ed.innerHTML); schedule(); markDirty();
      if (lvl(b) < 9) renderOutline(); clearTimeout(statusT); statusT = setTimeout(renderStatus, 300);
    };
    ed.onpaste = (e) => { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData.getData("text/plain") || "").replace(/\s*\n+\s*/g, " ")); };
    ed.onkeydown = (e) => {
      const bl = cur().blocks, idx = bl.findIndex((x) => x.id === b.id);
      if (e.key === "Enter" && !e.shiftKey && b.type !== "list" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); insertAfter(idx, block()); }
      else if (e.key === "Backspace" && ed.textContent === "" && bl.length > 1) { e.preventDefault(); removeBlock(idx); }
    };
    wrap.append(ctl);
  } else ed.contentEditable = "false";
  if (num) wrap.append(h("span", { class: "num" }, num));
  wrap.append(ed); return wrap;
}
function renderEditor() {
  const c = cur(), D = $("#doc"); D.replaceChildren(); if (!c) return;
  const label = { main: `Chapter ${mains().findIndex((x) => x.id === c.id) + 1}`, front: "Front matter", back: "Back matter" }[c.kind];
  const title = h("input", { value: c.title, "aria-label": "Chapter title", readonly: c.kind !== "main" || !canEdit });
  title.oninput = () => { c.title = title.value; markDirty(c.id); renderTree(); renderStatus(); };
  D.append(h("div", { class: "chead" }, h("div", { class: "k" }, label), title));
  const n = nums(c); c.blocks.forEach((b, i) => D.append(blockEl(b, i, n[i])));
  if (canEdit) {
    const add = (type, label) => h("button", { class: "btn", onclick: () => {
      const nb = block(type, type === "list" ? "<li><br></li>" : "", type === "list" ? { listStyle: "bullet" } : {}); insertAfter(fi(), nb);
    } }, "+ " + label);
    D.append(h("div", { class: "addbar" }, add("p", "Paragraph"), add("h1", "Section"), add("h2", "Subsection"), add("list", "List")));
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
  group("front", "Front matter", [auto("Title Page"), auto("Approval Sheet"), item(get("acknowledgement"), "Acknowledgement"), item(get("abstract"), "Abstract"), auto("Table of Contents"), auto("List of Tables"), auto("List of Figures")]);
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
function confirmDel(msg) {
  return new Promise((res) => { const d = $("#conf-dlg"); $("#conf-text").textContent = msg; d.returnValue = ""; d.onclose = () => res(d.returnValue === "ok"); d.showModal(); });
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
  started = true;
  try {
    project = pid && (await getProject(pid));
    if (!project) { $("#ptitle").textContent = "Project not found"; return; }
    $("#ptitle").textContent = project.title; document.title = project.title + " — ririrish";
    canEdit = project.ownerId === u.uid;
    $("#roban").hidden = canEdit; $(".toolbar").classList.toggle("ro", !canEdit);
    chs = await loadChapters(pid); curId = (mains()[0] || chs[0]).id;
    setState("saved"); renderAll();
  } catch (e) { console.error(e); $("#ptitle").textContent = "Could not open this project"; toast(e.message); }
});
