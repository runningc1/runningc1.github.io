/* Filterable, sortable table. Every column sorts (click header) and filters:
   text -> contains; cat/status -> checkbox set; num -> min/max. State survives re-render by key. */
(function () {
  'use strict';
  const STATE = {};

  function render(container, spec, key) {
    const st = STATE[key] || (STATE[key] = { sort: spec.sort ? Object.assign({}, spec.sort) : null, filters: {}, page: 0 });
    container.replaceChildren();
    const wrap = document.createElement('div'); wrap.className = 'tbl-wrap'; container.appendChild(wrap);

    // active filter chips + count
    const bar = document.createElement('div'); bar.className = 'tbl-bar'; wrap.appendChild(bar);
    const rows = apply(spec, st);
    const count = document.createElement('span'); count.className = 'tbl-count'; count.textContent = rows.length + ' of ' + spec.rows.length + ' rows'; bar.appendChild(count);
    Object.keys(st.filters).forEach(k => {
      const f = st.filters[k]; if (!f || isEmpty(f)) return;
      const col = spec.columns.find(c => c.key === k);
      const chip = document.createElement('button'); chip.className = 'chip'; chip.type = 'button';
      chip.textContent = col.label + ': ' + describe(f) + ' x';
      chip.addEventListener('click', () => { delete st.filters[k]; st.page = 0; render(container, spec, key); });
      bar.appendChild(chip);
    });
    if (Object.keys(st.filters).some(k => !isEmpty(st.filters[k]))) { const clr = document.createElement('button'); clr.className = 'chip chip-clear'; clr.type = 'button'; clr.textContent = 'Clear all'; clr.addEventListener('click', () => { st.filters = {}; st.page = 0; render(container, spec, key); }); bar.appendChild(clr); }

    const scroll = document.createElement('div'); scroll.className = 'tbl-scroll'; wrap.appendChild(scroll);
    const table = document.createElement('table'); table.className = 'tbl'; scroll.appendChild(table);
    const thead = document.createElement('thead'); table.appendChild(thead);
    const hr = document.createElement('tr'); thead.appendChild(hr);
    const fr = document.createElement('tr'); fr.className = 'tbl-filters'; thead.appendChild(fr);
    spec.columns.forEach(col => {
      const th = document.createElement('th'); th.className = col.type === 'num' ? 'num' : '';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'th-sort';
      b.textContent = col.label;
      const arrow = document.createElement('span'); arrow.className = 'arrow';
      arrow.textContent = st.sort && st.sort.key === col.key ? (st.sort.dir === 'asc' ? ' ^' : ' v') : ' -';
      b.appendChild(arrow);
      b.addEventListener('click', () => { if (st.sort && st.sort.key === col.key) st.sort.dir = st.sort.dir === 'asc' ? 'desc' : 'asc'; else st.sort = { key: col.key, dir: col.type === 'num' ? 'desc' : 'asc' }; render(container, spec, key); });
      th.appendChild(b); hr.appendChild(th);
      const fd = document.createElement('td'); fr.appendChild(fd); fd.appendChild(filterControl(col, spec, st, () => { st.page = 0; render(container, spec, key); }));
    });
    const tbody = document.createElement('tbody'); table.appendChild(tbody);
    const ps = spec.pageSize || 50; const start = st.page * ps; const pageRows = rows.slice(start, start + ps);
    pageRows.forEach(r => {
      const tr = document.createElement('tr');
      spec.columns.forEach(col => { const td = document.createElement('td'); const v = r[col.key]; if (col.type === 'num') td.className = 'num'; if (col.type === 'status') { const s = document.createElement('span'); s.className = 'status ' + statusClass(v); s.textContent = v; td.appendChild(s); } else td.textContent = col.format ? col.format(v) : String(v); tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    if (!pageRows.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = spec.columns.length; td.className = 'empty'; td.textContent = 'No rows match the filters.'; tr.appendChild(td); tbody.appendChild(tr); }
    if (rows.length > ps) {
      const pg = document.createElement('div'); pg.className = 'tbl-pager'; wrap.appendChild(pg);
      const prev = document.createElement('button'); prev.type = 'button'; prev.textContent = 'Prev'; prev.disabled = st.page === 0; prev.addEventListener('click', () => { st.page--; render(container, spec, key); });
      const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Next'; next.disabled = start + ps >= rows.length; next.addEventListener('click', () => { st.page++; render(container, spec, key); });
      const lab = document.createElement('span'); lab.textContent = 'Rows ' + (start + 1) + '-' + Math.min(rows.length, start + ps) + ' of ' + rows.length;
      pg.appendChild(prev); pg.appendChild(lab); pg.appendChild(next);
    }
  }

  function statusClass(v) { const s = String(v).toLowerCase(); if (s.includes('breach') || s.includes('slip')) return 'critical'; if (s.includes('risk') || s.includes('stale')) return 'warning'; return 'good'; }
  function isEmpty(f) { if (!f) return true; if (f.text != null) return f.text === ''; if (f.set) return f.set.length === 0; if (f.min != null || f.max != null) return f.min == null && f.max == null; return true; }
  function describe(f) { if (f.text != null) return '"' + f.text + '"'; if (f.set) return f.set.join(', '); const a = f.min != null ? f.min : '', b = f.max != null ? f.max : ''; return a + ' to ' + b; }

  function apply(spec, st) {
    let rows = spec.rows.filter(r => spec.columns.every(col => {
      const f = st.filters[col.key]; if (!f || isEmpty(f)) return true; const v = r[col.key];
      if (f.text != null) return String(v).toLowerCase().includes(f.text.toLowerCase());
      if (f.set) return f.set.includes(String(v));
      if (f.min != null && v < f.min) return false; if (f.max != null && v > f.max) return false; return true;
    }));
    if (st.sort) {
      const col = spec.columns.find(c => c.key === st.sort.key); const dir = st.sort.dir === 'asc' ? 1 : -1;
      rows = rows.slice().sort((a, b) => { const x = a[st.sort.key], y = b[st.sort.key]; if (col && col.order) return (col.order.indexOf(x) - col.order.indexOf(y)) * dir; if (typeof x === 'number') return (x - y) * dir; return String(x).localeCompare(String(y)) * dir; });
    }
    return rows;
  }

  function filterControl(col, spec, st, onChange) {
    const f = st.filters[col.key] || {};
    if (col.type === 'num') {
      const box = document.createElement('div'); box.className = 'f-range';
      const mn = document.createElement('input'); mn.type = 'number'; mn.placeholder = 'min'; mn.value = f.min != null ? f.min : '';
      const mx = document.createElement('input'); mx.type = 'number'; mx.placeholder = 'max'; mx.value = f.max != null ? f.max : '';
      const upd = () => { st.filters[col.key] = { min: mn.value === '' ? null : +mn.value, max: mx.value === '' ? null : +mx.value }; onChange(); };
      mn.addEventListener('change', upd); mx.addEventListener('change', upd);
      box.appendChild(mn); box.appendChild(mx); return box;
    }
    if (col.type === 'cat' || col.type === 'status') {
      const vals = col.order ? col.order.filter(v => spec.rows.some(r => String(r[col.key]) === v)) : Array.from(new Set(spec.rows.map(r => String(r[col.key])))).sort();
      const box = document.createElement('div'); box.className = 'f-set';
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'f-set-btn'; btn.textContent = f.set && f.set.length ? f.set.length + ' selected' : 'All';
      const pop = document.createElement('div'); pop.className = 'f-pop'; pop.hidden = true;
      vals.forEach(v => { const l = document.createElement('label'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!(f.set && f.set.includes(v)); cb.addEventListener('change', () => { const cur = new Set((st.filters[col.key] && st.filters[col.key].set) || []); if (cb.checked) cur.add(v); else cur.delete(v); st.filters[col.key] = { set: Array.from(cur) }; onChange(); }); l.appendChild(cb); l.appendChild(document.createTextNode(' ' + v)); pop.appendChild(l); });
      btn.addEventListener('click', ev => { ev.stopPropagation(); document.querySelectorAll('.f-pop').forEach(p => { if (p !== pop) p.hidden = true; }); pop.hidden = !pop.hidden; });
      pop.addEventListener('click', ev => ev.stopPropagation());
      box.appendChild(btn); box.appendChild(pop); return box;
    }
    const inp = document.createElement('input'); inp.type = 'search'; inp.placeholder = 'contains'; inp.value = f.text || '';
    let t; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.filters[col.key] = { text: inp.value }; onChange(); const again = document.querySelector('[data-refocus="' + col.key + '"]'); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } }, 250); });
    inp.setAttribute('data-refocus', col.key);
    return inp;
  }
  document.addEventListener('click', () => document.querySelectorAll('.f-pop').forEach(p => { p.hidden = true; }));

  window.Table = { render, STATE };
})();
