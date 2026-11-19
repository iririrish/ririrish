import { watchAuth } from "./auth.js";
import { getProject } from "./projects.js";
const id = new URLSearchParams(location.search).get("id");
watchAuth(async (u) => {
  if (!u) { location.replace("index.html"); return; }
  const t = document.getElementById("t");
  try { const p = id && await getProject(id); t.textContent = p ? p.title : "Project not found"; }
  catch { t.textContent = "You don't have access to this project"; }
});
