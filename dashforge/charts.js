/* SVG chart renderer. Colors are CSS custom properties so light/dark swap in one place.
   Rules from the dataviz method: one y-axis, 2px lines, hairline grid, thin bars with 4px rounded ends,
   categorical hues in fixed slot order, status colors only for state, text in ink tokens. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
  const STATUS = { good: 'var(--good)', warning: 'var(--warning)', serious: 'var(--serious)', critical: 'var(--critical)' };
  const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

  function el(name, attrs, parent) { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function text(parent, x, y, s, attrs) { const t = el('text', Object.assign({ x, y, fill: 'var(--ink-muted)', 'font-size': 11 }, attrs || {}), parent); t.textContent = s; return t; }
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10; return n * p; }
  function niceTicks(min, max, n) { const span = niceMax((max - min) / n); const out = []; for (let v = Math.ceil(min / span) * span; v <= max + 1e-9; v += span) out.push(+v.toFixed(6)); return out; }
  const shortDate = t => t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Shared tooltip
  let tip;
  function tooltip() { if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; document.body.appendChild(tip); } return tip; }
  function showTip(ev, rows, title) {
    const t = tooltip(); t.replaceChildren();
    if (title) { const h = document.createElement('div'); h.className = 'tip-title'; h.textContent = title; t.appendChild(h); }
    rows.forEach(r => { const row = document.createElement('div'); row.className = 'tip-row'; if (r.color) { const k = document.createElement('span'); k.className = 'tip-key'; k.style.background = r.color; row.appendChild(k); } const v = document.createElement('strong'); v.textContent = r.value; row.appendChild(v); const l = document.createElement('span'); l.textContent = r.label; row.appendChild(l); t.appendChild(row); });
    t.hidden = false; moveTip(ev);
  }
  function moveTip(ev) { const t = tooltip(); const w = t.offsetWidth, h = t.offsetHeight; let x = ev.clientX + 14, y = ev.clientY + 14; if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14; if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14; t.style.left = x + 'px'; t.style.top = y + 'px'; }
  function hideTip() { if (tip) tip.hidden = true; }

  function frame(container, h) {
    container.replaceChildren();
    const w = Math.max(240, container.clientWidth || 600);
    const svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', height: h, class: 'chart' }, container);
    return { svg, w, h };
  }
  function legend(container, items) {
    const l = document.createElement('div'); l.className = 'legend';
    items.forEach(it => { const s = document.createElement('span'); s.className = 'legend-item'; const k = document.createElement('i'); k.className = 'legend-key ' + (it.shape || 'rect'); k.style.background = it.color; s.appendChild(k); s.appendChild(document.createTextNode(it.name)); l.appendChild(s); });
    container.appendChild(l);
  }
  function eventMarkers(g, spec, xs, top, bottom) {
    if (!spec.events || !spec.x) return;
    const first = spec.x[0], last = spec.x[spec.x.length - 1];
    spec.events.forEach(e => {
      const idx = spec.x.findIndex(t => Math.abs(t - window.App.world.dates[e.day]) < 36e5);
      if (idx < 0) return;
      const x = xs(idx);
      el('line', { x1: x, x2: x, y1: top, y2: bottom, stroke: 'var(--ink-muted)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, g);
      const tt = text(g, x + 4, top + 10, e.label, { 'font-size': 10 });
      tt.setAttribute('class', 'event-label');
    });
  }

  // ---------- line (optionally with target, band) ----------
  function line(container, spec) {
    const H = 240, m = { l: 48, r: 16, t: 14, b: 26 };
    const { svg, w } = frame(container, H);
    const n = spec.x.length;
    let vals = spec.series.flatMap(s => s.values);
    if (spec.target) vals = vals.concat([spec.target.value]);
    let yMin = spec.yMin != null ? spec.yMin : 0, yMax = spec.yMax != null ? spec.yMax : niceMax(Math.max(...vals) * 1.08);
    if (spec.yMin == null && Math.min(...vals) < 0) yMin = -niceMax(-Math.min(...vals));
    const xs = i => m.l + (n > 1 ? i / (n - 1) : 0) * (w - m.l - m.r);
    const ys = v => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
    const g = el('g', {}, svg);
    niceTicks(yMin, yMax, 4).forEach(v => { el('line', { x1: m.l, x2: w - m.r, y1: ys(v), y2: ys(v), stroke: 'var(--grid)', 'stroke-width': 1 }, g); text(g, m.l - 6, ys(v) + 4, spec.format ? spec.format(v) : v, { 'text-anchor': 'end', class: 'tick' }); });
    const step = Math.max(1, Math.round(n / 6));
    for (let i = 0; i < n; i += step) text(g, xs(i), H - 8, shortDate(spec.x[i]), { 'text-anchor': i === 0 ? 'start' : 'middle', class: 'tick' });
    if (spec.band) el('rect', { x: m.l, y: ys(spec.band.to), width: w - m.l - m.r, height: ys(spec.band.from) - ys(spec.band.to), fill: 'var(--good)', opacity: 0.08 }, g);
    if (spec.band) text(g, w - m.r - 4, ys(spec.band.to) + 12, spec.band.label, { 'text-anchor': 'end', 'font-size': 10 });
    if (spec.target) { el('line', { x1: m.l, x2: w - m.r, y1: ys(spec.target.value), y2: ys(spec.target.value), stroke: 'var(--ink-secondary)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }, g); text(g, w - m.r - 4, ys(spec.target.value) - 4, spec.target.label, { 'text-anchor': 'end', 'font-size': 10 }); }
    eventMarkers(g, spec, xs, m.t, H - m.b);
    spec.series.forEach((s, si) => {
      const d = s.values.map((v, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(v).toFixed(1)).join(' ');
      if (spec.series.length === 1) el('path', { d: d + ' L' + xs(n - 1).toFixed(1) + ' ' + ys(yMin) + ' L' + xs(0) + ' ' + ys(yMin) + ' Z', fill: SERIES[si], opacity: 0.1 }, g);
      el('path', { d, fill: 'none', stroke: SERIES[si], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
      const last = s.values[n - 1]; el('circle', { cx: xs(n - 1), cy: ys(last), r: 4, fill: SERIES[si], stroke: 'var(--surface)', 'stroke-width': 2 }, g);
    });
    // end label for the first series
    const lv = spec.series[0].values[n - 1]; text(g, xs(n - 1) - 6, ys(lv) - 8, spec.format ? spec.format(lv) : lv, { 'text-anchor': 'end', fill: 'var(--ink-primary)', 'font-weight': 600 });
    // crosshair
    const cross = el('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, stroke: 'var(--ink-muted)', 'stroke-width': 1, visibility: 'hidden' }, g);
    const dots = spec.series.map((s, si) => el('circle', { r: 4, fill: SERIES[si], stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, g));
    const hit = el('rect', { x: m.l, y: m.t, width: w - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, g);
    hit.addEventListener('mousemove', ev => { const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) * (w / r.width); const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (w - m.l - m.r) * (n - 1)))); cross.setAttribute('x1', xs(i)); cross.setAttribute('x2', xs(i)); cross.setAttribute('visibility', 'visible'); dots.forEach((d, si) => { d.setAttribute('cx', xs(i)); d.setAttribute('cy', ys(spec.series[si].values[i])); d.setAttribute('visibility', 'visible'); }); showTip(ev, spec.series.map((s, si) => ({ color: SERIES[si], value: spec.format ? spec.format(s.values[i]) : s.values[i], label: s.name })), spec.x[i].toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })); });
    hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); hideTip(); });
    if (spec.series.length > 1) legend(container, spec.series.map((s, i) => ({ name: s.name, color: SERIES[i], shape: 'line' })));
  }

  // ---------- stacked area ----------
  function stacked(container, spec) {
    const H = 240, m = { l: 44, r: 16, t: 14, b: 26 };
    const { svg, w } = frame(container, H);
    const n = spec.x.length, k = spec.series.length;
    const totals = Array.from({ length: n }, (_, i) => spec.series.reduce((a, s) => a + s.values[i], 0));
    const yMax = niceMax(Math.max(...totals) * 1.05);
    const xs = i => m.l + i / (n - 1) * (w - m.l - m.r);
    const ys = v => m.t + (1 - v / yMax) * (H - m.t - m.b);
    const g = el('g', {}, svg);
    niceTicks(0, yMax, 4).forEach(v => { el('line', { x1: m.l, x2: w - m.r, y1: ys(v), y2: ys(v), stroke: 'var(--grid)' }, g); text(g, m.l - 6, ys(v) + 4, spec.format ? spec.format(v) : v, { 'text-anchor': 'end', class: 'tick' }); });
    const step = Math.max(1, Math.round(n / 6));
    for (let i = 0; i < n; i += step) text(g, xs(i), H - 8, shortDate(spec.x[i]), { 'text-anchor': i === 0 ? 'start' : 'middle', class: 'tick' });
    let base = new Array(n).fill(0);
    spec.series.forEach((s, si) => {
      const top = base.map((b, i) => b + s.values[i]);
      const up = top.map((v, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(v).toFixed(1)).join(' ');
      const down = base.map((v, i) => 'L' + xs(i).toFixed(1) + ' ' + ys(v).toFixed(1)).reverse().join(' ');
      el('path', { d: up + ' ' + down + ' Z', fill: SERIES[si], opacity: 0.85, stroke: 'var(--surface)', 'stroke-width': 1 }, g);
      base = top;
    });
    eventMarkers(g, spec, xs, m.t, H - m.b);
    const cross = el('line', { y1: m.t, y2: H - m.b, stroke: 'var(--ink-muted)', visibility: 'hidden' }, g);
    const hit = el('rect', { x: m.l, y: m.t, width: w - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, g);
    hit.addEventListener('mousemove', ev => { const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) * (w / r.width); const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (w - m.l - m.r) * (n - 1)))); cross.setAttribute('x1', xs(i)); cross.setAttribute('x2', xs(i)); cross.setAttribute('visibility', 'visible'); const rows = spec.series.map((s, si) => ({ color: SERIES[si], value: spec.format(s.values[i]), label: s.name })).reverse(); rows.unshift({ value: spec.format(totals[i]), label: 'Total' }); showTip(ev, rows, shortDate(spec.x[i])); });
    hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
    legend(container, spec.series.map((s, i) => ({ name: s.name, color: SERIES[i] })));
  }

  // ---------- vertical bars ----------
  function bar(container, spec) {
    const H = 240, m = { l: 48, r: 12, t: 14, b: 40 };
    const { svg, w } = frame(container, H);
    const n = spec.categories.length, yMax = niceMax(Math.max(...spec.values, 1) * 1.1);
    const band = (w - m.l - m.r) / n, bw = Math.min(24, band * 0.6);
    const ys = v => m.t + (1 - v / yMax) * (H - m.t - m.b);
    const g = el('g', {}, svg);
    niceTicks(0, yMax, 4).forEach(v => { el('line', { x1: m.l, x2: w - m.r, y1: ys(v), y2: ys(v), stroke: 'var(--grid)' }, g); text(g, m.l - 6, ys(v) + 4, spec.format(v), { 'text-anchor': 'end', class: 'tick' }); });
    spec.values.forEach((v, i) => {
      const x = m.l + band * i + (band - bw) / 2, y = ys(v), h = ys(0) - y;
      const color = spec.colors ? STATUS[spec.colors[i]] : SERIES[0];
      const p = el('path', { d: roundTop(x, y, bw, h, 4), fill: color, class: 'mark' }, g);
      text(g, x + bw / 2, y - 5, spec.format(v), { 'text-anchor': 'middle', fill: 'var(--ink-primary)', 'font-size': 11 });
      text(g, x + bw / 2, H - 12, spec.categories[i], { 'text-anchor': 'middle', class: 'tick' });
      const hit = el('rect', { x: m.l + band * i, y: m.t, width: band, height: H - m.t - m.b, fill: 'transparent' }, g);
      hit.addEventListener('mousemove', ev => { p.classList.add('hover'); showTip(ev, [{ color, value: spec.format(v), label: spec.categories[i] }]); });
      hit.addEventListener('mouseleave', () => { p.classList.remove('hover'); hideTip(); });
    });
  }
  function roundTop(x, y, w, h, r) { if (h <= 0) return 'M' + x + ' ' + y + ' h' + w; r = Math.min(r, h, w / 2); return 'M' + x + ' ' + (y + h) + ' v' + (-(h - r)) + ' q0 ' + (-r) + ' ' + r + ' ' + (-r) + ' h' + (w - 2 * r) + ' q' + r + ' 0 ' + r + ' ' + r + ' v' + (h - r) + ' z'; }
  function roundRight(x, y, w, h, r) { if (w <= 0) return 'M' + x + ' ' + y + ' v' + h; r = Math.min(r, w, h / 2); return 'M' + x + ' ' + y + ' h' + (w - r) + ' q' + r + ' 0 ' + r + ' ' + r + ' v' + (h - 2 * r) + ' q0 ' + r + ' ' + (-r) + ' ' + r + ' h' + (-(w - r)) + ' z'; }

  // ---------- horizontal bars ----------
  function hbar(container, spec) {
    const n = spec.categories.length, rowH = 26, m = { l: 110, r: 60, t: 8, b: 8 };
    const H = m.t + m.b + n * rowH;
    const { svg, w } = frame(container, H);
    const vMax = niceMax(Math.max(...spec.values, 1));
    const xs = v => m.l + v / vMax * (w - m.l - m.r);
    const g = el('g', {}, svg);
    spec.values.forEach((v, i) => {
      const y = m.t + i * rowH + 4, h = 18;
      const color = spec.colors ? STATUS[spec.colors[i]] : SERIES[0];
      const p = el('path', { d: roundRight(m.l, y, xs(v) - m.l, h, 4), fill: color, class: 'mark' }, g);
      text(g, m.l - 8, y + 13, spec.categories[i], { 'text-anchor': 'end', fill: 'var(--ink-secondary)' });
      text(g, xs(v) + 6, y + 13, spec.format(v), { fill: 'var(--ink-primary)' });
      const hit = el('rect', { x: 0, y: m.t + i * rowH, width: w, height: rowH, fill: 'transparent' }, g);
      hit.addEventListener('mousemove', ev => { p.classList.add('hover'); showTip(ev, [{ color, value: spec.format(v), label: spec.categories[i] }]); });
      hit.addEventListener('mouseleave', () => { p.classList.remove('hover'); hideTip(); });
    });
  }

  // ---------- donut ----------
  function donut(container, spec) {
    const H = 220; const { svg, w } = frame(container, H);
    const total = spec.values.reduce((a, b) => a + b, 0), cx = Math.min(w / 2, 120), cy = H / 2, R = 80, r = 52;
    let a0 = -Math.PI / 2; const g = el('g', {}, svg);
    spec.values.forEach((v, i) => {
      const a1 = a0 + v / total * Math.PI * 2; const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
      const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r);
      const path = el('path', { d: 'M' + x0 + ' ' + y0 + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2 + ' A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + x3 + ' ' + y3 + ' Z', fill: SERIES[i], stroke: 'var(--surface)', 'stroke-width': 2, class: 'mark' }, g);
      path.addEventListener('mousemove', ev => showTip(ev, [{ color: SERIES[i], value: spec.format(v) + ' (' + Math.round(v / total * 100) + '%)', label: spec.categories[i] }]));
      path.addEventListener('mouseleave', hideTip);
      a0 = a1;
    });
    text(g, cx, cy - 2, spec.format(total), { 'text-anchor': 'middle', fill: 'var(--ink-primary)', 'font-size': 18, 'font-weight': 600 });
    text(g, cx, cy + 14, 'total', { 'text-anchor': 'middle' });
    legend(container, spec.categories.map((c, i) => ({ name: c + ' ' + Math.round(spec.values[i] / total * 100) + '%', color: SERIES[i] })));
  }

  // ---------- funnel ----------
  function funnel(container, spec) {
    const n = spec.stages.length, rowH = 44, m = { l: 8, r: 8, t: 6, b: 6 };
    const H = m.t + m.b + n * rowH; const { svg, w } = frame(container, H);
    const max = spec.stages[0].value || 1; const g = el('g', {}, svg);
    spec.stages.forEach((s, i) => {
      const bw = Math.max(40, s.value / max * (w - m.l - m.r)), x = (w - bw) / 2, y = m.t + i * rowH + 4;
      const p = el('rect', { x, y, width: bw, height: 24, rx: 4, fill: SEQ[Math.min(SEQ.length - 1, 3 + i * 2)], class: 'mark' }, g);
      const lbl = s.name + '  ' + s.value.toLocaleString('en-US');
      if (bw > lbl.length * 7.5 + 16) text(g, w / 2, y + 16, lbl, { 'text-anchor': 'middle', fill: i < 2 ? 'var(--ink-primary)' : '#ffffff', 'font-weight': 600 });
      else text(g, x + bw + 6, y + 16, lbl, { 'text-anchor': 'start', fill: 'var(--ink-primary)', 'font-weight': 600 });
      if (i > 0) text(g, w / 2, y - 3, Math.round(s.value / spec.stages[i - 1].value * 100) + '% of previous', { 'text-anchor': 'middle', 'font-size': 10 });
      p.addEventListener('mousemove', ev => showTip(ev, [{ value: s.value.toLocaleString('en-US'), label: s.name }, { value: Math.round(s.value / max * 100) + '%', label: 'of leads' }]));
      p.addEventListener('mouseleave', hideTip);
    });
  }

  // ---------- bullet bars ----------
  function bullet(container, spec) {
    const n = spec.rows.length, rowH = 30, m = { l: 120, r: 70, t: 6, b: 6 };
    const H = m.t + m.b + n * rowH; const { svg, w } = frame(container, H);
    const vMax = Math.max(...spec.rows.map(r => Math.max(r.actual, r.stretch))) * 1.05;
    const xs = v => m.l + v / vMax * (w - m.l - m.r); const g = el('g', {}, svg);
    spec.rows.forEach((r, i) => {
      const y = m.t + i * rowH;
      el('rect', { x: m.l, y: y + 6, width: xs(r.stretch) - m.l, height: 18, fill: 'var(--grid)', rx: 2 }, g);
      const good = r.actual >= r.target;
      const p = el('path', { d: roundRight(m.l, y + 11, xs(r.actual) - m.l, 8, 3), fill: good ? SERIES[0] : STATUS.serious, class: 'mark' }, g);
      el('line', { x1: xs(r.target), x2: xs(r.target), y1: y + 4, y2: y + 26, stroke: 'var(--ink-primary)', 'stroke-width': 2 }, g);
      text(g, m.l - 8, y + 19, r.name, { 'text-anchor': 'end', fill: 'var(--ink-secondary)' });
      text(g, w - m.r + 6, y + 19, Math.round(r.actual / r.stretch * 100) + '%', { fill: 'var(--ink-primary)' });
      const hit = el('rect', { x: 0, y, width: w, height: rowH, fill: 'transparent' }, g);
      hit.addEventListener('mousemove', ev => { p.classList.add('hover'); showTip(ev, [{ value: spec.format(r.actual), label: 'Booked' }, { value: spec.format(r.target), label: 'Pro-rated target' }, { value: spec.format(r.stretch), label: 'Full quota' }], r.name); });
      hit.addEventListener('mouseleave', () => { p.classList.remove('hover'); hideTip(); });
    });
    legend(container, [{ name: 'On or above pro-rated target', color: SERIES[0] }, { name: 'Below target', color: STATUS.serious }, { name: 'Full quota (track)', color: 'var(--grid)' }]);
  }

  // ---------- small multiples ----------
  function multiples(container, spec) {
    container.replaceChildren();
    const grid = document.createElement('div'); grid.className = 'multiples'; container.appendChild(grid);
    const all = spec.panels.flatMap(p => p.values); const yMax = niceMax(Math.max(...all) * 1.05);
    spec.panels.forEach((p, pi) => {
      const cell = document.createElement('div'); cell.className = 'multiple'; grid.appendChild(cell);
      const h = document.createElement('div'); h.className = 'multiple-title'; h.textContent = p.name; cell.appendChild(h);
      const v = document.createElement('div'); v.className = 'multiple-value'; v.textContent = spec.format(p.values[p.values.length - 1]); cell.appendChild(v);
      const box = document.createElement('div'); cell.appendChild(box);
      const w = 200, H = 60; const svg = el('svg', { viewBox: '0 0 ' + w + ' ' + H, width: '100%', height: H }, box);
      const n = p.values.length, xs = i => 4 + i / (n - 1) * (w - 8), ys = val => 4 + (1 - val / yMax) * (H - 8);
      const d = p.values.map((val, i) => (i ? 'L' : 'M') + xs(i) + ' ' + ys(val)).join(' ');
      el('path', { d: d + ' L' + xs(n - 1) + ' ' + ys(0) + ' L' + xs(0) + ' ' + ys(0) + ' Z', fill: SERIES[0], opacity: 0.1 }, svg);
      el('path', { d, fill: 'none', stroke: SERIES[0], 'stroke-width': 2 }, svg);
      el('circle', { cx: xs(n - 1), cy: ys(p.values[n - 1]), r: 3.5, fill: SERIES[0], stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
      svg.addEventListener('mousemove', ev => { const r = svg.getBoundingClientRect(); const i = Math.max(0, Math.min(n - 1, Math.round((ev.clientX - r.left) / r.width * (n - 1)))); showTip(ev, [{ color: SERIES[0], value: spec.format(p.values[i]), label: 'week ' + (i - n + 1 === 0 ? 'this' : (i - n + 1)) }], p.name); });
      svg.addEventListener('mouseleave', hideTip);
    });
    const note = document.createElement('div'); note.className = 'chart-note'; note.textContent = 'Same y-scale in every panel, 8 weeks.'; container.appendChild(note);
  }

  // ---------- waterfall ----------
  function waterfall(container, spec) {
    const H = 240, m = { l: 56, r: 12, t: 16, b: 34 }; const { svg, w } = frame(container, H);
    const n = spec.steps.length; let run = 0; const bars = [];
    spec.steps.forEach(s => { if (s.type === 'total') { bars.push({ y0: 0, y1: s.value, name: s.name, v: s.value, total: true }); run = s.value; } else { bars.push({ y0: run, y1: run + s.value, name: s.name, v: s.value }); run += s.value; } });
    const lo = Math.min(...bars.map(b => Math.min(b.y0, b.y1))), hi = Math.max(...bars.map(b => Math.max(b.y0, b.y1)));
    const yMin = lo * 0.98, yMax = hi * 1.01; const band = (w - m.l - m.r) / n, bw = Math.min(40, band * 0.6);
    const ys = v => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b); const g = el('g', {}, svg);
    niceTicks(yMin, yMax, 4).forEach(v => { el('line', { x1: m.l, x2: w - m.r, y1: ys(v), y2: ys(v), stroke: 'var(--grid)' }, g); text(g, m.l - 6, ys(v) + 4, spec.format(v), { 'text-anchor': 'end', class: 'tick' }); });
    bars.forEach((b, i) => {
      const x = m.l + band * i + (band - bw) / 2, top = ys(Math.max(b.y0, b.y1)), h = Math.max(1, Math.abs(ys(b.y0) - ys(b.y1)));
      const color = b.total ? 'var(--ink-secondary)' : (b.v >= 0 ? STATUS.good : STATUS.critical);
      const p = el('rect', { x, y: top, width: bw, height: h, rx: 3, fill: color, class: 'mark' }, g);
      if (i < n - 1) el('line', { x1: x + bw, x2: x + band, y1: ys(b.y1), y2: ys(b.y1), stroke: 'var(--ink-muted)', 'stroke-dasharray': '2 2' }, g);
      text(g, x + bw / 2, top - 5, (b.total ? '' : (b.v >= 0 ? '+' : '-')) + spec.format(Math.abs(b.v)), { 'text-anchor': 'middle', fill: 'var(--ink-primary)', 'font-size': 10 });
      text(g, x + bw / 2, H - 10, b.name, { 'text-anchor': 'middle', class: 'tick' });
      p.addEventListener('mousemove', ev => showTip(ev, [{ color, value: spec.format(b.v), label: b.name }, { value: spec.format(b.y1), label: 'running ARR' }]));
      p.addEventListener('mouseleave', hideTip);
    });
  }

  // ---------- heatmap ----------
  function heatmap(container, spec) {
    const rows = spec.rows.length, cols = spec.cols.length, m = { l: 34, r: 8, t: 6, b: 22 };
    const { svg, w } = frame(container, 6 + 22 + rows * 22);
    const cw = (w - m.l - m.r) / cols, ch = 22; const max = Math.max(...spec.matrix.flat()); const g = el('g', {}, svg);
    spec.matrix.forEach((r, ri) => {
      text(g, m.l - 6, m.t + ri * ch + 15, spec.rows[ri], { 'text-anchor': 'end', class: 'tick' });
      r.forEach((v, ci) => {
        const c = el('rect', { x: m.l + ci * cw + 1, y: m.t + ri * ch + 1, width: cw - 2, height: ch - 2, rx: 2, fill: SEQ[Math.min(SEQ.length - 1, Math.floor(v / max * (SEQ.length - 1)))], class: 'mark' }, g);
        c.addEventListener('mousemove', ev => showTip(ev, [{ value: spec.format(v), label: 'tickets' }], spec.rows[ri] + ' ' + String(spec.cols[ci]).padStart(2, '0') + ':00'));
        c.addEventListener('mouseleave', hideTip);
      });
    });
    spec.cols.forEach((c, ci) => { if (ci % 3 === 0) text(g, m.l + ci * cw + cw / 2, m.t + rows * ch + 14, c + 'h', { 'text-anchor': 'middle', class: 'tick' }); });
  }

  // ---------- slope ----------
  function slope(container, spec) {
    const H = 260, m = { l: 90, r: 110, t: 24, b: 20 }; const { svg, w } = frame(container, H);
    const all = spec.items.flatMap(i => [i.a, i.b]); const yMin = 0, yMax = niceMax(Math.max(...all) * 1.05);
    const ys = v => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b); const xa = m.l, xb = w - m.r; const g = el('g', {}, svg);
    text(g, xa, 14, spec.labels[0], { 'text-anchor': 'middle', fill: 'var(--ink-secondary)' }); text(g, xb, 14, spec.labels[1], { 'text-anchor': 'middle', fill: 'var(--ink-secondary)' });
    el('line', { x1: xa, x2: xa, y1: m.t, y2: H - m.b, stroke: 'var(--grid)' }, g); el('line', { x1: xb, x2: xb, y1: m.t, y2: H - m.b, stroke: 'var(--grid)' }, g);
    spec.items.forEach((it, i) => {
      const up = it.b > it.a * 1.1; const color = SERIES[i];
      const l = el('line', { x1: xa, x2: xb, y1: ys(it.a), y2: ys(it.b), stroke: color, 'stroke-width': up ? 3 : 2, class: 'mark' }, g);
      el('circle', { cx: xa, cy: ys(it.a), r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }, g); el('circle', { cx: xb, cy: ys(it.b), r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }, g);
      text(g, xa - 8, ys(it.a) + 4, spec.format(it.a), { 'text-anchor': 'end', fill: 'var(--ink-secondary)', 'font-size': 10 });
      text(g, xb + 8, ys(it.b) + 4, spec.format(it.b) + '  ' + it.name, { fill: up ? 'var(--ink-primary)' : 'var(--ink-secondary)', 'font-size': 10, 'font-weight': up ? 600 : 400 });
      l.addEventListener('mousemove', ev => showTip(ev, [{ color, value: spec.format(it.a), label: spec.labels[0] }, { color, value: spec.format(it.b), label: spec.labels[1] }, { value: (it.b >= it.a ? '+' : '') + Math.round((it.b - it.a) / it.a * 100) + '%', label: 'change' }], it.name));
      l.addEventListener('mouseleave', hideTip);
    });
  }

  // ---------- dot strip ----------
  function dots(container, spec) {
    const H = 110, m = { l: 16, r: 16 }; const { svg, w } = frame(container, H);
    const vMax = niceMax(Math.max(...spec.items.map(i => i.value), spec.marker ? spec.marker.value : 0) * 1.1); const xs = v => m.l + v / vMax * (w - m.l - m.r); const g = el('g', {}, svg);
    el('line', { x1: m.l, x2: w - m.r, y1: 50, y2: 50, stroke: 'var(--grid)', 'stroke-width': 2 }, g);
    niceTicks(0, vMax, 5).forEach(v => { el('line', { x1: xs(v), x2: xs(v), y1: 46, y2: 54, stroke: 'var(--ink-muted)' }, g); text(g, xs(v), 72, spec.format(v), { 'text-anchor': 'middle', class: 'tick' }); });
    if (spec.marker) { el('line', { x1: xs(spec.marker.value), x2: xs(spec.marker.value), y1: 26, y2: 62, stroke: 'var(--ink-primary)', 'stroke-width': 2 }, g); text(g, xs(spec.marker.value), 18, spec.marker.label, { 'text-anchor': 'middle', 'font-size': 10 }); }
    const sorted = spec.items.slice().sort((a, b) => a.value - b.value); let lastX = -99, lift = 0;
    sorted.forEach(it => { const x = xs(it.value); lift = (x - lastX < 14) ? lift + 1 : 0; lastX = x; const cy = 50 - lift * 12; const c = el('circle', { cx: x, cy, r: 6, fill: it.value >= (spec.marker ? spec.marker.value : 0) ? SERIES[0] : STATUS.serious, stroke: 'var(--surface)', 'stroke-width': 2, class: 'mark' }, g); const hit = el('circle', { cx: x, cy, r: 14, fill: 'transparent' }, g); hit.addEventListener('mousemove', ev => showTip(ev, [{ value: spec.format(it.value), label: 'of quota' }], it.name)); hit.addEventListener('mouseleave', hideTip); });
    text(g, m.l, 100, 'Each dot is a rep. Hover for name.', { 'font-size': 10 });
  }

  // ---------- flow (marketing -> sales -> support) ----------
  function flow(container, spec) {
    const H = 300, m = { l: 8, r: 8, t: 24, b: 12 }; const { svg, w } = frame(container, H);
    const g = el('g', {}, svg); const colW = 16; const gap = 4;
    // columns: channels | MQL | SQL | Opp | Won | Customers | queues
    const cols = [
      { name: 'Channels', nodes: spec.channels.map((c, i) => ({ name: c.name, value: c.value, color: SERIES[i] })) },
      { name: 'MQL', nodes: [{ name: 'MQL', value: spec.stages[0].value, color: SEQ[5] }] },
      { name: 'SQL', nodes: [{ name: 'SQL', value: spec.stages[1].value, color: SEQ[7] }] },
      { name: 'Opportunity', nodes: [{ name: 'Opportunity', value: spec.stages[2].value, color: SEQ[9] }] },
      { name: 'Closed won', nodes: [{ name: 'Closed won', value: spec.stages[3].value, color: SEQ[11] }] },
      { name: 'Customers', nodes: [{ name: 'Active customers', value: spec.customers.value, color: 'var(--s7)' }] },
      { name: 'Support queues', nodes: spec.queues.map((q, i) => ({ name: q.name, value: q.value, color: SERIES[i] })) }
    ];
    const innerH = H - m.t - m.b; const xStep = (w - m.l - m.r - colW) / (cols.length - 1);
    cols.forEach((col, ci) => {
      const total = col.nodes.reduce((a, n) => a + n.value, 0); const avail = innerH - gap * (col.nodes.length - 1); let y = m.t;
      col.x = m.l + ci * xStep;
      col.nodes.forEach(n => { n.h = Math.max(3, n.value / total * avail); n.y = y; y += n.h + gap; });
      text(g, ci === 0 ? col.x : (ci === cols.length - 1 ? col.x + colW : col.x + colW / 2), 14, col.name, { 'text-anchor': ci === 0 ? 'start' : (ci === cols.length - 1 ? 'end' : 'middle'), fill: 'var(--ink-secondary)', 'font-size': 10 });
    });
    function link(a, b, ya, ha, yb, hb, color, label) {
      const x0 = a + colW, x1 = b, cx = (x0 + x1) / 2;
      const d = 'M' + x0 + ' ' + ya + ' C' + cx + ' ' + ya + ' ' + cx + ' ' + yb + ' ' + x1 + ' ' + yb + ' L' + x1 + ' ' + (yb + hb) + ' C' + cx + ' ' + (yb + hb) + ' ' + cx + ' ' + (ya + ha) + ' ' + x0 + ' ' + (ya + ha) + ' Z';
      const p = el('path', { d, fill: color, opacity: 0.3, class: 'mark' }, g);
      p.addEventListener('mousemove', ev => showTip(ev, [{ color, value: label.value, label: label.text }]));
      p.addEventListener('mouseleave', hideTip);
    }
    // channels -> MQL (proportional to leads)
    const mqlN = cols[1].nodes[0]; let yy = mqlN.y;
    cols[0].nodes.forEach(n => { const hb = n.value / mqlN.value * mqlN.h; link(cols[0].x, cols[1].x, n.y, n.h, yy, hb, n.color, { value: spec.format(n.value), text: n.name + ' leads' }); yy += hb; });
    // stage -> stage (share that converts)
    for (let s = 1; s < 4; s++) { const a = cols[s].nodes[0], b = cols[s + 1].nodes[0]; const share = b.value / a.value; link(cols[s].x, cols[s + 1].x, a.y, a.h * share, b.y, b.h, b.color, { value: Math.round(share * 100) + '%', text: a.name + ' to ' + b.name }); }
    // won -> customers (new share of base)
    { const a = cols[4].nodes[0], b = cols[5].nodes[0]; const share = spec.customers.newly / b.value; link(cols[4].x, cols[5].x, a.y, a.h, b.y, b.h * share, b.color, { value: spec.format(spec.customers.newly), text: 'new customers this period (' + Math.round(share * 100) + '% of base)' }); }
    // customers -> queues (ticket share)
    { const a = cols[5].nodes[0]; const tot = spec.queues.reduce((x, q) => x + q.value, 0); let ya = a.y; cols[6].nodes.forEach(n => { const ha = n.value / tot * a.h; link(cols[5].x, cols[6].x, ya, ha, n.y, n.h, n.color, { value: spec.format(n.value), text: n.name + ' tickets' }); ya += ha; }); }
    cols.forEach(col => col.nodes.forEach(n => { const r = el('rect', { x: col.x, y: n.y, width: colW, height: n.h, rx: 2, fill: n.color }, g); r.addEventListener('mousemove', ev => showTip(ev, [{ color: n.color, value: spec.format(n.value), label: n.name }])); r.addEventListener('mouseleave', hideTip); if (n.h > 12) text(g, col.x + (col === cols[0] ? colW + 4 : (col === cols[6] ? -4 : colW + 4)), n.y + n.h / 2 + 4, n.name, { 'text-anchor': col === cols[6] ? 'end' : 'start', 'font-size': 10, fill: 'var(--ink-primary)' }); }));
    const note = document.createElement('div'); note.className = 'chart-note'; note.textContent = 'Band widths are shares within each stage (each column fills its height), not one common unit. Hover any band for the number.'; container.appendChild(note);
  }

  // ---------- sparkline for KPI tiles ----------
  function spark(container, values, opts) {
    const w = 96, H = 28; const svg = el('svg', { viewBox: '0 0 ' + w + ' ' + H, width: w, height: H, class: 'spark' }, container);
    const n = values.length, lo = Math.min(...values), hi = Math.max(...values); const xs = i => 2 + i / (n - 1) * (w - 4), ys = v => 2 + (hi === lo ? 0.5 : 1 - (v - lo) / (hi - lo)) * (H - 4);
    el('path', { d: values.map((v, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(v).toFixed(1)).join(' '), fill: 'none', stroke: 'var(--ink-muted)', 'stroke-width': 1.5 }, svg);
    el('circle', { cx: xs(n - 1), cy: ys(values[n - 1]), r: 2.5, fill: opts && opts.accent ? opts.accent : 'var(--accent)' }, svg);
  }

  window.Charts = { line, stacked, bar, hbar, donut, funnel, bullet, multiples, waterfall, heatmap, slope, dots, flow, spark, showTip, hideTip, SERIES, STATUS };
})();
