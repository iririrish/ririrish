// Title page, approval sheet and table of contents: editable forms with a formatted page below.
import { uid, authorStr } from "./doc-model.js";
export const ROLES = ["Adviser", "Panel Member", "Chairperson", "Dean", "Other"];

function fill(s, P) {
  const m = P.meta, v = { title: P.title, authors: m.authorList.map(authorStr).filter(Boolean).join("; "), degree: m.degree, program: m.program,
    specialization: m.specialization, university: m.university, campus: m.campus, department: m.department, college: m.college, year: m.academicYear, date: m.submissionDate };
  return (s || "").replace(/\{(\w+)\}/g, (x, k) => (k in v ? v[k] || "" : x));
}
const lines = (s) => String(s || "").split("\n").flatMap((l, i) => (i ? [document.createElement("br"), l] : [l]));

export function renderSpecial(id, ctx, D) {
  const { project: P, canEdit, h } = ctx, m = P.meta;
  D.replaceChildren();
  const box = h("div", { class: "pagebox" });
  const refresh = () => box.replaceChildren(id === "__title" ? titlePage() : id === "__approval" ? approvalPage() : tocPage());
  const again = () => { ctx.dirty(); renderSpecial(id, ctx, D); };
  const bind = (label, obj, key, { area, onSet } = {}) => {
    const i = h(area ? "textarea" : "input", area ? { rows: 3 } : {}); i.value = obj[key] || ""; i.disabled = !canEdit;
    i.oninput = () => { obj[key] = i.value; onSet?.(); ctx.dirty(); refresh(); };
    return h("label", {}, label, i);
  };
  const rowBtns = (list, i, after) => h("span", { class: "rb" },
    h("button", { type: "button", title: "Move up", "aria-label": "Move up", onclick: () => { if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; after(); } } }, "↑"),
    h("button", { type: "button", title: "Move down", "aria-label": "Move down", onclick: () => { if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; after(); } } }, "↓"),
    h("button", { type: "button", title: "Remove", "aria-label": "Remove", onclick: () => { list.splice(i, 1); after(); } }, "✕"));
  const syncAuthors = () => { P.authors = m.authorList.map(authorStr).filter(Boolean); };
  const authorsUI = () => {
    const w = h("div", { class: "lrows" }, h("div", { class: "lbl" }, "Authors (Last Name, First Name M.I.)"));
    m.authorList.forEach((a, i) => {
      const r = h("div", { class: "lrow a3" });
      [["last", "Last name"], ["first", "First name"], ["mi", "M.I."]].forEach(([k, ph]) => {
        const inp = h("input", { placeholder: ph, "aria-label": ph }); inp.value = a[k] || ""; inp.disabled = !canEdit;
        inp.oninput = () => { a[k] = inp.value; syncAuthors(); ctx.dirty(); refresh(); }; r.append(inp);
      });
      if (canEdit) r.append(rowBtns(m.authorList, i, () => { syncAuthors(); again(); })); w.append(r);
    });
    if (canEdit) w.append(h("button", { class: "btn sm", type: "button", onclick: () => { m.authorList.push({ id: uid(), last: "", first: "", mi: "" }); again(); } }, "+ Add author"));
    return w;
  };
  const sigUI = () => {
    const w = h("div", { class: "lrows" }, h("div", { class: "lbl" }, "Signatories"));
    m.signatories.forEach((s, i) => {
      const r = h("div", { class: "lrow s4" });
      const t = (k, ph) => { const inp = h("input", { placeholder: ph, "aria-label": ph }); inp.value = s[k] || ""; inp.disabled = !canEdit; inp.oninput = () => { s[k] = inp.value; ctx.dirty(); refresh(); }; return inp; };
      const sel = h("select", { "aria-label": "Role" }, ...ROLES.map((x) => h("option", { value: x }, x))); sel.value = s.role; sel.disabled = !canEdit;
      sel.onchange = () => { s.role = sel.value; ctx.dirty(); refresh(); };
      r.append(t("name", "Name"), t("position", "Title (e.g., Engr., Dr.)"), sel, t("label", "Designation label (e.g., Member)"));
      if (canEdit) r.append(rowBtns(m.signatories, i, again)); w.append(r);
    });
    if (canEdit) w.append(h("button", { class: "btn sm", type: "button", onclick: () => { m.signatories.push({ id: uid(), name: "", position: "", role: "Panel Member", label: "" }); again(); } }, "+ Add signatory"));
    return w;
  };
  const note = h("p", { class: "meta" }, "Placeholders you can use in statements: {title} {authors} {degree} {program} {specialization} {university} {campus} {college} {department} {year} {date}.");
  let form;
  if (id === "__title") form = h("div", { class: "fcard" }, h("h2", {}, "Title page"),
    h("div", { class: "fgrid" }, bind("Research title", P, "title", { area: true, onSet: () => {} }), bind("Degree", m, "degree"), bind("Program", m, "program"), bind("Specialization", m, "specialization"),
      bind("University", m, "university"), bind("Campus", m, "campus"), bind("College", m, "college"), bind("Department", m, "department"), bind("Academic year", m, "academicYear"), bind("Submission date", m, "submissionDate")),
    authorsUI(), bind("Introductory statement", m, "introStatement", { area: true }), bind("Degree statement", m, "degreeStatement", { area: true }), note);
  else if (id === "__approval") form = h("div", { class: "fcard" }, h("h2", {}, "Approval sheet"),
    bind("Approval statement", m, "approvalStatement", { area: true }), bind("Panel grade statement", m, "gradeStatement", { area: true }), bind("Acceptance statement (above the date and dean)", m, "acceptanceStatement", { area: true }), bind("Other statement (optional)", m, "certification", { area: true }), sigUI(), note);
  else form = h("div", { class: "fcard" }, h("h2", {}, "Table of contents"), h("p", { class: "meta" }, "Built automatically from your chapters, sections and subsections. Page numbers are added when the PDF is generated (Phase 5)."));
  D.append(form, box); refresh();

  function titlePage() {
    const names = m.authorList.map(authorStr).filter(Boolean);
    const g = (...k) => h("div", { class: "tg" }, ...k);
    const ln = (t) => (String(t || "").trim() ? h("div", {}, ...lines(t)) : "");
    return h("div", { class: "page tp" }, g(h("div", { class: "ttl" }, P.title || "Research title")), g(ln(fill(m.introStatement, P))),
      g(ln(fill(m.degreeStatement, P))), g(...names.map((n) => h("div", {}, n))), g(ln(m.submissionDate)));
  }
  function approvalPage() {
    const DL = { Adviser: "Adviser", Chairperson: "Chairman", "Panel Member": "Member", Dean: "Dean", Other: "" };
    const sig = (s) => h("div", { class: "sig" }, h("div", { class: "line" }), h("div", { class: "sn" }, [s.position, s.name].filter(Boolean).join(" ") || "Name"), h("div", { class: "sl" }, s.label || DL[s.role] || ""));
    const by = (r) => m.signatories.filter((s) => s.role === r);
    const adv = by("Adviser"), ch = by("Chairperson"), mem = by("Panel Member"), dean = by("Dean"), oth = by("Other"), panel = ch.length || mem.length;
    return h("div", { class: "page ap" }, h("div", { class: "aph" }, "Approval Sheet"), h("p", { class: "st" }, fill(m.approvalStatement, P)),
      m.certification.trim() ? h("p", { class: "st" }, ...lines(fill(m.certification, P))) : "",
      ...adv.map((s) => h("div", { class: "adv" }, sig(s))),
      panel ? h("div", { class: "pe" }, "Panel of Examiners") : "", panel && m.gradeStatement.trim() ? h("p", { class: "st gs" }, fill(m.gradeStatement, P)) : "",
      ...ch.map((s) => h("div", { class: "ctr" }, sig(s))), mem.length ? h("div", { class: "mem" }, ...mem.map(sig)) : "", oth.length ? h("div", { class: "mem" }, ...oth.map(sig)) : "",
      m.acceptanceStatement.trim() ? h("p", { class: "st" }, ...lines(fill(m.acceptanceStatement, P))) : "",
      h("div", { class: "foot2" }, h("div", { class: "dt" }, h("b", {}, m.submissionDate || "Month YYYY"), h("div", {}, "Date")), h("div", {}, ...dean.map(sig))));
  }
  function tocPage() {
    const rows = [], add = (t, l) => rows.push(h("div", { class: "toc l" + l }, h("span", {}, t), h("i", { class: "ld" }), h("span", { class: "pg" }, "")));
    const get = (x) => ctx.chs().find((c) => c.id === x);
    ["APPROVAL SHEET", "ABSTRACT", "ACKNOWLEDGEMENT", "TABLE OF CONTENTS", "LIST OF TABLES", "LIST OF FIGURES"].forEach((t) => add(t, 0));
    ctx.mains().forEach((c, i) => {
      add(`CHAPTER ${i + 1}. ${c.title.toUpperCase()}`, 0); const n = ctx.nums(c);
      c.blocks.forEach((b, j) => { if (b.type === "h1") add(`${n[j]} ${(ctx.text(b.html).trim() || "(untitled)").toUpperCase()}`, 1); });
    });
    if (get("appendices")) add(get("appendices").title.toUpperCase(), 0);
    return h("div", { class: "page" }, h("div", { class: "aph" }, "Table of Contents"), ...rows);
  }
}
