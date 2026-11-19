import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, query, where,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const col = collection(db, "projects");
export const TEMPLATES = { "batstateu-capstone": "BatStateU — Capstone Manuscript" };

const base = (user, title, authors, template) => ({
  title: title.trim(), authors, template,
  ownerId: user.uid, ownerName: user.displayName || user.email,
  collaborators: {}, collaboratorIds: [], sharing: "private",
  createdAt: serverTimestamp(), updatedAt: serverTimestamp()
});
export const createProject = (user, { title, author, template }) =>
  addDoc(col, base(user, title, author.trim() ? [author.trim()] : [], template));
export const duplicateProject = (user, p) =>
  addDoc(col, base(user, `${p.title} (copy)`, p.authors || [], p.template));
export const renameProject = (id, title) =>
  updateDoc(doc(db, "projects", id), { title: title.trim(), updatedAt: serverTimestamp() });
export const deleteProject = (id) => deleteDoc(doc(db, "projects", id));
export async function getProject(id) {
  const s = await getDoc(doc(db, "projects", id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
// Live list of projects the user owns or was invited to.
export function watchProjects(uid, cb, onError) {
  const owned = new Map(), shared = new Map();
  const emit = () => cb([...owned.values(), ...shared.values()]);
  const feed = (map) => (snap) => {
    map.clear(); snap.forEach((d) => map.set(d.id, { id: d.id, ...d.data() })); emit();
  };
  const u1 = onSnapshot(query(col, where("ownerId", "==", uid)), feed(owned), onError);
  const u2 = onSnapshot(query(col, where("collaboratorIds", "array-contains", uid)), feed(shared), onError);
  return () => { u1(); u2(); };
}
