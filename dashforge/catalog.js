/* Metric catalog. The LLM (or the fallback planner) chooses from these by id.
   Every entry computes from the world as of a day index (0..89). */
(function () {
  'use strict';

  const sum = a => a.reduce((x, y) => x + y, 0);
  const avg = a => a.length ? sum(a) / a.length : 0;
  const win = (a, d, n) => a.slice(Math.max(0, d - n + 1), d + 1);
  const prevWin = (a, d, n) => a.slice(Math.max(0, d - 2 * n + 1), Math.max(0, d - n + 1));
  const pct = (a, b) => (b === 0 ? 0 : (a - b) / Math.abs(b));

  const fmt = {
    money: v => Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e3 ? '$' + (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + 'K' : '$' + Math.round(v),
    money0: v => '$' + Math.round(v).toLocaleString('en-US'),
    int: v => Math.round(v).toLocaleString('en-US'),
    num1: v => (+v).toFixed(1),
    num2: v => (+v).toFixed(2),
    pct: v => (v * 100).toFixed(1) + '%',
    pct0: v => Math.round(v * 100) + '%',
    x: v => (+v).toFixed(1) + 'x',
    hours: v => (+v).toFixed(1) + 'h',
    days: v => Math.round(v) + 'd'
  };

  function monthStart(W, d) { const m = W.dates[d].getMonth(); let s = d; while (s > 0 && W.dates[s - 1].getMonth() === m) s--; return s; }

  // ---- KPI catalog -------------------------------------------------------
  // compute(W, d) -> { value, prev, spark }  prev = comparable prior-period value; spark = last 30 points
  const KPIS = {
    bookings_mtd: { label: 'Bookings MTD', domain: 'sales', better: 'up', format: fmt.money, compute(W, d) { const s = monthStart(W, d); const v = sum(W.bookings.slice(s, d + 1)); const n = d - s + 1; const pv = sum(W.bookings.slice(Math.max(0, s - 30), Math.max(0, s - 30) + n)); return { value: v, prev: pv, spark: win(W.bookings, d, 30), prevLabel: 'same days last month' }; } },
    pipeline_coverage: { label: 'Pipeline coverage', domain: 'sales', better: 'up', format: fmt.x, compute(W, d) { const q = sum(W.profile.reps.map(r => r.quota)); const cov = v => v / q; return { value: cov(W.pipeline[d]), prev: cov(W.pipeline[Math.max(0, d - 30)]), spark: win(W.pipeline, d, 30).map(cov), target: 3, prevLabel: '30 days ago' }; } },
    win_rate: { label: 'Win rate', domain: 'sales', better: 'up', format: fmt.pct, compute(W, d) { const w = sum(win(W.won, d, 30)), o = sum(win(W.opps, Math.max(0, d - 24), 30)); const pw = sum(prevWin(W.won, d, 30)), po = sum(prevWin(W.opps, Math.max(0, d - 24), 30)); return { value: o ? w / o : 0, prev: po ? pw / po : 0, spark: win(W.won, d, 30), prevLabel: 'prior 30 days' }; } },
    avg_deal_size: { label: 'Average deal size', domain: 'sales', better: 'up', format: fmt.money, compute(W, d) { const cur = W.deals.filter(x => x.day > d - 30 && x.day <= d), pr = W.deals.filter(x => x.day > d - 60 && x.day <= d - 30); return { value: avg(cur.map(x => x.amount)), prev: avg(pr.map(x => x.amount)), spark: win(W.bookings, d, 30), prevLabel: 'prior 30 days' }; } },
    sales_cycle: { label: 'Sales cycle', domain: 'sales', better: 'down', format: fmt.days, compute(W, d) { const v = 31 + (d > 60 ? (d - 60) * 0.18 : 0); return { value: v, prev: 31, spark: Array.from({ length: 30 }, (_, i) => 31 + Math.max(0, d - 29 + i - 60) * 0.18), prevLabel: '30 days ago' }; } },
    quota_attainment: { label: 'Quota attainment', domain: 'sales', better: 'up', format: fmt.pct0, compute(W, d) { const s = monthStart(W, d); const q = sum(W.profile.reps.map(r => r.quota)); const v = sum(W.bookings.slice(s, d + 1)) / q; const daysIn = d - s + 1; return { value: v, prev: daysIn / 30, spark: win(W.bookings, d, 30), prevLabel: 'pro-rated target', target: daysIn / 30 }; } },
    mqls: { label: 'MQLs (30d)', domain: 'marketing', better: 'up', format: fmt.int, compute(W, d) { return { value: sum(win(W.mql, d, 30)), prev: sum(prevWin(W.mql, d, 30)), spark: win(W.mql, d, 30), prevLabel: 'prior 30 days' }; } },
    cac: { label: 'CAC (30d)', domain: 'marketing', better: 'down', format: fmt.money0, compute(W, d) { const sp = n => sum(W.spend.map(ch => sum(n === 0 ? win(ch, d, 30) : prevWin(ch, d, 30)))); const w = sum(win(W.won, d, 30)), pw = sum(prevWin(W.won, d, 30)); return { value: w ? sp(0) / w : 0, prev: pw ? sp(1) / pw : 0, spark: win(W.cpcMult, d, 30), prevLabel: 'prior 30 days' }; } },
    blended_cpl: { label: 'Blended CPL (30d)', domain: 'marketing', better: 'down', format: fmt.money0, compute(W, d) { const sp = f => sum(W.spend.map(ch => sum(f(ch)))); const v = sp(ch => win(ch, d, 30)) / sum(win(W.mql, d, 30)); const p = sp(ch => prevWin(ch, d, 30)) / (sum(prevWin(W.mql, d, 30)) || 1); const sk = []; for (let i = 29; i >= 0; i--) { const k = Math.max(0, d - i); sk.push(sum(W.spend.map(ch => ch[k])) / (W.mql[k] || 1)); } return { value: v, prev: p, spark: sk, prevLabel: 'prior 30 days' }; } },
    mql_to_sql: { label: 'MQL to SQL rate', domain: 'marketing', better: 'up', format: fmt.pct, compute(W, d) { const v = sum(win(W.sql, d, 30)) / (sum(win(W.mql, Math.max(0, d - 4), 30)) || 1); const p = sum(prevWin(W.sql, d, 30)) / (sum(prevWin(W.mql, Math.max(0, d - 4), 30)) || 1); return { value: v, prev: p, spark: win(W.sql, d, 30), prevLabel: 'prior 30 days' }; } },
    roas: { label: 'ROAS (30d)', domain: 'marketing', better: 'up', format: fmt.x, compute(W, d) { const sp = f => sum(W.spend.map(ch => sum(f(ch)))); const v = sum(win(W.bookings, d, 30)) / sp(ch => win(ch, d, 30)); const p = sum(prevWin(W.bookings, d, 30)) / (sp(ch => prevWin(ch, d, 30)) || 1); return { value: v, prev: p, spark: win(W.bookings, d, 30), prevLabel: 'prior 30 days' }; } },
    site_traffic: { label: 'Site traffic (30d)', domain: 'marketing', better: 'up', format: fmt.int, compute(W, d) { const t = k => sum(W.traffic.map(ch => ch[k])); const sk = []; for (let i = 29; i >= 0; i--) sk.push(t(Math.max(0, d - i))); const pk = []; for (let i = 59; i >= 30; i--) pk.push(t(Math.max(0, d - i))); return { value: sum(sk), prev: sum(pk), spark: sk, prevLabel: 'prior 30 days' }; } },
    open_tickets: { label: 'Open tickets', domain: 'support', better: 'down', format: fmt.int, compute(W, d) { return { value: W.backlog[d], prev: W.backlog[Math.max(0, d - 30)], spark: win(W.backlog, d, 30), prevLabel: '30 days ago' }; } },
    backlog_age: { label: 'Median open ticket age', domain: 'support', better: 'down', format: fmt.hours, compute(W, d) { const med = rows => { const a = rows.map(r => r.age).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; }; return { value: med(W.openTickets(d)), prev: med(W.openTickets(Math.max(0, d - 30))), spark: win(W.backlog, d, 30), prevLabel: '30 days ago' }; } },
    first_response: { label: 'First response time', domain: 'support', better: 'down', format: fmt.hours, compute(W, d) { return { value: avg(win(W.frt, d, 7)), prev: avg(prevWin(W.frt, d, 7)), spark: win(W.frt, d, 30), target: 4, prevLabel: 'prior week' }; } },
    csat: { label: 'CSAT (7d)', domain: 'support', better: 'up', format: fmt.num2, compute(W, d) { return { value: avg(win(W.csat, d, 7)), prev: avg(prevWin(W.csat, d, 7)), spark: win(W.csat, d, 30), target: 4.3, prevLabel: 'prior week' }; } },
    sla_breach: { label: 'SLA breach rate', domain: 'support', better: 'down', format: v => fmt.num1(v) + '%', compute(W, d) { return { value: avg(win(W.sla, d, 7)), prev: avg(prevWin(W.sla, d, 7)), spark: win(W.sla, d, 30), target: 5, prevLabel: 'prior week' }; } },
    tickets_per_100: { label: 'Tickets per 100 customers (7d)', domain: 'support', better: 'down', format: fmt.num1, compute(W, d) { const v = sum(win(W.created, d, 7)) / W.active[d] * 100; const p = sum(prevWin(W.created, d, 7)) / W.active[Math.max(0, d - 7)] * 100; return { value: v, prev: p, spark: win(W.created, d, 30), prevLabel: 'prior week' }; } },
    resolution_rate: { label: 'Same-day resolution', domain: 'support', better: 'up', format: fmt.pct0, compute(W, d) { return { value: avg(win(W.resRate, d, 7)), prev: avg(prevWin(W.resRate, d, 7)), spark: win(W.resRate, d, 30), prevLabel: 'prior week' }; } },
    churn_risk: { label: 'Churn-risk accounts', domain: 'cs', better: 'down', format: fmt.int, compute(W, d) { const v = k => Math.round(18 + sum(win(W.churned, k, 14)) * 1.6); return { value: v(d), prev: v(Math.max(0, d - 30)), spark: win(W.churned, d, 30), prevLabel: '30 days ago' }; } },
    nrr: { label: 'NRR (30d, annualized)', domain: 'cs', better: 'up', format: fmt.pct, compute(W, d) { const f = (e, c, ch, a0) => 1 + (sum(e) - sum(c) - sum(ch) * 7400) * 12 / a0; const v = f(win(W.expansion, d, 30), win(W.contraction, d, 30), win(W.churned, d, 30), W.arr[Math.max(0, d - 30)]); const p = f(prevWin(W.expansion, d, 30), prevWin(W.contraction, d, 30), prevWin(W.churned, d, 30), W.arr[Math.max(0, d - 60)]); return { value: v, prev: p, spark: win(W.expansion, d, 30), prevLabel: 'prior 30 days' }; } },
    arr: { label: 'ARR', domain: 'exec', better: 'up', format: fmt.money, compute(W, d) { return { value: W.arr[d], prev: W.arr[Math.max(0, d - 30)], spark: win(W.arr, d, 30), prevLabel: '30 days ago' }; } },
    active_customers: { label: 'Active customers', domain: 'exec', better: 'up', format: fmt.int, compute(W, d) { return { value: W.active[d], prev: W.active[Math.max(0, d - 30)], spark: win(W.active, d, 30), prevLabel: '30 days ago' }; } }
  };

  // ---- Block catalog -----------------------------------------------------
  // data(W, d) -> spec consumed by Charts / Table
  const dayLabels = (W, d, n) => win(W.dates, d, n);
  const seriesWin = (W, arr, d, n) => win(arr, d, n);

  const BLOCKS = {
    bookings_trend: { title: 'Bookings, daily', domain: 'sales', kind: 'line', w: 8, data(W, d) { const n = 60; return { x: dayLabels(W, d, n), series: [{ name: 'Bookings', values: seriesWin(W, W.bookings, d, n) }], target: { label: 'Daily target', value: sum(W.profile.reps.map(r => r.quota)) / 30 }, format: fmt.money, events: W.events }; } },
    pipeline_funnel: { title: 'Funnel, last 30 days', domain: 'sales', kind: 'funnel', w: 4, data(W, d) { const s = a => sum(win(a, d, 30)); return { stages: [{ name: 'Leads (MQL)', value: s(W.mql) }, { name: 'SQL', value: s(W.sql) }, { name: 'Opportunity', value: s(W.opps) }, { name: 'Closed won', value: s(W.won) }] }; } },
    revenue_by_region: { title: 'Bookings by region, last 30 days', domain: 'sales', kind: 'bar', w: 4, data(W, d) { const m = {}; W.profile.regions.forEach(r => m[r] = 0); W.deals.filter(x => x.day > d - 30 && x.day <= d).forEach(x => m[x.region] += x.amount); return { categories: W.profile.regions, values: W.profile.regions.map(r => m[r]), format: fmt.money }; } },
    rep_leaderboard: { title: 'Rep leaderboard, month to date', domain: 'sales', kind: 'table', w: 6, data(W, d) { const s = monthStart(W, d); const rows = W.profile.reps.map(r => { const ds = W.deals.filter(x => x.day >= s && x.day <= d && x.repId === r.id); const b = sum(ds.map(x => x.amount)); const opn = W.openOpps(d).filter(o => o.rep === r.name); return { rep: r.name, region: r.region, bookings: b, deals: ds.length, quota: r.quota, attainment: +(b / r.quota * 100).toFixed(0), pipeline: sum(opn.map(o => o.amount)), open: opn.length }; }); return { columns: [{ key: 'rep', label: 'Rep', type: 'text' }, { key: 'region', label: 'Region', type: 'cat' }, { key: 'bookings', label: 'Bookings MTD', type: 'num', format: fmt.money }, { key: 'deals', label: 'Deals', type: 'num' }, { key: 'attainment', label: 'Attainment', type: 'num', format: v => v + '%' }, { key: 'pipeline', label: 'Open pipeline', type: 'num', format: fmt.money }, { key: 'open', label: 'Open opps', type: 'num' }], rows, sort: { key: 'bookings', dir: 'desc' } }; } },
    cpl_by_channel: { title: 'Cost per lead by channel, last 30 days', domain: 'marketing', kind: 'hbar', w: 4, data(W, d) { const v = W.profile.channels.map((ch, c) => sum(win(W.spend[c], d, 30)) / (sum(win(W.leads[c], d, 30)) || 1)); return { categories: W.profile.channels.map(c => c.name), values: v, format: fmt.money0 }; } },
    roas_trend: { title: 'ROAS, trailing 14 days', domain: 'marketing', kind: 'line', w: 8, data(W, d) { const n = 60; const vals = []; for (let i = n - 1; i >= 0; i--) { const k = Math.max(0, d - i); vals.push(sum(win(W.bookings, k, 14)) / (sum(W.spend.map(ch => sum(win(ch, k, 14)))) || 1)); } return { x: dayLabels(W, d, n), series: [{ name: 'ROAS', values: vals }], format: fmt.x, events: W.events }; } },
    traffic_by_source: { title: 'Site traffic by source, last 30 days', domain: 'marketing', kind: 'donut', w: 4, data(W, d) { return { categories: W.profile.channels.map(c => c.name), values: W.traffic.map(ch => sum(win(ch, d, 30))), format: fmt.int }; } },
    leads_by_channel: { title: 'Leads by channel, daily', domain: 'marketing', kind: 'stacked', w: 8, data(W, d) { const n = 60; return { x: dayLabels(W, d, n), series: W.profile.channels.map((ch, c) => ({ name: ch.name, values: seriesWin(W, W.leads[c], d, n) })), format: fmt.int, events: W.events }; } },
    tickets_by_queue: { title: 'Tickets created by queue, daily', domain: 'support', kind: 'stacked', w: 8, data(W, d) { const n = 60; return { x: dayLabels(W, d, n), series: W.profile.queues.map((q, i) => ({ name: q.name, values: seriesWin(W, W.tickets[i], d, n) })), format: fmt.int, events: W.events }; } },
    ticket_aging: { title: 'Open tickets by age', domain: 'support', kind: 'bar', w: 4, data(W, d) { const b = ['Under 4h', '4-24h', '1-3d', 'Over 3d']; const rows = W.openTickets(d); return { categories: b, values: b.map(k => rows.filter(r => r.bucket === k).length), format: fmt.int, colors: ['good', 'good', 'warning', 'critical'] }; } },
    frt_trend: { title: 'First response time, daily', domain: 'support', kind: 'line', w: 8, data(W, d) { const n = 60; return { x: dayLabels(W, d, n), series: [{ name: 'First response (h)', values: seriesWin(W, W.frt, d, n) }], band: { label: 'SLA', from: 0, to: 4 }, format: fmt.hours, events: W.events }; } },
    csat_trend: { title: 'CSAT, daily', domain: 'support', kind: 'line', w: 6, data(W, d) { const n = 60; return { x: dayLabels(W, d, n), series: [{ name: 'CSAT', values: seriesWin(W, W.csat, d, n) }], target: { label: 'Target 4.3', value: 4.3 }, yMin: 3, yMax: 5, format: fmt.num2, events: W.events }; } },
    backlog_trend: { title: 'Open tickets, daily', domain: 'support', kind: 'line', w: 6, data(W, d) { const n = 60; return { x: dayLabels(W, d, n), series: [{ name: 'Open tickets', values: seriesWin(W, W.backlog, d, n) }], format: fmt.int, events: W.events }; } },
    open_tickets: { title: 'Open customer service requests', domain: 'support', kind: 'table', w: 12, data(W, d) { return { columns: [{ key: 'id', label: 'Ticket', type: 'text' }, { key: 'customer', label: 'Customer', type: 'text' }, { key: 'queue', label: 'Queue', type: 'cat' }, { key: 'subject', label: 'Subject', type: 'text' }, { key: 'priority', label: 'Priority', type: 'cat', order: ['Urgent', 'High', 'Normal', 'Low'] }, { key: 'age', label: 'Age (h)', type: 'num', format: v => v.toFixed(1) }, { key: 'bucket', label: 'Age bucket', type: 'cat', order: ['Under 4h', '4-24h', '1-3d', 'Over 3d'] }, { key: 'owner', label: 'Owner', type: 'cat' }, { key: 'sla', label: 'SLA', type: 'status', order: ['Breached', 'At risk', 'Within SLA'] }], rows: W.openTickets(d), sort: { key: 'age', dir: 'desc' }, pageSize: 12 }; } },
    open_opps: { title: 'Open opportunities', domain: 'sales', kind: 'table', w: 12, data(W, d) { return { columns: [{ key: 'id', label: 'Opp', type: 'text' }, { key: 'account', label: 'Account', type: 'text' }, { key: 'rep', label: 'Rep', type: 'cat' }, { key: 'region', label: 'Region', type: 'cat' }, { key: 'product', label: 'Plan', type: 'cat' }, { key: 'stage', label: 'Stage', type: 'cat', order: ['Discovery', 'Demo', 'Proposal', 'Negotiation', 'Verbal'] }, { key: 'amount', label: 'Amount', type: 'num', format: fmt.money }, { key: 'age', label: 'Age (d)', type: 'num' }, { key: 'closeIn', label: 'Close in (d)', type: 'num' }, { key: 'health', label: 'Health', type: 'status', order: ['Slipping', 'Stale', 'On track'] }], rows: W.openOpps(d), sort: { key: 'amount', dir: 'desc' }, pageSize: 10 }; } },
    campaigns: { title: 'Campaigns', domain: 'marketing', kind: 'table', w: 12, data(W, d) { return { columns: [{ key: 'name', label: 'Campaign', type: 'text' }, { key: 'channel', label: 'Channel', type: 'cat' }, { key: 'status', label: 'Status', type: 'cat' }, { key: 'spend', label: 'Spend', type: 'num', format: fmt.money }, { key: 'leads', label: 'Leads', type: 'num' }, { key: 'cpl', label: 'CPL', type: 'num', format: fmt.money0 }, { key: 'sqls', label: 'SQLs', type: 'num' }, { key: 'won', label: 'Won', type: 'num' }, { key: 'revenue', label: 'Revenue', type: 'num', format: fmt.money }, { key: 'roas', label: 'ROAS', type: 'num', format: fmt.x }], rows: W.campaigns, sort: { key: 'spend', dir: 'desc' } }; } },
    agent_workload: { title: 'Open tickets by agent', domain: 'support', kind: 'hbar', w: 4, data(W, d) { const rows = W.openTickets(d); const cats = W.profile.agents.concat(['Unassigned']); return { categories: cats, values: cats.map(a => rows.filter(r => r.owner === a).length), format: fmt.int }; } },
    alert_feed: { title: 'Alerts', domain: 'all', kind: 'alerts', w: 4, data(W, d) { return { alerts: alerts(W, d) }; } },
    // Alternate chart forms (permutation "full")
    quota_bullets: { title: 'Quota attainment by rep, month to date', domain: 'sales', kind: 'bullet', w: 6, data(W, d) { const s = monthStart(W, d); const frac = (d - s + 1) / 30; return { rows: W.profile.reps.map(r => { const b = sum(W.deals.filter(x => x.day >= s && x.day <= d && x.repId === r.id).map(x => x.amount)); return { name: r.name, actual: b, target: r.quota * frac, stretch: r.quota }; }), format: fmt.money }; } },
    region_multiples: { title: 'Bookings by region, weekly', domain: 'sales', kind: 'multiples', w: 6, data(W, d) { const weeks = 8; const panels = W.profile.regions.map(r => { const vals = []; for (let wk = weeks - 1; wk >= 0; wk--) { const hi = d - wk * 7, lo = hi - 6; vals.push(sum(W.deals.filter(x => x.region === r && x.day >= lo && x.day <= hi).map(x => x.amount))); } return { name: r, values: vals }; }); return { panels, format: fmt.money }; } },
    arr_waterfall: { title: 'ARR movement, last 30 days', domain: 'exec', kind: 'waterfall', w: 6, data(W, d) { const k = Math.max(0, d - 30); const nw = sum(win(W.bookings, d, 30)), ex = sum(win(W.expansion, d, 30)), co = sum(win(W.contraction, d, 30)), ch = sum(win(W.churned, d, 30)) * 7400; return { steps: [{ name: 'Start', value: W.arr[k], type: 'total' }, { name: 'New', value: nw }, { name: 'Expansion', value: ex }, { name: 'Contraction', value: -co }, { name: 'Churn', value: -ch }, { name: 'End', value: W.arr[d], type: 'total' }], format: fmt.money }; } },
    ticket_heatmap: { title: 'Ticket arrivals by weekday and hour', domain: 'support', kind: 'heatmap', w: 6, data(W, d) { return { rows: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], cols: Array.from({ length: 24 }, (_, h) => h), matrix: W.heat, format: fmt.int }; } },
    cpl_slope: { title: 'CPL by channel, prior 30 days vs last 30', domain: 'marketing', kind: 'slope', w: 4, data(W, d) { return { items: W.profile.channels.map((ch, c) => ({ name: ch.name, a: sum(prevWin(W.spend[c], d, 30)) / (sum(prevWin(W.leads[c], d, 30)) || 1), b: sum(win(W.spend[c], d, 30)) / (sum(win(W.leads[c], d, 30)) || 1) })), labels: ['Prior 30d', 'Last 30d'], format: fmt.money0 }; } },
    rep_dotstrip: { title: 'Quota attainment, all reps', domain: 'sales', kind: 'dots', w: 6, data(W, d) { const s = monthStart(W, d); return { items: W.profile.reps.map(r => ({ name: r.name, value: sum(W.deals.filter(x => x.day >= s && x.day <= d && x.repId === r.id).map(x => x.amount)) / r.quota })), marker: { label: 'Pro-rated target', value: (d - s + 1) / 30 }, format: fmt.pct0 }; } },
    flow_diagram: { title: 'One company, one flow: marketing to sales to support (last 30 days)', domain: 'all', kind: 'flow', w: 12, data(W, d) { const ch = W.profile.channels.map((c, i) => ({ name: c.name, value: sum(win(W.leads[i], d, 30)) })); const stages = [{ name: 'MQL', value: sum(win(W.mql, d, 30)) }, { name: 'SQL', value: sum(win(W.sql, d, 30)) }, { name: 'Opportunity', value: sum(win(W.opps, d, 30)) }, { name: 'Closed won', value: sum(win(W.won, d, 30)) }]; const qs = W.profile.queues.map((q, i) => ({ name: q.name, value: sum(win(W.tickets[i], d, 30)) })); return { channels: ch, stages, customers: { name: 'Active customers', value: W.active[d], newly: sum(win(W.won, d, 30)) }, queues: qs, format: fmt.int }; } }
  };

  // ---- Alerts derived from the world -------------------------------------
  function alerts(W, d) {
    const out = [];
    const cpc = W.cpcMult[d];
    if (cpc > 1.15) out.push({ sev: 'serious', domain: 'marketing', text: 'Paid search CPC is ' + Math.round((cpc - 1) * 100) + '% above the pre-' + W.dates[W.CPC_EVENT_DAY].toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' baseline', target: 'cpl_by_channel', alt: ['cpl_slope', 'roas_trend', 'leads_by_channel'] });
    const cov = KPIS.pipeline_coverage.compute(W, d);
    if (cov.value < 3) out.push({ sev: cov.value < 2.5 ? 'critical' : 'warning', domain: 'sales', text: 'Pipeline coverage ' + cov.value.toFixed(1) + 'x, below the 3x floor', target: 'pipeline_funnel', alt: ['open_opps', 'bookings_trend'] });
    const slip = W.openOpps(d).filter(o => o.health === 'Slipping');
    if (slip.length) out.push({ sev: 'warning', domain: 'sales', text: slip.length + ' opportunities past their close date (' + fmt.money(sum(slip.map(o => o.amount))) + ')', target: 'open_opps', alt: ['rep_leaderboard'] });
    const tech = W.tickets[1][d], base = avg(W.tickets[1].slice(Math.max(0, d - 40), Math.max(1, d - 10)));
    if (tech > base * 1.6 && d >= W.RELEASE_DAY) out.push({ sev: 'critical', domain: 'support', text: 'Technical queue at ' + (tech / base).toFixed(1) + 'x normal volume since the v4.2 release', target: 'tickets_by_queue', alt: ['open_tickets', 'backlog_trend'] });
    const sla = avg(win(W.sla, d, 7));
    if (sla > 8) out.push({ sev: sla > 15 ? 'critical' : 'serious', domain: 'support', text: 'SLA breach rate ' + sla.toFixed(0) + '% over the last 7 days (target 5%)', target: 'open_tickets', alt: ['frt_trend', 'ticket_aging'] });
    const breached = W.openTickets(d).filter(t => t.sla === 'Breached').length;
    if (breached > 5) out.push({ sev: 'serious', domain: 'support', text: breached + ' open tickets have already breached SLA', target: 'ticket_aging', alt: ['open_tickets'] });
    const cs = avg(win(W.csat, d, 7));
    if (cs < 4.1) out.push({ sev: 'warning', domain: 'support', text: 'CSAT ' + cs.toFixed(2) + ' for the week, below 4.3 target', target: 'csat_trend', alt: ['open_tickets'] });
    const unas = W.openTickets(d).filter(t => t.owner === 'Unassigned').length;
    if (unas > 10) out.push({ sev: 'warning', domain: 'support', text: unas + ' open tickets unassigned', target: 'agent_workload', alt: ['open_tickets'] });
    const cr = KPIS.churn_risk.compute(W, d);
    if (cr.value > cr.prev * 1.4) out.push({ sev: 'serious', domain: 'cs', text: 'Churn-risk accounts up to ' + cr.value + ' from ' + cr.prev, target: 'arr_waterfall', alt: ['open_tickets', 'csat_trend'] });
    if (!out.length) out.push({ sev: 'good', domain: 'all', text: 'No active alerts. All monitored metrics within range.', target: null });
    return out;
  }

  // ---- Compact digest of the world for the LLM prompt --------------------
  function digest(W, d) {
    const k = {};
    for (const id of Object.keys(KPIS)) { const r = KPIS[id].compute(W, d); k[id] = { value: KPIS[id].format(r.value), change_vs_prior: (pct(r.value, r.prev) * 100).toFixed(0) + '%', prior: KPIS[id].prevLabel || 'prior period' }; }
    const openT = W.openTickets(d);
    return {
      company: { name: W.profile.name, industry: W.profile.industry, as_of: W.dates[d].toISOString().slice(0, 10), active_customers: W.active[d], arr: fmt.money(W.arr[d]) },
      kpis: k,
      story_events: W.events.filter(e => e.day <= d).map(e => ({ date: W.dates[e.day].toISOString().slice(0, 10), label: e.label, detail: e.detail })),
      open_tickets: { count: openT.length, by_queue: W.profile.queues.map(q => q.name + ': ' + openT.filter(t => t.queue === q.name).length).join(', '), breached: openT.filter(t => t.sla === 'Breached').length, unassigned: openT.filter(t => t.owner === 'Unassigned').length },
      alerts: alerts(W, d).map(a => a.text),
      top_rep_mtd: (function () { const r = BLOCKS.rep_leaderboard.data(W, d).rows.slice().sort((a, b) => b.bookings - a.bookings)[0]; return r ? r.rep + ' (' + fmt.money(r.bookings) + ', ' + r.attainment + '% of quota)' : null; })()
    };
  }

  window.Catalog = { KPIS, BLOCKS, alerts, digest, fmt, sum, avg, win, prevWin, pct, monthStart };
})();
