// Converts a table block into a LaTeX table (booktabs; multicolumn/multirow for merged cells).
const ESC = { "\\": "\\textbackslash{}", "&": "\\&", "%": "\\%", "$": "\\$", "#": "\\#", "_": "\\_", "{": "\\{", "}": "\\}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}" };
const esc = (s) => String(s).replace(/[\\&%$#_{}~^]/g, (m) => ESC[m]);
function cellTex(html) {
  const t = document.createElement("template"); t.innerHTML = html || "";
  const w = (n) => [...n.childNodes].map((c) => c.nodeType === 3 ? esc(c.textContent)
    : c.nodeType === 1 ? ({ B: (s) => `\\textbf{${s}}`, I: (s) => `\\textit{${s}}`, U: (s) => `\\underline{${s}}`, BR: () => " " }[c.tagName] || ((s) => s))(w(c)) : "").join("");
  return w(t.content).trim();
}
export function tableToLatex(b, num) {
  const A = { left: "l", center: "c", right: "r" }, rows = b.cells.length, cols = b.colW.length;
  const owner = Array.from({ length: rows }, () => Array(cols).fill(null));
  b.cells.forEach((row, r) => row.forEach((x, c) => { if (!x.hide) for (let i = 0; i < x.rs; i++) for (let j = 0; j < x.cs; j++) owner[r + i][c + j] = { r, c, x }; }));
  let multirow = false;
  const out = b.cells.map((row, r) => {
    const parts = []; let c = 0;
    while (c < cols) {
      const o = owner[r][c]; if (!o) { parts.push(""); c++; continue; }
      const { x } = o;
      if (o.r === r) {
        let s = cellTex(x.h);
        if (x.rs > 1) { multirow = true; s = `\\multirow{${x.rs}}{*}{${s}}`; }
        if (x.cs > 1) s = `\\multicolumn{${x.cs}}{${A[b.colAlign[c]] || "l"}}{${s}}`;
        parts.push(s);
      } else parts.push(x.cs > 1 ? `\\multicolumn{${x.cs}}{c}{}` : "");
      c += x.cs;
    }
    return parts.join(" & ") + " \\\\" + (r === 0 && b.header && rows > 1 ? "\n\\midrule" : "");
  });
  const slug = (b.label || b.caption || `table${num}`).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `table${num}`;
  return `% Needs: \\usepackage{booktabs}${multirow ? " and \\usepackage{multirow}" : ""}\n\\begin{table}[h!]\n\\centering\n\\caption{${esc(b.caption || "")}}\n\\label{tab:${slug}}\n\\begin{tabular}{${b.colAlign.map((a) => A[a] || "l").join("")}}\n\\toprule\n${out.join("\n")}\n\\bottomrule\n\\end{tabular}\n\\end{table}`;
}
