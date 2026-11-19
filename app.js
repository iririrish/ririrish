import { isConfigured } from "./firebase-config.js";
import { watchAuth, login, register, googleLogin, resetPassword, logout, authMessage } from "./auth.js";
import { TEMPLATES, createProject, renameProject, deleteProject, duplicateProject, watchProjects } from "./projects.js";

const $ = (s) => document.querySelector(s);
let user = null, projects = [], stop = null, mode = "login", target = null;

function toast(msg, err) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (err ? " err" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = "toast"), 3500);
}
const fmt = (ts) => ts?.toDate ? ts.toDate().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Just now";
const role = (p) => (p.ownerId === user.uid ? "Owner" : p.collaborators?.[user.uid] || "Viewer");
const sharing = (p) => (p.collaboratorIds?.length ? `Shared with ${p.collaboratorIds.length}` : "Private");

// ---------- Auth ----------
function setMode(m) {
  mode = m; const reg = m === "register";
  $("#name-row").hidden = !reg;
  $("#auth-submit").textContent = reg ? "Create account" : "Sign in";
  $("#auth-switch").textContent = reg ? "I already have an account" : "Create an account";
  $("#auth-title").textContent = reg ? "Create your account" : "Sign in to write";
  $("#auth-error").textContent = "";
}
$("#auth-switch").onclick = () => setMode(mode === "login" ? "register" : "login");
$("#auth-form").onsubmit = async (e) => {
  e.preventDefault(); const b = $("#auth-submit"); b.disabled = true; $("#auth-error").textContent = "";
  try {
    const email = $("#email").value.trim(), pw = $("#password").value;
    if (mode === "register") await register($("#display-name").value.trim(), email, pw);
    else await login(email, pw);
  } catch (err) { $("#auth-error").textContent = authMessage(err); }
  b.disabled = false;
};
$("#google-btn").onclick = async () => { try { await googleLogin(); } catch (err) { $("#auth-error").textContent = authMessage(err); } };
$("#forgot").onclick = async () => {
  const email = $("#email").value.trim();
  if (!email) { $("#auth-error").textContent = "Enter your email above, then select Forgot password."; return; }
  try { await resetPassword(email); toast("Password reset email sent."); } catch (err) { $("#auth-error").textContent = authMessage(err); }
};
$("#logout").onclick = () => logout();

watchAuth((u) => {
  user = u; $("#auth-view").hidden = !!u; $("#dash-view").hidden = !u;
  if (stop) { stop(); stop = null; }
  projects = [];
  if (u) {
    $("#user-name").textContent = u.displayName || u.email;
    $("#list").setAttribute("aria-busy", "true");
    stop = watchProjects(u.uid, (l) => { projects = l; render(); }, (err) => { console.error(err); toast("Could not load projects: " + err.message, true); });
  }
});

// ---------- Dashboard ----------
function render() {
  const q = $("#search").value.trim().toLowerCase(), [key, dir] = $("#sort").value.split(":");
  const list = projects.filter((p) => p.title.toLowerCase().includes(q));
  list.sort((a, b) => {
    const r = key === "name" ? a.title.localeCompare(b.title)
      : (a.updatedAt?.toMillis?.() ?? Infinity) - (b.updatedAt?.toMillis?.() ?? Infinity);
    return dir === "desc" ? -r : r;
  });
  const box = $("#list"); box.setAttribute("aria-busy", "false"); box.replaceChildren();
  $("#empty").hidden = list.length > 0;
  $("#empty-text").textContent = projects.length ? "No projects match your search." : "No projects yet. Create one and start writing; Ririrish handles the formatting.";
  list.forEach((p) => box.append(row(p)));
}
function row(p) {
  const el = document.createElement("article"); el.className = "row";
  el.innerHTML = `
    <a class="row-main" href="editor.html?id=${encodeURIComponent(p.id)}">
      <svg class="ico" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z M14 3v5h5"/></svg>
      <span class="row-text"><strong></strong><span class="meta a"></span></span></a>
    <span class="meta tpl"></span><span class="meta mod"></span><span class="pill"></span>
    <details class="menu"><summary aria-label="Project actions"><svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg></summary>
      <div class="menu-pop"><button data-a="open">Open</button><button data-a="rename">Rename</button><button data-a="dup">Duplicate</button><button disabled title="Coming in Phase 7">Share (soon)</button><button data-a="del" class="danger">Delete</button></div></details>`;
  el.querySelector("strong").textContent = p.title;
  el.querySelector(".a").textContent = (p.authors || []).join("; ") || "No author added";
  el.querySelector(".tpl").textContent = TEMPLATES[p.template] || p.template;
  el.querySelector(".mod").textContent = fmt(p.updatedAt);
  el.querySelector(".pill").textContent = `${role(p)} · ${sharing(p)}`;
  if (p.ownerId !== user.uid) el.querySelectorAll('[data-a="rename"],[data-a="del"]').forEach((b) => (b.disabled = true));
  el.querySelector(".menu-pop").onclick = async (e) => {
    const a = e.target.dataset.a; if (!a) return;
    el.querySelector("details").open = false; target = p;
    if (a === "open") location.href = `editor.html?id=${encodeURIComponent(p.id)}`;
    if (a === "rename") { $("#rename-input").value = p.title; $("#rename-dlg").showModal(); }
    if (a === "del") { $("#del-name").textContent = p.title; $("#del-dlg").showModal(); }
    if (a === "dup") try { await duplicateProject(user, p); toast("Project duplicated."); } catch (err) { toast(err.message, true); }
  };
  return el;
}
$("#search").oninput = render; $("#sort").onchange = render;
document.addEventListener("click", (e) => document.querySelectorAll(".menu[open]").forEach((m) => { if (!m.contains(e.target)) m.open = false; }));

$("#tpl").innerHTML = Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
document.querySelectorAll("[data-new]").forEach((b) => (b.onclick = () => { $("#new-form").reset(); $("#new-dlg").showModal(); $("#new-title").focus(); }));
$("#new-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const ref = await createProject(user, { title: $("#new-title").value, author: $("#new-author").value, template: $("#tpl").value });
    $("#new-dlg").close(); location.href = `editor.html?id=${ref.id}`;
  } catch (err) { toast(err.message, true); }
};
$("#rename-form").onsubmit = async (e) => {
  e.preventDefault();
  try { await renameProject(target.id, $("#rename-input").value); $("#rename-dlg").close(); toast("Project renamed."); } catch (err) { toast(err.message, true); }
};
$("#del-confirm").onclick = async () => {
  try { await deleteProject(target.id); $("#del-dlg").close(); toast("Project deleted."); } catch (err) { toast(err.message, true); }
};
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));
if (!isConfigured) $("#setup-banner").hidden = false;
setMode("login");
