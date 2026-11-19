import { db } from "./firebase-config.js";
import { uid } from "./doc-model.js";
import { copyImage, removeFiles } from "./images.js";
import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs, writeBatch, query, where,
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
export async function duplicateProject(user, p) {
  const ref = await addDoc(col, { ...base(user, `${p.title} (copy)`, p.authors || [], p.template), ...(p.meta ? { meta: p.meta } : {}), ...(p.format ? { format: p.format } : {}) });
  const [cs, ims] = await Promise.all([getDocs(collection(db, "projects", p.id, "chapters")), getDocs(collection(db, "projects", p.id, "images"))]);
  const map = {}, b = writeBatch(db);
  for (const d of ims.docs) { // copy the files so each project owns its images
    const r = d.data(), nid = uid() + uid(), path = `images/${user.uid}/${ref.id}/${nid}.webp`;
    try {
      const url = await copyImage(r.storagePath, path); map[d.id] = { id: nid, url, path };
      b.set(doc(db, "projects", ref.id, "images", nid), { ...r, ownerId: user.uid, storagePath: path, imageUrl: url, fileName: `${nid}.webp`, uploadedAt: serverTimestamp() });
    } catch (e) { console.error("Image copy failed", e); }
  }
  cs.forEach((d) => {
    const v = d.data();
    v.blocks = (v.blocks || []).map((x) => { if (!x.imageId) return x; const m = map[x.imageId]; return m ? { ...x, imageId: m.id, url: m.url, path: m.path } : { ...x, imageId: null, url: "", path: "" }; });
    b.set(doc(db, "projects", ref.id, "chapters", d.id), v);
  });
  await b.commit(); return ref;
}
export const renameProject = (id, title) =>
  updateDoc(doc(db, "projects", id), { title: title.trim(), updatedAt: serverTimestamp() });
export async function deleteProject(id) {
  const [cs, ims] = await Promise.all([getDocs(collection(db, "projects", id, "chapters")), getDocs(collection(db, "projects", id, "images"))]);
  await removeFiles(ims.docs.map((d) => d.data().storagePath)).catch(console.error);
  const b = writeBatch(db); cs.forEach((d) => b.delete(d.ref)); ims.forEach((d) => b.delete(d.ref)); b.delete(doc(db, "projects", id)); await b.commit();
}
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
