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
      r.append(t("name", "Name"), t("position", "Academic title and position"), sel, t("label", "Designation label (defaults to role)"));
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
    bind("Approval statement", m, "approvalStatement", { area: true }), bind("Certification or other statement (optional)", m, "certification", { area: true }), sigUI(), note);
  else form = h("div", { class: "fcard" }, h("h2", {}, "Table of contents"), h("p", { class: "meta" }, "Built automatically from your chapters, sections and subsections. Page numbers are added when the PDF is generated (Phase 5)."));
  D.append(form, box); refresh();

  function titlePage() {
    const d = (c, t) => (String(t || "").trim() ? h("div", { class: c }, ...lines(t)) : "");
    const names = m.authorList.map(authorStr).filter(Boolean);
    return h("div", { class: "page tp" }, d("inst", m.university), d("c", m.campus), d("c", m.college), d("c", m.department),
      d("ttl", P.title), d("c", fill(m.introStatement, P)), d("c", fill(m.degreeStatement, P)),
      names.length ? h("div", { class: "by" }, "Presented by:") : "", ...names.map((n) => h("div", { class: "c nm" }, n)),
      d("c foot", [m.academicYear, m.submissionDate].filter(Boolean).join("\n")));
  }
  function approvalPage() {
    return h("div", { class: "page ap" }, h("div", { class: "aph" }, "Approval Sheet"), h("p", { class: "st" }, fill(m.approvalStatement, P)),
      m.certification.trim() ? h("p", { class: "st" }, ...lines(fill(m.certification, P))) : "",
      h("div", { class: "sigs" }, ...m.signatories.map((s) => h("div", { class: "sig" }, h("div", { class: "line" }),
        h("div", { class: "sn" }, s.name || "Name"), s.position ? h("div", {}, s.position) : "", h("div", { class: "sl" }, s.label || s.role)))));
  }
  function tocPage() {
    const rows = [], add = (t, l) => rows.push(h("div", { class: "toc l" + l }, t));
    const get = (x) => ctx.chs().find((c) => c.id === x);
    const heads = (c) => { const n = ctx.nums(c); c.blocks.forEach((b, i) => { if (b.type === "h1" || b.type === "h2") add(`${n[i] ? n[i] + "  " : ""}${ctx.text(b.html).trim() || "(untitled)"}`, b.type === "h1" ? 1 : 2); }); };
    ["acknowledgement", "abstract"].forEach((x) => get(x) && add(get(x).title.toUpperCase(), 0));
    ctx.mains().forEach((c, i) => { add(`CHAPTER ${i + 1}  ${c.title.toUpperCase()}`, 0); heads(c); });
    if (get("appendices")) { add(get("appendices").title.toUpperCase(), 0); heads(get("appendices")); }
    return h("div", { class: "page" }, h("div", { class: "aph" }, "Table of Contents"), ...rows);
  }
}
