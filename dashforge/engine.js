/* Dashforge world engine.
   One seeded simulation of a company across Marketing -> Sales -> Support.
   Every number on every dashboard comes from here. Nothing is invented by the LLM. */
(function () {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  const DAYS = 90;
  const WARM = 30;          // simulated but not shown, so lagged series start in steady state
  const N = DAYS + WARM;
  const CPC_EVENT_DAY = 45;   // paid search CPC rises
  const RELEASE_DAY = 63;     // product release causes technical ticket spike

  const DEFAULT_PROFILE = {
    name: 'Northpeak Software',
    industry: 'B2B SaaS (field-service scheduling)',
    model: 'B2B',
    seed: 20260911,
    products: [
      { id: 'starter', name: 'Starter', arr: 1800 },
      { id: 'team', name: 'Team', arr: 6400 },
      { id: 'business', name: 'Business', arr: 18000 },
      { id: 'enterprise', name: 'Enterprise', arr: 72000 }
    ],
    regions: ['West', 'Central', 'East', 'EMEA', 'APAC'],
    channels: [
      { id: 'paid_search', name: 'Paid search', spend: 3000, cpl: 62, accept: 0.42, trafficPerLead: 38 },
      { id: 'paid_social', name: 'Paid social', spend: 1200, cpl: 48, accept: 0.31, trafficPerLead: 55 },
      { id: 'organic', name: 'Organic', spend: 350, cpl: 14, accept: 0.47, trafficPerLead: 70 },
      { id: 'email', name: 'Email', spend: 220, cpl: 11, accept: 0.55, trafficPerLead: 9 },
      { id: 'events', name: 'Events', spend: 900, cpl: 95, accept: 0.6, trafficPerLead: 2 },
      { id: 'referral', name: 'Referral', spend: 120, cpl: 20, accept: 0.68, trafficPerLead: 3 }
    ],
    reps: [
      { id: 'r1', name: 'Maya Okafor', region: 'West', quota: 240000 },
      { id: 'r2', name: 'Daniel Reyes', region: 'West', quota: 220000 },
      { id: 'r3', name: 'Priya Natarajan', region: 'Central', quota: 200000 },
      { id: 'r4', name: 'Tom Lindqvist', region: 'East', quota: 230000 },
      { id: 'r5', name: 'Grace Whitfield', region: 'East', quota: 210000 },
      { id: 'r6', name: 'Luca Moretti', region: 'EMEA', quota: 250000 },
      { id: 'r7', name: 'Hannah Steiner', region: 'EMEA', quota: 190000 },
      { id: 'r8', name: 'Kenji Watanabe', region: 'APAC', quota: 180000 }
    ],
    queues: [
      { id: 'billing', name: 'Billing', share: 0.22, sla: 8 },
      { id: 'technical', name: 'Technical', share: 0.34, sla: 4 },
      { id: 'onboarding', name: 'Onboarding', share: 0.18, sla: 12 },
      { id: 'delivery', name: 'Delivery', share: 0.12, sla: 12 },
      { id: 'account', name: 'Account changes', share: 0.14, sla: 24 }
    ],
    agents: ['Sofia Alvarez', 'Ben Carter', 'Amara Diallo', 'Noah Fischer', 'Leila Haddad', 'Owen Park'],
    customerNames: ['Acme Field Co', 'Bluewater HVAC', 'Cedar Plumbing', 'Delta Electric', 'Evergreen Landscaping', 'Fairway Pools',
      'Granite Roofing', 'Harbor Pest Control', 'Ironwood Fencing', 'Juniper Solar', 'Keystone Cleaning', 'Lakeside Irrigation',
      'Maple Home Services', 'Northgate Security', 'Orchard Appliance', 'Pinecrest Painting', 'Quarry Paving', 'Ridgeline Glass',
      'Summit Elevator', 'Tidewater Marine', 'Uplands Tree Care', 'Valley Locksmith', 'Westbrook Movers', 'Yardline Turf', 'Zenith Garage Doors'],
    activeStart: 1850,
    winRate: 0.28
  };

  function build(profileIn) {
    const P = Object.assign({}, DEFAULT_PROFILE, profileIn || {});
    const rnd = mulberry32(P.seed);
    const noise = (amp) => 1 + (rnd() * 2 - 1) * amp;
    const today = new Date(2026, 8, 11); // fixed so the demo is stable
    const dates = [];
    for (let d = 0; d < N; d++) { const t = new Date(today); t.setDate(today.getDate() - (N - 1 - d)); dates.push(t); }
    const dow = dates.map(t => t.getDay());
    const weekend = d => (dow[d] === 0 || dow[d] === 6);

    const nCh = P.channels.length;
    const spend = P.channels.map(() => new Array(N).fill(0));
    const cpl = P.channels.map(() => new Array(N).fill(0));
    const leads = P.channels.map(() => new Array(N).fill(0));
    const traffic = P.channels.map(() => new Array(N).fill(0));
    const cpcMult = new Array(N).fill(1);

    for (let d = 0; d < N; d++) {
      // story event 1: paid search CPC climbs from day 45 to 1.45x by day 55 and stays there
      if (d - WARM >= CPC_EVENT_DAY) cpcMult[d] = 1 + 0.7 * Math.min(1, (d - WARM - CPC_EVENT_DAY) / 10);
      for (let c = 0; c < nCh; c++) {
        const ch = P.channels[c];
        let s = ch.spend * noise(0.12);
        if (ch.id === 'events') s = (d % 14 === 3) ? ch.spend * 9 : ch.spend * 0.25; // lumpy
        if (weekend(d) && (ch.id === 'paid_search' || ch.id === 'paid_social')) s *= 0.6;
        let cost = ch.cpl * noise(0.1);
        if (ch.id === 'paid_search') cost *= cpcMult[d];
        if (ch.id === 'paid_social') cost *= 1 + (cpcMult[d] - 1) * 0.3;
        if (ch.id === 'organic') cost *= (1 - d / N * 0.15); // organic slowly improves
        spend[c][d] = s; cpl[c][d] = cost;
        leads[c][d] = Math.round(s / cost * (weekend(d) ? 0.7 : 1) * noise(0.15));
        traffic[c][d] = Math.round(leads[c][d] * ch.trafficPerLead * noise(0.1) + (ch.id === 'organic' ? 900 : 0) * noise(0.2));
      }
    }
    const mql = new Array(N).fill(0);
    for (let d = 0; d < N; d++) for (let c = 0; c < nCh; c++) mql[d] += leads[c][d];

    // Funnel with lags: MQL -> SQL (4d) -> Opp (7d) -> Won (24d)
    const sql = new Array(N).fill(0), opps = new Array(N).fill(0), won = new Array(N).fill(0);
    const sqlByCh = P.channels.map(() => 0);
    for (let d = 0; d < N; d++) {
      for (let c = 0; c < nCh; c++) {
        const src = d - 4; if (src < 0) { sql[d] += Math.round(leads[c][0] * P.channels[c].accept); continue; }
        const v = Math.round(leads[c][src] * P.channels[c].accept * noise(0.12));
        sql[d] += v; sqlByCh[c] += v;
      }
      const srcO = Math.max(0, d - 7); opps[d] = Math.round(sql[srcO] * 0.62 * noise(0.12));
      const srcW = Math.max(0, d - 24); won[d] = Math.round(opps[srcW] * P.winRate * noise(0.25) * (weekend(d) ? 0.4 : 1));
    }

    // Deals (closed won) with rep, region, product, amount
    const deals = [];
    let dealNo = 4100;
    const productWeights = [0.42, 0.33, 0.19, 0.06];
    for (let d = 0; d < N; d++) {
      for (let i = 0; i < won[d]; i++) {
        const r = rnd(); let pi = 0, acc = 0; for (let k = 0; k < 4; k++) { acc += productWeights[k]; if (r <= acc) { pi = k; break; } }
        const rep = P.reps[Math.floor(rnd() * P.reps.length)];
        const prod = P.products[pi];
        deals.push({ id: 'D-' + (dealNo++), day: d, rep: rep.name, repId: rep.id, region: rep.region, product: prod.name, amount: Math.round(prod.arr * (0.85 + rnd() * 0.4)), customer: P.customerNames[Math.floor(rnd() * P.customerNames.length)] + ' ' + (100 + Math.floor(rnd() * 900)) });
      }
    }
    const bookings = new Array(N).fill(0);
    deals.forEach(x => { bookings[x.day] += x.amount; });
    const avgDeal = deals.length ? Math.round(deals.reduce((a, x) => a + x.amount, 0) / deals.length) : 9000;

    // Open pipeline value: opps created in the trailing 45 days that have not closed
    const pipeline = new Array(N).fill(0);
    for (let d = 0; d < N; d++) { let s = 0; for (let k = Math.max(0, d - 45); k <= d; k++) s += opps[k] * avgDeal * 0.55; pipeline[d] = Math.round(s); }

    // Customers, churn, ARR
    const active = new Array(N).fill(0), churned = new Array(N).fill(0), expansion = new Array(N).fill(0), contraction = new Array(N).fill(0), arr = new Array(N).fill(0);
    let cust = P.activeStart, arrV = P.activeStart * 7400;
    for (let d = 0; d < N; d++) {
      const churnRate = 0.0006 * (d - WARM >= RELEASE_DAY + 3 ? 2.6 : 1) * noise(0.3);
      churned[d] = Math.round(cust * churnRate);
      cust += won[d] - churned[d];
      const expRate = 0.0009 * (d - WARM >= RELEASE_DAY + 5 ? 0.55 : 1) * noise(0.3);
      expansion[d] = Math.round(arrV * expRate);
      contraction[d] = Math.round(arrV * 0.0003 * (d - WARM >= RELEASE_DAY + 5 ? 1.8 : 1) * noise(0.3));
      arrV += bookings[d] + expansion[d] - contraction[d] - churned[d] * 7400;
      active[d] = cust; arr[d] = Math.round(arrV);
    }

    // Support
    const nQ = P.queues.length;
    const tickets = P.queues.map(() => new Array(N).fill(0));
    const created = new Array(N).fill(0), resolved = new Array(N).fill(0), backlog = new Array(N).fill(0);
    const frt = new Array(N).fill(0), csat = new Array(N).fill(0), sla = new Array(N).fill(0), resRate = new Array(N).fill(0);
    let bl = 34;
    for (let d = 0; d < N; d++) {
      const od = d - WARM;
      const spike = (od >= RELEASE_DAY) ? 1 + 1.5 * Math.exp(-(od - RELEASE_DAY) / 9) : 1; // technical spike decays
      const base = active[d] * 0.029 * (weekend(d) ? 0.45 : 1) * noise(0.12);
      let tot = 0;
      for (let q = 0; q < nQ; q++) {
        let v = base * P.queues[q].share;
        if (P.queues[q].id === 'technical') v *= spike;
        if (P.queues[q].id === 'onboarding') v *= (1 + 0.3 * (spike - 1));
        tickets[q][d] = Math.round(v); tot += tickets[q][d];
      }
      created[d] = tot;
      // capacity tracks headcount (scales with customers); overtime kicks in when the queue is deep
      const capacity = active[d] * 0.0315 * (weekend(d) ? 0.45 : 1) * (bl > 120 ? 1.08 : 1) * noise(0.06);
      const res = Math.min(bl + tot, Math.round(capacity));
      resolved[d] = res; bl = Math.max(0, bl + tot - res);
      backlog[d] = bl + Math.round(tot * 0.55); // open = carried over + today's still in progress
      const stress = Math.min(1, Math.max(0, (backlog[d] - 60) / 180));
      frt[d] = +(2.0 + 4.2 * stress * noise(0.15) + (weekend(d) ? 0.6 : 0)).toFixed(2);
      csat[d] = +(4.45 - 0.75 * stress * noise(0.2) + (rnd() - 0.5) * 0.08).toFixed(2);
      sla[d] = +((3.5 + 16 * stress * noise(0.15)) ).toFixed(1);
      resRate[d] = +(0.93 - 0.17 * stress).toFixed(3);
    }

    // Ticket arrivals by hour x weekday (share matrix, from a fixed shape)
    const hourShape = [1, 1, 1, 1, 1, 2, 4, 8, 14, 18, 20, 17, 12, 16, 18, 17, 14, 10, 6, 4, 3, 2, 2, 1];
    const dowShape = [0.3, 1, 1.15, 1.1, 1.05, 0.9, 0.35];
    const heat = [];
    for (let w = 0; w < 7; w++) { const row = []; for (let h = 0; h < 24; h++) row.push(Math.round(hourShape[h] * dowShape[w] * 1.6 * noise(0.25))); heat.push(row); }

    // Campaigns
    const campaignNames = ['Q3 Field Ops Search', 'Dispatch Demo Retarget', 'Fall Trade Show Series', 'Summer Webinar Nurture', 'Brand Awareness Social', 'Referral Bonus Push', 'Enterprise ABM Pilot', 'Onboarding Upsell Email'];
    const campaignCh = ['paid_search', 'paid_social', 'events', 'email', 'paid_social', 'referral', 'paid_search', 'email'];
    const campaigns = campaignNames.map((n, i) => {
      const c = P.channels.findIndex(x => x.id === campaignCh[i]);
      const sp = Math.round((3000 + rnd() * 60000) / 10) * 10;
      const ld = Math.round(sp / P.channels[c].cpl / (campaignCh[i] === 'paid_search' ? 1.25 : 1) * (0.8 + rnd() * 0.4));
      const s = Math.round(ld * P.channels[c].accept);
      const w = Math.round(s * 0.62 * P.winRate);
      return { id: 'C-' + (310 + i), name: n, channel: P.channels[c].name, status: i === 3 ? 'Ended' : (i === 6 ? 'Paused' : 'Active'), spend: sp, leads: ld, sqls: s, won: w, revenue: w * avgDeal, cpl: ld ? Math.round(sp / ld) : 0, roas: sp ? +((w * avgDeal) / sp).toFixed(1) : 0 };
    });

    // Drop the warm-up period.
    const cut = a => a.slice(WARM);
    const cutAll = arrs => arrs.map(cut);
    const dealsOut = deals.filter(x => x.day >= WARM).map(x => Object.assign({}, x, { day: x.day - WARM }));
    const W = {
      profile: P, DAYS, CPC_EVENT_DAY, RELEASE_DAY, dates: cut(dates), dow: cut(dow),
      spend: cutAll(spend), cpl: cutAll(cpl), leads: cutAll(leads), traffic: cutAll(traffic), cpcMult: cut(cpcMult),
      mql: cut(mql), sql: cut(sql), opps: cut(opps), won: cut(won), deals: dealsOut, bookings: cut(bookings), avgDeal, pipeline: cut(pipeline),
      active: cut(active), churned: cut(churned), expansion: cut(expansion), contraction: cut(contraction), arr: cut(arr),
      tickets: cutAll(tickets), created: cut(created), resolved: cut(resolved), backlog: cut(backlog), frt: cut(frt), csat: cut(csat), sla: cut(sla), resRate: cut(resRate), heat, campaigns,
      events: [
        { day: CPC_EVENT_DAY, id: 'cpc', label: 'Paid CPC spike', domain: 'marketing', detail: 'Auction prices rose: paid search CPC +70%, paid social +20%. CAC climbs, MQLs fall, pipeline follows about three weeks later.' },
        { day: RELEASE_DAY, id: 'release', label: 'v4.2 release', domain: 'support', detail: 'Scheduling engine release. Technical tickets spike, first response time rises, CSAT dips, churn risk climbs.' }
      ]
    };
    W.openTickets = (day) => openTickets(W, day);
    W.openOpps = (day) => openOpps(W, day);
    return W;
  }

  // Open ticket table as of a given day. Deterministic per day, count = backlog on that day.
  function openTickets(W, day) {
    const P = W.profile;
    const rnd = mulberry32(P.seed ^ hashStr('tickets' + day));
    const n = W.backlog[day];
    const stress = Math.min(1, Math.max(0, (n - 60) / 180));
    const rows = [];
    const subjects = {
      billing: ['Duplicate charge on invoice', 'Update payment method', 'Refund request', 'Invoice missing PO number', 'Proration question'],
      technical: ['Schedule fails to save', 'Route optimizer timeout', 'Mobile app crash on sync', 'Calendar shows wrong timezone', 'API 502 on job create', 'Notifications not sending'],
      onboarding: ['Import technicians CSV', 'Set up service territories', 'Connect QuickBooks', 'Training session request'],
      delivery: ['Hardware scanner not shipped', 'Tracking number missing', 'Wrong quantity delivered'],
      account: ['Add seats', 'Change admin owner', 'Merge two accounts', 'Downgrade plan']
    };
    for (let i = 0; i < n; i++) {
      // technical share rises during the spike
      const shares = P.queues.map(q => q.id === 'technical' ? q.share * (1 + 1.2 * stress) : q.share);
      const tot = shares.reduce((a, b) => a + b, 0);
      let r = rnd() * tot, qi = 0; for (let k = 0; k < shares.length; k++) { r -= shares[k]; if (r <= 0) { qi = k; break; } }
      const q = P.queues[qi];
      // age in hours: mostly young, long tail grows with stress
      let age;
      const u = rnd();
      if (u < 0.45 - 0.2 * stress) age = rnd() * 4;
      else if (u < 0.78 - 0.15 * stress) age = 4 + rnd() * 20;
      else if (u < 0.94) age = 24 + rnd() * 48;
      else age = 72 + rnd() * 96;
      const pr = rnd(); const priority = pr < 0.08 ? 'Urgent' : pr < 0.3 ? 'High' : pr < 0.75 ? 'Normal' : 'Low';
      const slaH = q.sla * (priority === 'Urgent' ? 0.5 : priority === 'High' ? 0.75 : 1);
      const slaStatus = age > slaH ? 'Breached' : age > slaH * 0.7 ? 'At risk' : 'Within SLA';
      const owner = rnd() < 0.12 + 0.2 * stress ? 'Unassigned' : P.agents[Math.floor(rnd() * P.agents.length)];
      const subj = subjects[q.id][Math.floor(rnd() * subjects[q.id].length)];
      rows.push({ id: 'T-' + (18400 + Math.floor(rnd() * 900) + i * 3), customer: P.customerNames[Math.floor(rnd() * P.customerNames.length)], queue: q.name, subject: subj, priority, age: +age.toFixed(1), owner, sla: slaStatus, bucket: age < 4 ? 'Under 4h' : age < 24 ? '4-24h' : age < 72 ? '1-3d' : 'Over 3d' });
    }
    return rows;
  }

  function openOpps(W, day) {
    const P = W.profile;
    const rnd = mulberry32(P.seed ^ hashStr('opps' + day));
    let n = 0; for (let k = Math.max(0, day - 45); k <= day; k++) n += W.opps[k];
    n = Math.min(60, Math.max(12, Math.round(n * 0.22)));
    const stages = ['Discovery', 'Demo', 'Proposal', 'Negotiation', 'Verbal'];
    const rows = [];
    for (let i = 0; i < n; i++) {
      const rep = P.reps[Math.floor(rnd() * P.reps.length)];
      const pi = Math.floor(rnd() * 4); const prod = P.products[pi];
      const si = Math.floor(rnd() * stages.length);
      const ageD = Math.round(3 + rnd() * 60);
      const closeIn = Math.round(-10 + rnd() * 40);
      const slipping = closeIn < 0;
      rows.push({ id: 'O-' + (7200 + i * 7 + Math.floor(rnd() * 6)), account: P.customerNames[Math.floor(rnd() * P.customerNames.length)] + ' ' + (100 + Math.floor(rnd() * 900)), rep: rep.name, region: rep.region, product: prod.name, stage: stages[si], amount: Math.round(prod.arr * (0.85 + rnd() * 0.5)), age: ageD, closeIn, health: slipping ? 'Slipping' : (ageD > 45 ? 'Stale' : 'On track') });
    }
    return rows;
  }

  // Serialize a built world to plain JSON (pre-generated data for the pages).
  function serialize(W) {
    const out = {};
    for (const k of Object.keys(W)) {
      if (typeof W[k] === 'function') continue;
      if (k === 'dates') { out.dates = W.dates.map(t => t.toISOString().slice(0, 10)); continue; }
      out[k] = W[k];
    }
    // Pre-generate every as-of-day table so the page never simulates.
    out.openTicketsByDay = []; out.openOppsByDay = [];
    for (let d = 0; d < N; d++) { out.openTicketsByDay.push(openTickets(W, d)); out.openOppsByDay.push(openOpps(W, d)); }
    return out;
  }
  // Rehydrate JSON into the shape the catalog expects.
  function hydrate(J) {
    const W = Object.assign({}, J);
    W.dates = J.dates.map(s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); });
    W.openTickets = d => J.openTicketsByDay[d];
    W.openOpps = d => J.openOppsByDay[d];
    return W;
  }

  const api = { build, serialize, hydrate, DEFAULT_PROFILE, DAYS, mulberry32, hashStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Engine = api;
})();
