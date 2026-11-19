// PDF.js viewer for the compiled manuscript: pages, zoom, fit width, page navigation, download.
const BASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
let ready, doc, bytes, fileName = "manuscript.pdf", scale = 1.2, fit = true, els = {}, wraps = [], io, vp1, gen = 0;

function loadLib() {
  ready ||= (async () => {
    if (!window.pdfjsLib) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = BASE + "pdf.min.js"; s.onload = res; s.onerror = () => rej(new Error("Could not load PDF.js. Check your connection.")); document.head.append(s); });
    // A cross-origin worker is not allowed, so load the worker code and run it from a local blob.
    const code = await (await fetch(BASE + "pdf.worker.min.js")).text();
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    return window.pdfjsLib;
  })();
  ready.catch(() => (ready = null));
  return ready;
}
export function initPreview(e, { onCompile }) {
  els = e; e.compile.onclick = onCompile;
  e.prev.onclick = () => go(-1); e.next.onclick = () => go(1);
  e.zin.onclick = () => zoom(1.15); e.zout.onclick = () => zoom(1 / 1.15);
  e.fit.onclick = () => { fit = true; applyScale(); };
  e.dl.onclick = download;
  let raf = 0; e.scroll.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(updatePage); });
  new ResizeObserver(() => { if (fit && doc && e.scroll.clientWidth > 0) applyScale(); }).observe(e.scroll);
  io = new IntersectionObserver((list) => list.forEach((en) => { if (en.isIntersecting && !en.target.dataset.r) render(en.target); }), { root: e.scroll, rootMargin: "900px 0px" });
}
export const setBusy = (b) => { els.compile.disabled = b; els.compile.textContent = b ? "Compiling…" : "Recompile"; };
export const setMessage = (t, err) => { els.msg.textContent = t || ""; els.msg.style.color = err ? "var(--danger)" : ""; els.msg.hidden = !t; };
export const setStale = (b) => { if (els.stale) els.stale.hidden = !b || !doc; };
export async function showPdf(data, name) {
  const lib = await loadLib(); bytes = data; fileName = name || fileName;
  if (doc) doc.destroy();
  doc = await lib.getDocument({ data: data.slice() }).promise;
  vp1 = (await doc.getPage(1)).getViewport({ scale: 1 });
  wraps = Array.from({ length: doc.numPages }, (_, i) => { const w = document.createElement("div"); w.className = "pgw"; w.dataset.n = i + 1; return w; });
  els.pages.replaceChildren(...wraps); applyScale(); els.stale.hidden = true;
}
function applyScale() {
  if (!doc) return; gen++;
  if (fit) scale = Math.max(0.3, (els.scroll.clientWidth - 32) / vp1.width);
  els.zoom.textContent = Math.round(scale * 75) + "%";   // 100% = true paper size at 96 dpi
  for (const w of wraps) { w.style.width = vp1.width * scale + "px"; w.style.height = vp1.height * scale + "px"; w.replaceChildren(); delete w.dataset.r; io.unobserve(w); io.observe(w); }
  updatePage();
}
async function render(w) {
  w.dataset.r = "1"; const g = gen;
  try {
    const page = await doc.getPage(+w.dataset.n), ratio = window.devicePixelRatio || 1, vp = page.getViewport({ scale: scale * ratio });
    const cv = document.createElement("canvas"); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    if (g === gen) w.replaceChildren(cv);
  } catch (e) { if (g === gen) delete w.dataset.r; console.warn(e); }
}
function zoom(k) { fit = false; scale = Math.min(4, Math.max(0.4, scale * k)); applyScale(); }
function current() { const top = els.scroll.scrollTop + els.scroll.clientHeight / 3; let n = 1; for (const w of wraps) { if (w.offsetTop <= top) n = +w.dataset.n; else break; } return n; }
function updatePage() { els.page.textContent = doc ? `${current()} / ${doc.numPages}` : "– / –"; }
function go(d) { if (!doc) return; const n = Math.min(doc.numPages, Math.max(1, current() + d)); els.scroll.scrollTo({ top: wraps[n - 1].offsetTop - 12, behavior: "smooth" }); }
function download() {
  if (!bytes) { els.msg.hidden = false; els.msg.textContent = "Compile the PDF first, then download it."; return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })); a.download = fileName; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
