import fs from "node:fs";
const [out, corpus] = process.argv.slice(2);
const A = await import(out + "/abi.mjs"); const M = await import(out + "/ns/dossier.render-client.mjs");
const all = [];
for (const f of fs.readFileSync(corpus, "utf8").split("\n").filter(Boolean)) {
  try { const r = A.invoke(M.d_time_blocks, fs.readFileSync(f, "utf8")); const a = [...r].map(Number); all.push(a); console.log(a.map(x=>x.toFixed(1)).join(" "), f.split("/").slice(-1)[0]); }
  catch (e) { console.log("ERR", f, String(e.message || e).slice(0, 120)); }
}
