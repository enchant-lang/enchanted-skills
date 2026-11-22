// priv/lib/js/portable-leaves.mjs — host functions ordinary programs reach
// (renderers, formatters, parsers), with the BEAM's answers on the JS value
// model. Measured on the BEAM 2026-11-22; test/bl/js_portable_leaves_test.bl
// pins them. They are written here, not in a Beam Lisp namespace like
// js.binary, because programs call them while their own modules load (a
// palette parsed at the top of a namespace): a leaf that reached a compiled
// namespace could run before that namespace was evaluated.
import * as R from "./rt.mjs";
import { reOpts, badarg, badarith, exactInteger, beamOnly } from "./host-leaves.mjs";
const { Tup, Flt } = R;
const kw = (s) => R.kw(s);
const T = (...xs) => new Tup(xs);
const fnum = (x, what) => { if (x instanceof Flt) return x.v; if (exactInteger(x)) return Number(x); badarg(what); };
const toInt = (v) => (Number.isSafeInteger(v) ? v : R.add(BigInt(v), 0));
const halfAway = (v) => (v < 0 ? -Math.round(-v) : Math.round(v));
const mathFloat = (what, f) => (...xs) => { const v = f(...xs.map((x) => fnum(x, what))); if (!Number.isFinite(v)) badarith(); return R.flt(v); };


const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
function parseInteger(text, base) {
  if (typeof text !== "string" || !exactInteger(base) || base < 2 || base > 36) badarg("binary_to_integer");
  const s = text.toLowerCase(); const sign = s[0]; const start = sign === "-" || sign === "+" ? 1 : 0;
  if (start >= s.length) badarg("binary_to_integer");
  let acc = 0n; const b = BigInt(base);
  for (let i = start; i < s.length; i++) { const d = DIGITS.indexOf(s[i]); if (d < 0 || d >= base) badarg("binary_to_integer"); acc = acc * b + BigInt(d); }
  return R.add(sign === "-" ? -acc : acc, 0);
}
function gregorianDays(y, m, d) {
  if (![y, m, d].every(exactInteger) || m < 1 || m > 12 || d < 1 || d > 31) badarg("date_to_gregorian_days");
  y = Number(y) - (m <= 2 ? 1 : 0);
  const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468 + 719528;
}
const utf8 = new TextEncoder();
const hex2 = (b) => b.toString(16).toUpperCase().padStart(2, "0");
const wwwEncode = (s) => [...utf8.encode(s)].map((b) => (b === 32 ? "+" : /[A-Za-z0-9._~-]/.test(String.fromCharCode(b)) && b < 128 ? String.fromCharCode(b) : "%" + hex2(b))).join("");
const wwwDecode = (s) => decodeURIComponent(s.replace(/\+/g, " "));
const trimLeading = (s, t) => { if (t === "") return s; while (s.startsWith(t)) s = s.slice(t.length); return s; };
const trimTrailing = (s, t) => { if (t === "") return s; while (s.endsWith(t)) s = s.slice(0, s.length - t.length); return s; };
const hex = (s, lower) => { const h = [...utf8.encode(s)].map(hex2).join(""); return lower ? h.toLowerCase() : h; };
/** Regex.split: pieces between matches; include? keeps each WHOLE match (JS
    split would splice in every capture group); trim? drops every empty piece;
    parts > 0 stops after that many pieces. */
function regexSplit(re, s, include, trim, parts) {
  const out = []; let at = 0, pieces = 1;
  for (const m of s.matchAll(re)) {
    if (parts > 0 && pieces >= parts) break;
    if (m[0].length === 0 && (m.index === 0 || m.index === s.length)) continue;
    out.push(s.slice(at, m.index)); if (include) out.push(m[0]);
    at = m.index + m[0].length; pieces++;
  }
  out.push(s.slice(at));
  return L(trim ? out.filter((x) => x !== "") : out);
}
const L = (a) => R.listFromArray(a);
const trimSlashes = (p) => { while (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1); return p; };
function pathJoin(a, b) { b = b.replace(/^\/+/, ""); if (a === "") return trimSlashes(b); if (b === "") return trimSlashes(a); return trimSlashes((a === "/" ? "" : trimSlashes(a)) + "/" + b); }
function pathBasename(p) { p = trimSlashes(p); return p === "/" ? "" : p.slice(p.lastIndexOf("/") + 1); }
function pathDirname(p) { p = trimSlashes(p); const i = p.lastIndexOf("/"); return i < 0 ? "." : i === 0 ? "/" : trimSlashes(p.slice(0, i)); }
function pathExtname(p) { const b = pathBasename(p), i = b.lastIndexOf("."); return i <= 0 ? "" : b.slice(i); }
function pathRootname(p) { const e = pathExtname(p); return e === "" ? p : p.slice(0, p.length - e.length); }

/** The leaves, given leaves.mjs's `lateModule` (no import cycle). */
export function portableLeaves(lateModule) {
  const B = () => lateModule("js.binary");
  const appEnv = new Map();
  const appKey = (app, k) => R.printStr(app) + "\u0000" + R.printStr(k);
  return {
  "erlang/round/1": (x) => (exactInteger(x) ? x : toInt(halfAway(fnum(x, "round")))),
  "erlang/ceil/1": (x) => (exactInteger(x) ? x : toInt(Math.ceil(fnum(x, "ceil")))),
  "erlang/floor/1": (x) => (exactInteger(x) ? x : toInt(Math.floor(fnum(x, "floor")))),
  "erlang/float/1": (x) => R.flt(fnum(x, "float")),
  "erlang/binary_to_integer/1": (s) => parseInteger(s, 10),
  "erlang/binary_to_integer/2": (s, base) => parseInteger(s, base),
  "erlang/binary_to_float/1": (s) => {
    if (typeof s !== "string" || !/^[+-]?[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?$/.test(s)) badarg("binary_to_float");
    return R.flt(parseFloat(s));
  },
  // A page has no atom table to exhaust: an "existing" atom is the keyword.
  "erlang/binary_to_existing_atom/2": (s) => (s === "nil" ? null : s === "true" ? true : s === "false" ? false : kw(s)),
  "erlang/phash2/1": beamOnly("erlang/phash2/1"),
  "erlang/phash2/2": beamOnly("erlang/phash2/2"),
  "math/pow/2": mathFloat("pow", Math.pow),
  "math/sqrt/1": mathFloat("sqrt", Math.sqrt),
  "math/log/1": mathFloat("log", Math.log),
  "math/log2/1": mathFloat("log2", Math.log2),
  "math/log10/1": mathFloat("log10", Math.log10),
  "math/exp/1": mathFloat("exp", Math.exp),
  "math/sin/1": mathFloat("sin", Math.sin),
  "math/cos/1": mathFloat("cos", Math.cos),
  "math/tan/1": mathFloat("tan", Math.tan),
  "math/atan2/2": mathFloat("atan2", Math.atan2),
  "math/floor/1": mathFloat("floor", Math.floor),
  "math/ceil/1": mathFloat("ceil", Math.ceil),
  "math/pi/0": () => R.flt(Math.PI),
  "calendar/date_to_gregorian_days/3": (y, m, d) => gregorianDays(y, m, d),
  "Elixir.URI/encode_www_form/1": (s) => wwwEncode(s),
  "Elixir.URI/decode_www_form/1": (s) => wwwDecode(s),
  "Elixir.String/trim_leading/2": (s, t) => trimLeading(s, t),
  "Elixir.String/trim_trailing/2": (s, t) => trimTrailing(s, t),
  "binary/encode_hex/1": (s) => hex(s, false),
  "binary/encode_hex/2": (s, c) => hex(s, c === kw("lowercase")),
  "binary/match/3": (s, pattern, opts) => {
    const scope = reOpts(opts).get("scope");
    if (!scope) return B().d_match(s, pattern);
    const [start, len] = scope.items;
    const found = B().d_match(B().d_part(s, start, len), pattern);
    return found instanceof Tup ? T(found.items[0] + start, found.items[1]) : found;
  },
  "Elixir.Regex/split/2": (r, s) => regexSplit(r.global(), s, false, false, 0),
  "Elixir.Regex/split/3": (r, s, opts) => {
    const o = reOpts(opts);
    return regexSplit(r.global(), s, o.get("include_captures") === true, o.get("trim") === true, o.get("parts") ?? 0);
  },
  // Paths are text: the pure ones answer; a page has no filesystem, so every
  // File call (and Path.expand, which reads the cwd) is a named refusal. Code
  // that reaches them compiles, and fails loudly only if a page runs it.
  "Elixir.Path/join/2": (a, b) => pathJoin(a, b),
  "Elixir.Path/basename/1": (p) => pathBasename(p),
  "Elixir.Path/dirname/1": (p) => pathDirname(p),
  "Elixir.Path/extname/1": (p) => pathExtname(p),
  "Elixir.Path/rootname/1": (p) => pathRootname(p),
  ...Object.fromEntries(["Elixir.Path/expand/1", "Elixir.Path/expand/2", "Elixir.Path/wildcard/1",
    "Elixir.File/read!/1", "Elixir.File/read/1", "Elixir.File/write!/2", "Elixir.File/write/2",
    "Elixir.File/regular?/1", "Elixir.File/exists?/1", "Elixir.File/dir?/1", "Elixir.File/ls!/1", "Elixir.File/ls/1",
    "Elixir.File/mkdir_p!/1", "Elixir.File/rm/1", "Elixir.File/rm!/1", "Elixir.File/stat!/1", "Elixir.File/stat!/2",
    "Elixir.File/rename!/2", "Elixir.File/cwd!/0"].map((k) => [k, beamOnly(k)])),
  // A page loads namespaces from its module graph, never from source files.
  "Elixir.BeamLisp.Loader/source_path/1": () => null,
  // A page has no process environment: every variable is unset.
  "Elixir.System/get_env/1": () => null,
  "Elixir.System/get_env/2": (_k, d) => d,
  "Elixir.BeamLisp.Env/os_get_env/1": () => null,
  "Elixir.Application/get_env/2": (app, k) => (appEnv.has(appKey(app, k)) ? appEnv.get(appKey(app, k)) : null),
  "Elixir.Application/get_env/3": (app, k, d) => (appEnv.has(appKey(app, k)) ? appEnv.get(appKey(app, k)) : d),
  "Elixir.Application/put_env/3": (app, k, v) => { appEnv.set(appKey(app, k), v); return kw("ok"); },
  };
}
