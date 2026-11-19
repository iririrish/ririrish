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
