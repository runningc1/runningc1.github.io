/* Dashforge app shell. Feature flags decide which permutation this page is.
   Flags: roleChips, scrubber, alertsPoint, storyRibbon, footer, flow, altForms, drilldown, controlDim, liveAlert */
(function () {
  'use strict';
  const DEFAULT_FLAGS = { scrubber: true, alertsPoint: true, storyRibbon: false, footer: false, flow: false, altForms: false, drilldown: true, controlDim: false, liveAlert: true };
  const FLAG_LABELS = { scrubber: 'Time scrubber', alertsPoint: 'Alerts that point', storyRibbon: 'Story ribbon', footer: 'Reconciliation footer', flow: 'Flow diagram', altForms: 'Alternate chart forms', drilldown: 'KPI drill-down', controlDim: 'Dim what the role cannot control', liveAlert: 'Live alert after render' };
  const EXAMPLES = ['VP of Sales', 'Marketing manager', 'Head of customer support', 'Support agent on the technical queue', 'Customer success manager', 'General manager', 'Demand gen lead', 'RevOps analyst'];

  const App = { world: null, day: 89, plan: null, flags: null, lastText: '' };
  window.App = App;

  function readFlags() {
    const f = Object.assign({}, DEFAULT_FLAGS, window.DASHFORGE_FLAGS || {});
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    h.forEach((v, k) => { if (k in f) f[k] = v === '1'; });
    return f;
  }
  function writeFlags() { const h = new URLSearchParams(); Object.keys(App.flags).forEach(k => h.set(k, App.flags[k] ? '1' : '0')); history.replaceState(null, '', '#' + h.toString()); }

  async function loadWorld() {
    try { const r = await fetch('world.json', { cache: 'force-cache' }); if (!r.ok) throw new Error(r.status); App.world = Engine.hydrate(await r.json()); App.source = 'world.json (pre-generated)'; }
    catch (e) { App.world = Engine.build(); App.source = 'engine (in-browser, world.json not reachable)'; }
  }

  // ---- layout skeleton ----
  function $(sel) { return document.querySelector(sel); }
  function h(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function skeleton() {
    const page = $('#app'); page.replaceChildren();
    const hero = h('div', 'hero'); page.appendChild(hero);
    const brand = h('div', 'brand'); brand.appendChild(h('h1', null, 'Dashforge')); brand.appendChild(h('span', 'sub', 'An agent that builds custom dashboards.')); const perm = h('span', 'perm', window.DASHFORGE_NAME || 'custom'); brand.appendChild(perm); hero.appendChild(brand);
    hero.appendChild(h('div', 'ask', 'Describe the business employee this dashboard is for, in plain language. For example: "a regional sales manager who runs the West territory" or "a customer service rep working billing tickets".'));
    const form = h('form', 'prompt'); const inp = h('input'); inp.id = 'q'; inp.placeholder = 'Who is this dashboard for?'; inp.autocomplete = 'off'; inp.setAttribute('aria-label', 'Describe who the dashboard is for'); form.appendChild(inp); const go = h('button', null, 'Build dashboard'); go.type = 'submit'; form.appendChild(go); hero.appendChild(form);
    form.addEventListener('submit', ev => { ev.preventDefault(); build(inp.value.trim() || 'General manager'); });

    const tb = h('div', 'toolbar'); tb.id = 'toolbar'; page.appendChild(tb);
    page.appendChild(h('div', null)).id = 'stage';
    page.appendChild(h('div', null)).id = 'dash';
    page.appendChild(h('div', null)).id = 'panels';
    toolbar();
  }

  function toolbar() {
    const tb = $('#toolbar'); tb.replaceChildren();
    if (App.flags.scrubber) {
      const s = h('div', 'scrub'); s.appendChild(h('span', 'label', 'As of'));
      const rng = h('input'); rng.type = 'range'; rng.min = 14; rng.max = 89; rng.value = App.day; s.appendChild(rng);
      const d = h('span', 'date', fmtDate(App.world.dates[App.day])); s.appendChild(d);
      rng.addEventListener('input', () => { App.day = +rng.value; d.textContent = fmtDate(App.world.dates[App.day]); if (App.plan) renderDash(); });
      tb.appendChild(s);
    }
    const tg = h('div', 'toggles'); tg.appendChild(h('span', 'label', 'Features'));
    Object.keys(FLAG_LABELS).forEach(k => { const l = h('label'); const cb = h('input'); cb.type = 'checkbox'; cb.checked = !!App.flags[k]; cb.addEventListener('change', () => { App.flags[k] = cb.checked; writeFlags(); toolbar(); if (App.plan) renderDash(); }); l.appendChild(cb); l.appendChild(document.createTextNode(FLAG_LABELS[k])); tg.appendChild(l); });
    tb.appendChild(tg);
  }
  const fmtDate = t => t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ---- build: staged "visible reasoning" then render ----
  let buildSeq = 0;
  async function build(text, opts) {
    const seq = ++buildSeq; App.lastText = text; Table.STATE && Object.keys(Table.STATE).forEach(k => delete Table.STATE[k]);
    const stage = $('#stage'); stage.replaceChildren();
    const steps = ['Reading the role', 'Choosing metrics from the catalog', 'Arranging the layout', 'Pulling numbers from the world'];
    const box = h('div', 'stage'); steps.forEach(s => { const st = h('div', 'step'); st.appendChild(h('i', 'dot')); st.appendChild(document.createTextNode(s)); box.appendChild(st); }); stage.appendChild(box);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const quick = opts && opts.instant;
    // Ask the server agent if one exists; otherwise the local planner.
    let plan = null;
    const p = remotePlan(text);
    for (let i = 0; i < steps.length; i++) { box.children[i].classList.add('active'); if (i > 0) box.children[i - 1].classList.replace('active', 'done'); await wait(quick ? 60 : 380); if (seq !== buildSeq) return; }
    plan = await p; if (seq !== buildSeq) return;
    box.children[steps.length - 1].classList.replace('active', 'done');
    App.plan = plan || Planner.plan(text, App.world, App.day);
    setTimeout(() => { if (seq === buildSeq) stage.replaceChildren(); }, 600);
    toolbar(); renderDash(); panels();
    if (App.flags.liveAlert) setTimeout(() => { if (seq === buildSeq) liveAlert(); }, 4000);
  }

  async function remotePlan(text) {
    if (window.DASHFORGE_NO_REMOTE) return null;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
      const r = await fetch('api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: text, day: App.day }), signal: ctl.signal });
      clearTimeout(t); if (!r.ok) return null; const j = await r.json(); if (!j || !j.plan) return null;
      return Planner.sanitize(j.plan, text, App.world, App.day);
    } catch (e) { return null; }
  }

  // ---- render ----
  function renderDash() {
    const W = App.world, d = App.day, P = App.plan, K = Catalog.KPIS, B = Catalog.BLOCKS;
    document.body.dataset.accent = P.accent;
    const dash = $('#dash'); dash.replaceChildren();

    // role card
    const rc = h('div', 'rolecard');
    const c1 = h('div'); c1.appendChild(h('div', 'rt', 'Reports to ' + P.role_card.reports_to + (P.source === 'llm' ? '  |  planned by the model' : '  |  planned by the local fallback' + (P.matched === false ? ' (no role matched, showing the GM view)' : '')))); c1.appendChild(h('h2', null, P.role_card.title)); c1.appendChild(h('p', null, P.role_card.day_looks_like)); c1.appendChild(h('div', 'req', 'Request: "' + (P.role_card.request || App.lastText) + '"')); rc.appendChild(c1);
    const c2 = h('div'); c2.appendChild(h('h3', null, 'Measured on')); const u2 = h('ul'); (P.role_card.measured_on || []).forEach(x => u2.appendChild(h('li', null, x))); c2.appendChild(u2); rc.appendChild(c2);
    const c3 = h('div'); c3.appendChild(h('h3', null, 'Can control')); const u3 = h('ul'); (P.role_card.can_control || []).forEach(x => u3.appendChild(h('li', null, x))); c3.appendChild(u3); rc.appendChild(c3);
    dash.appendChild(rc);

    if (App.flags.storyRibbon) dash.appendChild(ribbon());

    // KPIs
    const kp = h('div', 'kpis'); dash.appendChild(kp);
    P.kpis.forEach(id => { const def = K[id]; if (!def) return; const r = def.compute(W, d); const t = h('div', 'kpi'); t.dataset.kpi = id; t.appendChild(h('div', 'label', def.label)); const row = h('div', 'row'); row.appendChild(h('div', 'value', def.format(r.value))); const sp = h('div'); Charts.spark(sp, r.spark); row.appendChild(sp); t.appendChild(row); const ch = Catalog.pct(r.value, r.prev); const goodDir = (def.better === 'up') === (ch >= 0); const dl = h('div', 'delta ' + (Math.abs(ch) < 0.005 ? '' : goodDir ? 'good' : 'bad')); const b = h('b', null, (ch >= 0 ? '+' : '') + (ch * 100).toFixed(1) + '%'); dl.appendChild(b); dl.appendChild(document.createTextNode('vs ' + (r.prevLabel || 'prior'))); t.appendChild(dl); if (App.flags.drilldown) t.addEventListener('click', () => drill(id, t)); kp.appendChild(t); });
    const drillHost = h('div'); drillHost.id = 'drill'; dash.appendChild(drillHost);

    // insight
    const ins = h('div', 'insight'); ins.appendChild(h('b', null, 'What the data says')); ins.appendChild(document.createTextNode(P.insight)); dash.appendChild(ins);

    // blocks
    const grid = h('div', 'grid'); dash.appendChild(grid);
    let blocks = P.blocks.map(b => ({ id: b.id, w: b.w }));
    if (App.flags.altForms && P.alt) blocks = blocks.map(b => P.alt[b.id] && B[P.alt[b.id]] ? { id: P.alt[b.id], w: b.w } : b);
    if (App.flags.altForms) { // add forms the role would not otherwise get, once
      const extra = { sales_manager: ['rep_dotstrip'], sales_rep: ['quota_bullets'], support_manager: ['ticket_heatmap'], gm_exec: ['arr_waterfall'], marketing_manager: ['cpl_slope'], customer_success: ['arr_waterfall'] };
      const arch = Planner.match(P.role_card.request || App.lastText).archetype.id;
      (extra[arch] || []).forEach(id => { if (!blocks.some(b => b.id === id)) blocks.splice(2, 0, { id, w: B[id].w }); });
    }
    if (App.flags.flow && !blocks.some(b => b.id === 'flow_diagram')) blocks.unshift({ id: 'flow_diagram', w: 12 });
    if (!blocks.some(b => B[b.id].kind === 'table')) blocks.push({ id: 'open_tickets', w: 12 });
    blocks.forEach(b => renderBlock(grid, b));

    // left off
    const lo = h('div', 'leftoff'); lo.appendChild(h('h3', null, 'Left off on purpose')); const ul = h('ul'); (P.left_off || []).forEach(x => { const li = h('li'); li.appendChild(h('b', null, x.metric + '. ')); li.appendChild(document.createTextNode(x.why)); ul.appendChild(li); }); lo.appendChild(ul); dash.appendChild(lo);

    if (App.flags.footer) { const f = h('div', 'footer'); const add = (l, v) => { const s = h('span'); s.appendChild(document.createTextNode(l + ' ')); s.appendChild(h('b', null, v)); f.appendChild(s); }; add(W.profile.name, W.profile.industry); add('As of', fmtDate(W.dates[d])); add('Active customers', Catalog.fmt.int(W.active[d])); add('ARR', Catalog.fmt.money(W.arr[d])); add('Open tickets', Catalog.fmt.int(W.backlog[d])); add('Bookings MTD', K.bookings_mtd.format(K.bookings_mtd.compute(W, d).value)); add('Same numbers on every dashboard', ''); dash.appendChild(f); }
  }

  function renderBlock(grid, b) {
    const W = App.world, d = App.day, def = Catalog.BLOCKS[b.id]; if (!def) return;
    const box = h('div', 'block w' + b.w); box.id = 'blk-' + b.id;
    const t = h('h3'); t.appendChild(document.createTextNode(def.title)); t.appendChild(h('span', 'dom', def.domain === 'all' ? 'all functions' : def.domain)); box.appendChild(t);
    if (App.flags.controlDim && def.domain !== 'all' && !App.plan.alerts_focus.includes(def.domain === 'cs' ? 'support' : def.domain)) box.classList.add('dim');
    const body = h('div'); box.appendChild(body); grid.appendChild(box);
    const spec = def.data(W, d);
    try {
      switch (def.kind) {
        case 'line': Charts.line(body, spec); break;
        case 'stacked': Charts.stacked(body, spec); break;
        case 'bar': Charts.bar(body, spec); break;
        case 'hbar': Charts.hbar(body, spec); break;
        case 'donut': Charts.donut(body, spec); break;
        case 'funnel': Charts.funnel(body, spec); break;
        case 'bullet': Charts.bullet(body, spec); break;
        case 'multiples': Charts.multiples(body, spec); break;
        case 'waterfall': Charts.waterfall(body, spec); break;
        case 'heatmap': Charts.heatmap(body, spec); break;
        case 'slope': Charts.slope(body, spec); break;
        case 'dots': Charts.dots(body, spec); break;
        case 'flow': Charts.flow(body, spec); break;
        case 'table': Table.render(body, spec, b.id); break;
        case 'alerts': renderAlerts(body, spec.alerts); break;
      }
    } catch (e) { body.textContent = 'Render error: ' + e.message; console.error(b.id, e); }
  }

  function renderAlerts(body, alerts) {
    body.replaceChildren(); const list = h('div', 'alerts'); body.appendChild(list);
    const focus = App.plan.alerts_focus;
    alerts.slice().sort((a, b) => (focus.includes(a.domain === 'cs' ? 'support' : a.domain) ? 0 : 1) - (focus.includes(b.domain === 'cs' ? 'support' : b.domain) ? 0 : 1)).forEach(a => list.appendChild(alertEl(a)));
  }
  function alertEl(a) {
    const focus = App.plan.alerts_focus; const inFocus = a.domain === 'all' || focus.includes(a.domain === 'cs' ? 'support' : a.domain);
    const e = h('div', 'alert ' + a.sev + (inFocus ? '' : ' muted')); e.appendChild(h('i')); const tx = h('div'); tx.appendChild(h('div', 'sev', a.sev + (inFocus ? '' : ' (outside this role)'))); tx.appendChild(h('div', null, a.text));
    if (App.flags.alertsPoint && a.target) { const target = [a.target].concat(a.alt || []).find(id => document.getElementById('blk-' + id)); if (target) { tx.appendChild(h('div', 'go', 'Show me: ' + Catalog.BLOCKS[target].title)); e.addEventListener('click', () => pointTo(target)); } }
    e.appendChild(tx); return e;
  }
  function pointTo(id) { const el = document.getElementById('blk-' + id); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 1800); }
  function liveAlert() {
    const host = document.querySelector('#blk-alert_feed .alerts'); if (!host) return;
    const W = App.world, d = App.day; const rows = W.openTickets(d); const t = rows.filter(r => r.priority === 'Urgent').sort((a, b) => b.age - a.age)[0] || rows[0]; if (!t) return;
    const a = { sev: 'critical', domain: 'support', text: 'New: ' + t.id + ' (' + t.customer + ', ' + t.queue.toLowerCase() + ') just crossed SLA at ' + t.age.toFixed(1) + 'h, ' + (t.owner === 'Unassigned' ? 'still unassigned' : 'owned by ' + t.owner), target: 'open_tickets', alt: ['ticket_aging', 'alert_feed'] };
    const e = alertEl(a); e.classList.add('new'); host.prepend(e);
  }

  function ribbon() {
    const W = App.world, d = App.day; const r = h('div', 'ribbon'); r.appendChild(h('div', 'track'));
    const pos = day => 'calc(14px + ' + (day / (W.DAYS - 1) * 100) + '% * (1 - 28px / 100%))';
    const pct = day => (14 + day / (W.DAYS - 1) * 0.0) ; // placeholder, replaced below
    const left = day => 'calc(14px + (100% - 28px) * ' + (day / (W.DAYS - 1)).toFixed(4) + ')';
    const now = h('div', 'now'); now.style.left = left(d); r.appendChild(now);
    const focus = App.plan.alerts_focus;
    W.events.forEach(e => { const el = h('div', 'ev'); el.style.left = left(e.day); el.appendChild(h('i')); el.appendChild(document.createTextNode(fmtDate(W.dates[e.day]).replace(/, \d{4}/, '') + ': ' + e.label)); if (e.day > d) el.classList.add('future'); else if (focus.includes(e.domain)) el.classList.add('lit'); el.title = e.detail + (focus.includes(e.domain) ? '' : ' (not this role\'s problem yet; it will reach them through ' + (e.domain === 'marketing' ? 'pipeline' : 'churn risk') + ')'); r.appendChild(el); });
    r.appendChild(h('div', 'lab', '90-day story ribbon. Lit marker = this role\'s problem. Dim = happening to someone else in the same company.'));
    return r;
  }

  function drill(id, tile) {
    const host = $('#drill'); const open = tile.classList.contains('open');
    document.querySelectorAll('.kpi.open').forEach(x => x.classList.remove('open')); host.replaceChildren(); if (open) return;
    tile.classList.add('open'); const W = App.world, d = App.day, def = Catalog.KPIS[id]; const r = def.compute(W, d);
    const box = h('div', 'drill'); const head = h('div', 'head'); head.appendChild(h('h3', null, def.label + ': 60-day trend and breakdown')); const x = h('button', 'btn ghost small', 'Close'); x.addEventListener('click', () => drill(id, tile)); head.appendChild(x); box.appendChild(head);
    const g2 = h('div', 'grid2'); const left = h('div'), right = h('div'); g2.appendChild(left); g2.appendChild(right); box.appendChild(g2); host.appendChild(box);
    // 60-day series of the KPI value
    const vals = []; for (let i = 59; i >= 0; i--) vals.push(def.compute(W, Math.max(14, d - i)).value);
    Charts.line(left, { x: Catalog.win(W.dates, d, 60), series: [{ name: def.label, values: vals }], format: def.format, target: r.target != null ? { label: 'target', value: r.target } : null, events: W.events });
    // breakdown by the KPI's natural dimension
    const bd = breakdown(id); if (bd) Charts.hbar(right, bd); else right.appendChild(h('div', 'chart-note', 'No breakdown dimension for this metric.'));
  }
  function breakdown(id) {
    const W = App.world, d = App.day, B = Catalog.BLOCKS;
    const dom = Catalog.KPIS[id].domain;
    if (['bookings_mtd', 'quota_attainment', 'avg_deal_size', 'arr'].includes(id)) return B.revenue_by_region.data(W, d);
    if (['mqls', 'cac', 'blended_cpl', 'roas', 'site_traffic', 'mql_to_sql'].includes(id)) return B.cpl_by_channel.data(W, d);
    if (dom === 'support' || dom === 'cs') { const s = B.ticket_aging.data(W, d); return { categories: s.categories, values: s.values, format: s.format, colors: s.colors }; }
    if (['pipeline_coverage', 'win_rate', 'sales_cycle'].includes(id)) { const rows = W.openOpps(d); const st = ['Discovery', 'Demo', 'Proposal', 'Negotiation', 'Verbal']; return { categories: st, values: st.map(s => rows.filter(r => r.stage === s).reduce((a, r) => a + r.amount, 0)), format: Catalog.fmt.money }; }
    return null;
  }

  // ---- prompt preview / paste reply / BYO key ----
  function panels() {
    const host = $('#panels'); host.replaceChildren();
    const W = App.world, d = App.day, text = App.lastText;
    const det = h('details', 'panel'); det.appendChild(h('summary', null, 'Agent prompt (what the model sees) and paste-a-reply'));
    const note = h('div', 'note', 'This is the exact prompt the server route sends to the model, including the pre-generated data digest as of ' + fmtDate(W.dates[d]) + '. Copy it into Claude, paste the JSON reply below, and the page renders it. Data source: ' + App.source + '.'); det.appendChild(note);
    const ta = h('textarea'); ta.readOnly = true; ta.value = Planner.buildPrompt(text, W, d); det.appendChild(ta);
    const row = h('div', 'row'); const cp = h('button', 'btn small', 'Copy prompt'); cp.type = 'button'; cp.addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(ta.value); cp.textContent = 'Copied'; setTimeout(() => cp.textContent = 'Copy prompt', 1200); }); row.appendChild(cp); det.appendChild(row);
    const ta2 = h('textarea'); ta2.placeholder = 'Paste the model\'s JSON reply here'; ta2.style.minHeight = '90px'; det.appendChild(ta2);
    const row2 = h('div', 'row'); const ap = h('button', 'btn small', 'Render pasted reply'); ap.type = 'button'; const msg = h('span', 'note'); ap.addEventListener('click', () => { try { const j = JSON.parse(ta2.value.replace(/^```json|```$/g, '').trim()); App.plan = Planner.sanitize(j, text, W, d); msg.textContent = 'Rendered from pasted reply.'; toolbar(); renderDash(); } catch (e) { msg.textContent = 'Could not parse: ' + e.message; } }); row2.appendChild(ap); row2.appendChild(msg); det.appendChild(row2);
    // BYO key (kept in memory only)
    const row3 = h('div', 'row'); const keyIn = h('input'); keyIn.type = 'password'; keyIn.placeholder = 'Optional: Anthropic API key (memory only, direct browser call)'; keyIn.style.flex = '1'; keyIn.style.minWidth = '260px'; const call = h('button', 'btn small', 'Ask the model directly'); call.type = 'button'; const m3 = h('span', 'note');
    call.addEventListener('click', async () => { const key = keyIn.value.trim(); if (!key) { m3.textContent = 'Enter a key first.'; return; } m3.textContent = 'Calling...'; try { const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: window.DASHFORGE_MODEL || 'claude-sonnet-4-5', max_tokens: 1200, messages: [{ role: 'user', content: ta.value }] }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ? j.error.message : r.status); const txt = j.content.map(c => c.text || '').join(''); ta2.value = txt; ap.click(); m3.textContent = 'Model replied; rendered.'; } catch (e) { m3.textContent = 'Error: ' + e.message; } });
    row3.appendChild(keyIn); row3.appendChild(call); row3.appendChild(m3); det.appendChild(row3);
    host.appendChild(det);
  }

  // ---- boot ----
  async function boot() {
    App.flags = readFlags();
    await loadWorld();
    skeleton();
    const q = new URLSearchParams(location.search).get('q');
    if (q) { $('#q').value = q; build(q, { instant: true }); } else $('#q').focus();
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (App.plan) renderDash(); }, 200); });
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
