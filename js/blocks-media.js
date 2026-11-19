// Figure and table blocks: rendering and editing. M is the editor context (see editor.js).
import { clean } from "./doc-model.js";
import { tableToLatex } from "./latex.js";
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const eq = (n) => Array(n).fill(+(100 / n).toFixed(2));
export const newTable = (r, c) => ({ cells: Array.from({ length: r }, () => Array.from({ length: c }, () => ({ h: "", rs: 1, cs: 1 }))), colW: eq(c), colAlign: Array(c).fill("left"), header: true });

function capLine(M, b, label) {
  const { h, canEdit } = M, i = h("input", { placeholder: "Caption", "aria-label": "Caption" });
  i.value = b.caption || ""; i.disabled = !canEdit;
  i.oninput = () => { b.caption = i.value; M.touch(); }; i.onchange = () => M.syncCaption(b);
  return h("div", { class: "cap" }, h("b", {}, label), i);
}
const mbtn = (h, t, fn, title, cls = "") => h("button", { class: "mb " + cls, type: "button", title: title || t, onmousedown: (e) => e.preventDefault(), onclick: fn }, t);

export function figBody(b, M, num) {
  const { h, canEdit } = M;
  b.h ??= +(b.w * b.nh / b.nw).toFixed(2);
  const fig = h("figure", { class: "figw a-" + (b.align || "center"), tabindex: canEdit ? "0" : null });
  const cap = capLine(M, b, `Figure ${num}.`);
  if (!b.url) {
    fig.append(h("div", { class: "drop" }, "No image yet. Drop one here or ", canEdit ? h("button", { class: "btn sm", type: "button", onclick: () => M.pick(b) }, "Upload image") : "ask the owner to add one."), cap);
    return fig;
  }
  const wrap = h("div", { class: "imgw" }), img = h("img", { src: b.url, alt: b.alt || "" });
  const wi = h("input", { type: "number", min: "0.5", step: "0.1", "aria-label": "Width (inches)" }), hi = h("input", { type: "number", min: "0.3", step: "0.1", "aria-label": "Height (inches)" });
  const lock = h("input", { type: "checkbox" }); lock.checked = b.lock !== false;
  const ratioH = (w) => +(w * b.nh / b.nw).toFixed(2);
  const apply = () => { wrap.style.width = b.w + "in"; img.style.height = b.lock === false ? b.h + "in" : "auto"; wi.value = b.w; hi.value = b.lock === false ? b.h : ratioH(b.w); };
  const startResize = (e, d) => {
    e.preventDefault(); const sx = e.clientX, sy = e.clientY, w0 = b.w, h0 = b.h;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / 96 * (d.includes("w") ? -1 : 1), dy = (ev.clientY - sy) / 96 * (d.includes("n") ? -1 : 1);
      b.w = +clamp(w0 + dx, 0.5, M.maxW()).toFixed(2); b.h = b.lock === false ? +Math.max(0.3, h0 + dy).toFixed(2) : ratioH(b.w); apply();
    };
    const up = () => { removeEventListener("pointermove", move); M.touch(true); };
    addEventListener("pointermove", move); addEventListener("pointerup", up, { once: true });
  };
  wrap.append(img, ...["nw", "ne", "sw", "se"].map((d) => h("span", { class: "hd " + d, onpointerdown: (e) => startResize(e, d) })));
  fig.append(wrap, cap);
  if (canEdit) {
    wi.onchange = () => { b.w = +clamp(parseFloat(wi.value) || b.w, 0.5, M.maxW()).toFixed(2); if (b.lock !== false) b.h = ratioH(b.w); apply(); M.touch(true); };
    hi.onchange = () => {
      const v = Math.max(0.3, parseFloat(hi.value) || b.h);
      if (b.lock !== false) { b.w = +clamp(v * b.nw / b.nh, 0.5, M.maxW()).toFixed(2); b.h = ratioH(b.w); } else b.h = +v.toFixed(2);
      apply(); M.touch(true);
    };
    lock.onchange = () => { b.lock = lock.checked; if (b.lock) b.h = ratioH(b.w); apply(); M.touch(true); };
    const al = (a) => mbtn(h, a[0].toUpperCase() + a.slice(1), () => { b.align = a; fig.className = "figw a-" + a; M.touch(true); }, "Align " + a);
    const alt = h("input", { type: "text", placeholder: "Alt text", "aria-label": "Alt text" }); alt.value = b.alt || "";
    alt.oninput = () => { b.alt = alt.value; img.alt = alt.value; M.touch(); };
    const reset = () => { b.w = +Math.min(b.nw / 96, M.maxW()).toFixed(2); b.lock = true; lock.checked = true; b.h = ratioH(b.w); apply(); M.touch(true); };
    fig.append(h("div", { class: "mctl" }, mbtn(h, "Replace", () => M.pick(b)), "W", wi, "H", hi, h("label", {}, lock, " Lock ratio"), al("left"), al("center"), al("right"),
      mbtn(h, "Original size", reset), alt, mbtn(h, "Delete image", () => M.delFig(b), "", "danger")));
  }
  apply(); return fig;
}

export function tblBody(b, M, num) {
  const { h, canEdit } = M; let act = { r: 0, c: 0 };
  const root = h("div", { class: "tblw" }), rows = () => b.cells.length, cols = () => b.colW.length, blank = () => ({ h: "", rs: 1, cs: 1 });
  const splitAll = () => {
    let any = false; b.cells.forEach((r) => r.forEach((x) => { if (x.rs > 1 || x.cs > 1 || x.hide) any = true; x.rs = 1; x.cs = 1; delete x.hide; }));
    if (any) M.toast("Merged cells were split because rows or columns changed.", true);
  };
  const run = (fn) => { fn(); M.touch(true); build(); root.querySelector(`[data-r="${act.r}"][data-c="${act.c}"]`)?.focus(); };
  const cover = (r0, c0, nr, nc) => { for (let r = r0; r < r0 + nr; r++) for (let c = c0; c < c0 + nc; c++) { const t = b.cells[r][c]; t.hide = true; t.h = ""; t.rs = 1; t.cs = 1; } };
  const join = (x, y) => { if (y.h) x.h = (x.h ? x.h + " " : "") + y.h; };
  const ops = {
    addRow: () => run(() => { splitAll(); b.cells.splice(act.r + 1, 0, Array.from({ length: cols() }, blank)); act.r++; }),
    delRow: () => rows() > 1 && run(() => { splitAll(); b.cells.splice(act.r, 1); act.r = Math.min(act.r, rows() - 1); }),
    addCol: () => cols() < 10 && run(() => { splitAll(); b.cells.forEach((r) => r.splice(act.c + 1, 0, blank())); b.colAlign.splice(act.c + 1, 0, "left"); b.colW = eq(cols() + 1); act.c++; }),
    delCol: () => cols() > 1 && run(() => { splitAll(); b.cells.forEach((r) => r.splice(act.c, 1)); b.colAlign.splice(act.c, 1); b.colW = eq(cols() - 1); act.c = Math.min(act.c, cols() - 1); }),
    mergeR: () => {
      const x = b.cells[act.r][act.c], c2 = act.c + x.cs, y = b.cells[act.r][c2];
      if (!y || y.hide || y.rs !== x.rs) return M.toast("Cannot merge right: the neighbouring cell is missing or has a different height.");
      run(() => { const ys = y.cs; join(x, y); x.cs += ys; cover(act.r, c2, x.rs, ys); });
    },
    mergeD: () => {
      const x = b.cells[act.r][act.c], r2 = act.r + x.rs, y = b.cells[r2]?.[act.c];
      if (!y || y.hide || y.cs !== x.cs) return M.toast("Cannot merge down: the cell below is missing or has a different width.");
      run(() => { const ys = y.rs; join(x, y); x.rs += ys; cover(r2, act.c, ys, x.cs); });
    },
    split: () => {
      const x = b.cells[act.r][act.c]; if (x.rs === 1 && x.cs === 1) return M.toast("This cell is not merged.");
      run(() => { const rs = x.rs, cs = x.cs; for (let r = 0; r < rs; r++) for (let c = 0; c < cs; c++) { const t = b.cells[act.r + r][act.c + c]; delete t.hide; t.rs = 1; t.cs = 1; } });
    }
  };
  function build() {
    act.r = Math.min(act.r, rows() - 1); act.c = Math.min(act.c, cols() - 1); root.replaceChildren();
    const table = h("table", { class: "dt" }), colEls = b.colW.map((w) => h("col", { style: `width:${w}%` }));
    table.append(h("colgroup", {}, ...colEls));
    const wrap = h("div", { class: "twrap" }, table);
    b.cells.forEach((row, r) => {
      const tr = h("tr");
      row.forEach((x, c) => {
        if (x.hide) return;
        const td = h(r === 0 && b.header ? "th" : "td", { colspan: x.cs > 1 ? x.cs : null, rowspan: x.rs > 1 ? x.rs : null, "data-r": r, "data-c": c });
        td.innerHTML = x.h; td.style.textAlign = b.colAlign[c]; if (r === act.r && c === act.c) td.classList.add("act");
        if (canEdit) {
          td.contentEditable = "true";
          td.onfocus = () => { act = { r, c }; table.querySelectorAll(".act").forEach((e) => e.classList.remove("act")); td.classList.add("act"); };
          td.oninput = () => { x.h = clean(td.innerHTML); M.touch(); };
          td.onpaste = (e) => { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData.getData("text/plain") || "").replace(/\s*\n+\s*/g, " ")); };
          td.onkeydown = (e) => {
            if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak"); }
            else if (e.key === "Tab") { const all = [...table.querySelectorAll("td,th")], n = all[all.indexOf(td) + (e.shiftKey ? -1 : 1)]; if (n) { e.preventDefault(); n.focus(); } }
          };
        }
        tr.append(td);
      });
      table.append(tr);
    });
    if (canEdit && cols() > 1) {
      const hs = [], place = () => { let cum = 0; hs.forEach((hd, i) => { cum += b.colW[i]; hd.style.left = cum + "%"; }); };
      for (let i = 0; i < cols() - 1; i++) {
        const hd = h("div", { class: "rz", title: "Drag to resize column" });
        hd.onpointerdown = (e) => {
          e.preventDefault(); const sx = e.clientX, a0 = b.colW[i], b0 = b.colW[i + 1], W = wrap.offsetWidth;
          const mv = (ev) => { const a = clamp(a0 + (ev.clientX - sx) / W * 100, 6, a0 + b0 - 6); b.colW[i] = +a.toFixed(2); b.colW[i + 1] = +(a0 + b0 - a).toFixed(2); colEls[i].style.width = b.colW[i] + "%"; colEls[i + 1].style.width = b.colW[i + 1] + "%"; place(); };
          const up = () => { removeEventListener("pointermove", mv); M.touch(true); };
          addEventListener("pointermove", mv); addEventListener("pointerup", up, { once: true });
        };
        hs.push(hd); wrap.append(hd);
      }
      place();
    }
    root.append(capLine(M, b, `Table ${num}.`), wrap);
    if (!canEdit) return;
    const mb = (t, fn, title, cls) => mbtn(h, t, fn, title, cls);
    const al = (a) => mb(a[0].toUpperCase() + a.slice(1), () => run(() => (b.colAlign[act.c] = a)), `Align column ${a}`);
    const fmt = (c) => () => { if (document.activeElement?.closest?.(".twrap td, .twrap th")) document.execCommand(c); };
    const hdr = h("input", { type: "checkbox" }); hdr.checked = !!b.header; hdr.onchange = () => run(() => (b.header = hdr.checked));
    const lab = h("input", { type: "text", placeholder: "Label (e.g. specs)", "aria-label": "Table label" }); lab.value = b.label || ""; lab.oninput = () => { b.label = lab.value; M.touch(); };
    root.append(h("div", { class: "mctl" }, mb("+ Row", ops.addRow), mb("− Row", ops.delRow), mb("+ Col", ops.addCol), mb("− Col", ops.delCol), mb("Merge →", ops.mergeR), mb("Merge ↓", ops.mergeD), mb("Split", ops.split),
      al("left"), al("center"), al("right"), mb("B", fmt("bold"), "Bold"), mb("I", fmt("italic"), "Italic"), h("label", {}, hdr, " Header row"), lab,
      mb("Copy LaTeX", async () => { try { await navigator.clipboard.writeText(tableToLatex(b, num)); M.toast("LaTeX copied.", true); } catch { M.toast("Could not copy. The browser blocked clipboard access."); } }, "Copy as a LaTeX table"),
      mb("Delete table", () => M.removeBlock(b), "", "danger")));
  }
  build(); return root;
}
