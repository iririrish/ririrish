// Document data model: chapters and blocks, plus Firestore load/save.
// Firestore layout: projects/{id}/chapters/{chapterId} = {kind, title, order, blocks[], updatedAt}
import { db } from "./firebase-config.js";
import { collection, doc, getDocs, setDoc, writeBatch, deleteDoc, updateDoc, runTransaction, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const uid = () => Math.random().toString(36).slice(2, 10);
export const LIST_CSS = { bullet: "disc", decimal: "decimal", "upper-alpha": "upper-alpha", "lower-alpha": "lower-alpha", "upper-roman": "upper-roman", "lower-roman": "lower-roman" };
export const LIST_LABELS = { bullet: "Bullets", decimal: "1, 2, 3", "upper-alpha": "A, B, C", "lower-alpha": "a, b, c", "upper-roman": "I, II, III", "lower-roman": "i, ii, iii" };
// block: {id, type: "p" | "h1" (section) | "h2" (subsection) | "list", html, align?, listStyle?}
export const block = (type = "p", html = "", extra = {}) => ({ id: uid(), type, html, ...extra });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Keep only b, i, u, br, and list items; everything else is unwrapped.
export function clean(html) {
  const t = document.createElement("template"); t.innerHTML = html || "";
  const map = { strong: "b", b: "b", em: "i", i: "i", u: "u", li: "li" };
  const walk = (n) => {
    let s = "";
    for (const c of n.childNodes) {
      if (c.nodeType === 3) s += esc(c.textContent);
      else if (c.nodeType === 1) {
        const tag = c.tagName.toLowerCase(), inner = walk(c);
        if (tag === "br") s += "<br>";
        else if (map[tag]) s += `<${map[tag]}>${inner}</${map[tag]}>`;
        else s += inner;
      }
    }
    return s;
  };
  return walk(t.content);
}
export function text(html) {
  const t = document.createElement("template"); t.innerHTML = (html || "").replace(/<\/li>|<br>/g, " ");
  return t.content.textContent || "";
}

const MAIN_TITLES = ["The Problem and Its Background", "Literature Review", "Design Methodology", "Data Results and Analysis", "Summary of Findings, Conclusions and Recommendations"];
// Starter sections for NEW projects, following the official capstone template.
const SECTIONS = [["Background of the Study", "Project Objectives", "Scope and Delimitation of the Study", "Importance of the Study", "Definition of Terms"],
  ["Conceptual Literature", "Related Literature", "Synthesis"], ["Conceptual Framework", "Design Procedure and Tools Requirement"], [], ["Summary of Findings", "Conclusion", "Recommendations"]];
const seedBlocks = (c) => c.kind === "main" ? [block(), ...SECTIONS[c.order].flatMap((t) => [block("h1", t), block()])]
  : c.id === "abstract" ? [block(), block("kw")] : [block()];
const pack = (c, rev) => ({ kind: c.kind, title: c.title, order: c.order, rev, blocks: JSON.parse(JSON.stringify(c.blocks)), updatedAt: serverTimestamp() });

export async function loadChapters(pid) {
  const col = collection(db, "projects", pid, "chapters");
  const snap = await getDocs(col);
  if (snap.empty) {
    const list = [
      { id: "abstract", kind: "front", title: "Abstract", order: 0 },
      { id: "acknowledgement", kind: "front", title: "Acknowledgement", order: 1 },
      { id: "appendices", kind: "back", title: "Appendix", order: 0 },
      ...MAIN_TITLES.map((title, i) => ({ id: "c_" + uid(), kind: "main", title, order: i }))
    ].map((c) => ({ ...c, rev: 1, blocks: seedBlocks(c) }));
    const b = writeBatch(db); list.forEach((c) => b.set(doc(col, c.id), pack(c, 1))); await b.commit();
    return list;
  }
  return snap.docs.map((d) => {
    const v = d.data(), blocks = (v.blocks || []).map((x) => ({ ...x, html: clean(x.html) }));
    return { id: d.id, kind: v.kind, title: v.title, order: v.order ?? 0, rev: v.rev || 0, blocks: blocks.length ? blocks : [block()] };
  });
}
export class ConflictError extends Error {}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("The connection timed out."), { code: "deadline-exceeded" })), ms))]);
// Saves one chapter; refuses to overwrite a newer copy saved from another device unless force is true.
export async function saveChapter(pid, c, force = false) {
  const ref = doc(db, "projects", pid, "chapters", c.id);
  c.rev = await withTimeout(runTransaction(db, async (tx) => {
    const s = await tx.get(ref), remote = s.exists() ? s.data().rev || 0 : null;
    if (!force && remote !== null && remote !== (c.rev || 0)) throw new ConflictError("This chapter was changed somewhere else.");
    const next = (remote ?? c.rev ?? 0) + 1; tx.set(ref, pack(c, next)); return next;
  }), 20000);
}
export const touchProject = (pid) => updateDoc(doc(db, "projects", pid), { updatedAt: serverTimestamp() });
export const removeChapter = (pid, id) => deleteDoc(doc(db, "projects", pid, "chapters", id));

// ---------- Project-level metadata and template settings (stored on the project document) ----------
export const DEFAULT_FORMAT = { template: "batstateu-capstone", fontFamily: "Times New Roman", fontSize: 12, paper: "letter", margin: 1, lineSpacing: 2, indent: 0.5, align: "justify", chapterSize: 14 };
export const DEFAULT_META = {
  degree: "Bachelor of Science in Instrumentation and Control Engineering",
  program: "Expanded Tertiary Education Equivalency and Accreditation Program",
  specialization: "", university: "Batangas State University - The National Engineering University", campus: "Alangilan, Batangas City", college: "College of Engineering", department: "", academicYear: "", submissionDate: "",
  introStatement: "A Capstone Design Study\nPresented to the Faculty of\n{college}\n{university}\n{campus}",
  degreeStatement: "In partial fulfillment of the requirements for the degree of\n{degree}\n{program}",
  approvalStatement: "This capstone study entitled “{title}” prepared and submitted by {authors} in partial fulfillment of the requirements for the degree {degree} - {program} has been examined and hereby accepted.",
  certification: "",
  gradeStatement: "Approved by the committee of oral examination with a grade of ______________.",
  acceptanceStatement: "Accepted and approved in partial fulfillment of the requirements for the degree of\nBachelor of Science Program."
};
export const authorStr = (a) => [a.last && (a.first ? a.last + "," : a.last), a.first, a.mi].filter(Boolean).join(" ");
function parseAuthor(s) {
  const k = s.indexOf(","), last = (k < 0 ? s : s.slice(0, k)).trim();
  const t = (k < 0 ? "" : s.slice(k + 1)).trim().split(/\s+/).filter(Boolean);
  const mi = t.length > 1 && /^[A-Za-z]\.?$/.test(t.at(-1)) ? t.pop() : "";
  return { id: uid(), last, first: t.join(" "), mi };
}
export function ensureDefaults(P) {
  P.format = { ...DEFAULT_FORMAT, ...(P.format || {}) };
  const m = (P.meta = { ...DEFAULT_META, ...(P.meta || {}) });
  if (!m.authorList) m.authorList = (P.authors || []).map(parseAuthor);
  if (!m.authorList.length) m.authorList = [{ id: uid(), last: "", first: "", mi: "" }];
  m.authorList.forEach((a) => (a.id ||= uid()));
  if (!m.signatories) m.signatories = [["Adviser", "Engr.", ""], ["Chairperson", "Engr.", "Chairman"], ["Panel Member", "Engr.", "Member"], ["Panel Member", "Engr.", "Member"], ["Dean", "Dr.", "Dean, College of Engineering"]].map(([role, position, label]) => ({ id: uid(), name: "", position, role, label }));
  return P;
}
export async function saveMeta(pid, P, force = false) {
  const ref = doc(db, "projects", pid);
  P.metaRev = await withTimeout(runTransaction(db, async (tx) => {
    const s = await tx.get(ref), remote = s.data()?.metaRev || 0;
    if (!force && remote !== (P.metaRev || 0)) throw new ConflictError("The project details were changed somewhere else.");
    const next = remote + 1;
    tx.update(ref, { title: P.title, authors: P.meta.authorList.map(authorStr).filter(Boolean), meta: JSON.parse(JSON.stringify(P.meta)), format: { ...P.format }, metaRev: next, updatedAt: serverTimestamp() });
    return next;
  }), 20000);
}
