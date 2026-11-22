// rich.cjs — P4: click rendered text, type, and the Org file changes underneath.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const [base, file, out] = [process.env.BASE, process.env.DOC, process.env.OUT];
let fails = 0; const results = [];
const check = (n, ok, d = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' — ' + d)); results.push({ n, ok, d }); if (!ok) fails++; };
const marks = s => (s.match(/[*\/=~\[\]|]/g) || []).length;

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  for (const [vw, label] of [[{ width: 1280, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']].filter(([_, l]) => (process.env.LABELS || 'desktop,phone').includes(l))) {
    const ctx = await b.newContext({ viewport: vw, extraHTTPHeaders: { 'Tailscale-User-Login': process.env.OWNER }, hasTouch: label === 'phone', isMobile: label === 'phone' });
    const p = await ctx.newPage(); const errs = []; const logs = [];
    p.on('pageerror', e => errs.push((e.stack||e.message).split('\n').slice(0,6).join(' <- '))); p.on('console', m => logs.push(m.text()));
    const t0 = Date.now();
    await p.goto(base + '/#all', { waitUntil: 'domcontentloaded', timeout: 90000 });
    try { await p.waitForFunction(() => document.documentElement.dataset.richEdit === 'ready', null, { timeout: 90000 }); } catch { }
    const ready = await p.evaluate(() => document.documentElement.dataset.richEdit);
    check(`${label} client ready (${Date.now() - t0} ms)`, ready === 'ready', JSON.stringify({ errs: errs.slice(0, 3), logs: logs.slice(-5) }));
    if (ready !== 'ready') { await ctx.close(); continue; }
    await p.evaluate(() => document.getElementById('live-doc-edit').click());
    await p.waitForFunction(() => document.documentElement.hasAttribute('data-live-edit'));
    // one target per kind: a visible text node inside a [data-src] element
    const kinds = (process.env.KINDS || 'p,h2,aside,.rosetta,.stats,.terms,strong,p').split(',');
    for (const kind of kinds) {
      const target = await p.evaluate((kind) => {
        const skip = n => n.parentElement.closest('svg,a,button,summary,textarea,input,code');
        for (const el of document.querySelectorAll('[data-src]')) {
          const hit = el.matches(kind) ? el : (kind === 'strong' ? el.querySelector('strong') : (el.matches(kind) || el.querySelector(kind) === null ? null : null));
          const host = kind === 'strong' ? (el.matches('p') ? el.querySelector('strong') : null) : (el.matches(kind) ? el : null);
          if (!host) continue;
          const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
          let n; while ((n = w.nextNode())) {
            if (n.data.trim().length < 6 || skip(n)) continue;
            const r = document.createRange(); const k = Math.floor(n.data.length / 2); r.setStart(n, k); r.setEnd(n, k + 1);
            const box = r.getBoundingClientRect(); if (box.width === 0) continue;
            el.scrollIntoView({ block: 'center' });
            const b2 = r.getBoundingClientRect();
            return { src: el.dataset.src, x: b2.left + 1, y: b2.top + b2.height / 2, text: n.data.slice(0, 40) };
          }
        }
        return null;
      }, kind);
      if (!target) { check(`${label} ${kind}: a target exists`, false, 'none on page'); continue; }
      const before = fs.readFileSync(file, 'utf8');
      if (label === 'phone') await p.touchscreen.tap(target.x, target.y); else await p.mouse.click(target.x, target.y);
      await p.waitForTimeout(200);
      const st = await p.evaluate(() => ({ ce: document.activeElement && document.activeElement.isContentEditable, ta: !!document.querySelector('.ld-editor textarea'), state: (document.querySelector('[data-rich-edit]:not(html)') || {}).dataset?.richEdit }));
      check(`${label} ${kind}: opens in place, no source shown`, st.ce && !st.ta, JSON.stringify(st));
      if (!st.ce) { await p.keyboard.press('Escape'); continue; }
      const token = ` qa${label}${kind.replace(/\W/g, '')}`;
      await p.keyboard.type(token, { delay: 25 });
      await p.waitForTimeout(1500);
      await p.waitForFunction(() => !document.activeElement || document.activeElement.dataset.richEdit !== 'saving', null, { timeout: 8000 }).catch(() => {});
      const state = await p.evaluate(() => document.activeElement && document.activeElement.dataset.richEdit);
      const why = await p.evaluate(() => document.activeElement && document.activeElement.title);
      const after = fs.readFileSync(file, 'utf8');
      const bl = before.split('\n'), al = after.split('\n');
      const changed = []; for (let i = 0; i < Math.max(bl.length, al.length); i++) if (bl[i] !== al[i]) changed.push(i);
      const [a, z] = target.src.split(':').map(Number);
      const inNode = changed.every(i => i >= a && i < z);
      const hasToken = after.includes(token.trim());
      const markOk = marks(bl.slice(a, z).join('\n')) === marks(al.slice(a, z).join('\n'));
      check(`${label} ${kind}: saved into its own lines with markup intact`, state === 'saved' && hasToken && inNode && markOk && changed.length > 0,
        JSON.stringify({ state, why, changed, src: target.src, hasToken, markOk, text: target.text }));
      if (label === 'desktop' && kind === 'p') await p.screenshot({ path: path.join(out, 'rich-p-desktop.png') });
      await p.keyboard.press('Escape'); await p.waitForTimeout(600);
    }
    console.log(logs.filter(l => l.includes('rich-edit')).slice(-30).join('\n'));
    check(`${label} no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(path.join(out, 'rich-results.json'), JSON.stringify(results, null, 1));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
