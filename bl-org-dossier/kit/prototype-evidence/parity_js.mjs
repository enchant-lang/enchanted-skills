// Node harness: render each corpus file through the compiled kit.
import fs from "node:fs";
const out = process.argv[2], corpus = process.argv[3], dir = process.argv[4];
const A = await import(out + "/abi.mjs");
const M = await import(out + "/ns/dossier.render-client.mjs");
const files = fs.readFileSync(corpus, "utf8").split("\n").filter(Boolean);
files.forEach((f, i) => {
  const t0 = performance.now(); let r;
  try { r = A.invoke(M.d_render, fs.readFileSync(f, "utf8")); } catch (e) { r = "ERROR " + (e && (e.stack || e.message || e)); }
  if (typeof r !== "string") r = "NONSTRING " + String(r);
  fs.writeFileSync(`${dir}/${i}.html`, r);
  console.log(i, Math.round(performance.now() - t0), r.length, f);
});
