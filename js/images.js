// Image pipeline: compress in the browser -> Supabase Storage (file) -> Firestore (record only).
// Record: projects/{id}/images/{imageId} = {ownerId, fileName, storagePath, imageUrl, size, width, height, caption, uploadedAt}
import { db } from "./firebase-config.js";
import { doc, setDoc, deleteDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getSb, BUCKET, storageReady } from "./supabase-config.js";
import { uid } from "./doc-model.js";

const MAX_INPUT = 10 * 1024 * 1024, MAX_OUT = 1.9 * 1024 * 1024;
export async function prepareImage(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG or WebP image.");
  if (file.size > MAX_INPUT) throw new Error("That image is over 10 MB. Choose a smaller one.");
  const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k), height = Math.round(bmp.height * k);
  const cv = document.createElement("canvas"); cv.width = width; cv.height = height; cv.getContext("2d").drawImage(bmp, 0, 0, width, height);
  let q = 0.85, blob;
  do { blob = await new Promise((r) => cv.toBlob(r, "image/webp", q)); q -= 0.15; } while (blob && blob.size > MAX_OUT && q > 0.3);
  if (!blob || blob.size > MAX_OUT) throw new Error("Could not shrink this image enough. Try a smaller one.");
  return { blob, width, height, name: file.name, url: URL.createObjectURL(blob) };
}
export async function uploadImage(pid, user, p, caption = "") {
  const sb = await getSb(), id = uid() + uid(), storagePath = `images/${user.uid}/${pid}/${id}.webp`;
  const { error } = await sb.storage.from(BUCKET).upload(storagePath, p.blob, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (error) throw new Error("Upload failed: " + error.message);
  const imageUrl = sb.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  const rec = { ownerId: user.uid, fileName: `${id}.webp`, originalName: p.name, storagePath, imageUrl, size: p.blob.size, width: p.width, height: p.height, caption, uploadedAt: serverTimestamp() };
  try { await setDoc(doc(db, "projects", pid, "images", id), rec); }
  catch (e) { await sb.storage.from(BUCKET).remove([storagePath]); throw e; }
  return { id, ...rec };
}
export async function deleteImage(pid, id, path) {
  if (path && storageReady) { const sb = await getSb(), { error } = await sb.storage.from(BUCKET).remove([path]); if (error) throw new Error("Could not delete the file: " + error.message); }
  await deleteDoc(doc(db, "projects", pid, "images", id));
}
export const updateCaption = (pid, id, caption) => updateDoc(doc(db, "projects", pid, "images", id), { caption }).catch(console.error);
export async function removeFiles(paths) {
  paths = (paths || []).filter(Boolean); if (!paths.length || !storageReady) return;
  const sb = await getSb(), { error } = await sb.storage.from(BUCKET).remove(paths); if (error) throw new Error(error.message);
}
export async function copyImage(from, to) {
  const sb = await getSb(), { error } = await sb.storage.from(BUCKET).copy(from, to); if (error) throw new Error(error.message);
  return sb.storage.from(BUCKET).getPublicUrl(to).data.publicUrl;
}
