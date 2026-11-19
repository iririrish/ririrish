// Document data model: chapters and blocks, plus Firestore load/save.
// Firestore layout: projects/{id}/chapters/{chapterId} = {kind, title, order, blocks[], updatedAt}
import { db } from "./firebase-config.js";
import { collection, doc, getDocs, setDoc, writeBatch, deleteDoc, updateDoc, serverTimestamp }
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

const MAIN_TITLES = ["The Problem and Its Background", "Review of Related Literature", "Methodology", "Results and Discussion", "Summary, Conclusions and Recommendations"];
const pack = (c) => ({ kind: c.kind, title: c.title, order: c.order, blocks: JSON.parse(JSON.stringify(c.blocks)), updatedAt: serverTimestamp() });

export async function loadChapters(pid) {
  const col = collection(db, "projects", pid, "chapters");
  const snap = await getDocs(col);
  if (snap.empty) {
    const list = [
      { id: "acknowledgement", kind: "front", title: "Acknowledgement", order: 0 },
      { id: "abstract", kind: "front", title: "Abstract", order: 1 },
      { id: "appendices", kind: "back", title: "Appendices", order: 0 },
      ...MAIN_TITLES.map((title, i) => ({ id: "c_" + uid(), kind: "main", title, order: i }))
    ].map((c) => ({ ...c, blocks: [block()] }));
    const b = writeBatch(db); list.forEach((c) => b.set(doc(col, c.id), pack(c))); await b.commit();
    return list;
  }
  return snap.docs.map((d) => {
    const v = d.data(), blocks = (v.blocks || []).map((x) => ({ ...x, html: clean(x.html) }));
    return { id: d.id, kind: v.kind, title: v.title, order: v.order ?? 0, blocks: blocks.length ? blocks : [block()] };
  });
}
export async function saveChapter(pid, c) {
  await setDoc(doc(db, "projects", pid, "chapters", c.id), pack(c));
  await updateDoc(doc(db, "projects", pid), { updatedAt: serverTimestamp() });
}
export const removeChapter = (pid, id) => deleteDoc(doc(db, "projects", pid, "chapters", id));

// ---------- Project-level metadata and template settings (stored on the project document) ----------
export const DEFAULT_FORMAT = { template: "batstateu-capstone", fontFamily: "Times New Roman", fontSize: 12, paper: "letter", margin: 1, lineSpacing: 2, indent: 0.5, align: "justify", chapterSize: 14 };
export const DEFAULT_META = {
  degree: "Bachelor of Science in Instrumentation and Control Engineering",
  program: "Expanded Tertiary Education Equivalency and Accreditation Program",
  specialization: "", university: "Batangas State University", campus: "", college: "", department: "", academicYear: "", submissionDate: "",
  introStatement: "A Capstone Study Presented to the Faculty of the {college}",
  degreeStatement: "In partial fulfillment of the requirements for the degree of\n{degree}\n{program}",
  approvalStatement: "This capstone study entitled “{title}” prepared and submitted by {authors} in partial fulfillment of the requirements for the degree {degree} - {program} has been examined and hereby accepted.",
  certification: ""
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
  if (!m.signatories) m.signatories = ["Adviser", "Panel Member", "Chairperson", "Dean"].map((role) => ({ id: uid(), name: "", position: "", role, label: "" }));
  return P;
}
export const saveMeta = (pid, P) => updateDoc(doc(db, "projects", pid), {
  title: P.title, authors: P.meta.authorList.map(authorStr).filter(Boolean),
  meta: JSON.parse(JSON.stringify(P.meta)), format: { ...P.format }, updatedAt: serverTimestamp()
});
