/* Planner: turns a natural-language role request into the agent contract.
   Two paths produce the same shape: the LLM (via /api/plan or a pasted reply) and this
   keyword fallback. The renderer does not care which produced it. */
(function () {
  'use strict';
  const C = () => window.Catalog;

  const ARCHETYPES = [
    { id: 'sales_rep', title: 'Account Executive', keys: ['account executive', 'sales rep', ' ae ', 'sdr', 'bdr', 'quota carrying', 'closer', 'salesperson', 'sales representative'], reports_to: 'Sales Manager, West', accent: 'blue', alerts_focus: ['sales'],
      day: 'Works a personal pipeline of 15 to 25 open opportunities, runs demos, chases slipping deals, logs activity, and watches quota attainment for the month.',
      measured_on: ['Quota attainment', 'Bookings MTD', 'Win rate', 'Pipeline coverage'], can_control: ['Which opps get attention this week', 'Discount within policy', 'Demo scheduling', 'Follow-up cadence'],
      kpis: ['quota_attainment', 'bookings_mtd', 'pipeline_coverage', 'win_rate', 'avg_deal_size', 'sales_cycle'],
      blocks: [{ id: 'bookings_trend', w: 8 }, { id: 'alert_feed', w: 4 }, { id: 'open_opps', w: 12 }, { id: 'pipeline_funnel', w: 4 }, { id: 'revenue_by_region', w: 4 }, { id: 'rep_leaderboard', w: 4 }],
      alt: { rep_leaderboard: 'rep_dotstrip', revenue_by_region: 'quota_bullets' },
      left_off: [{ metric: 'CAC and CPL', why: 'Marketing efficiency is not something a rep can act on; it shows up here only as lead quality.' }, { metric: 'Ticket backlog', why: 'Support load matters to the rep only for named accounts, which the churn-risk alert covers.' }] },
    { id: 'sales_manager', title: 'VP of Sales', keys: ['sales manager', 'vp sales', 'vp of sales', 'head of sales', 'sales director', 'sales leader', 'cro', 'chief revenue', 'revenue officer', 'sales lead', 'sales'], reports_to: 'CEO', accent: 'blue', alerts_focus: ['sales', 'marketing'],
      day: 'Runs the forecast call, inspects pipeline coverage by rep and region, coaches on stuck deals, and negotiates lead volume with marketing.',
      measured_on: ['Bookings vs plan', 'Pipeline coverage', 'Win rate', 'Forecast accuracy'], can_control: ['Territory and quota allocation', 'Deal desk approvals', 'Rep coaching and hiring', 'Lead acceptance criteria with marketing'],
      kpis: ['bookings_mtd', 'quota_attainment', 'pipeline_coverage', 'win_rate', 'avg_deal_size', 'sales_cycle'],
      blocks: [{ id: 'bookings_trend', w: 8 }, { id: 'alert_feed', w: 4 }, { id: 'pipeline_funnel', w: 4 }, { id: 'revenue_by_region', w: 4 }, { id: 'rep_leaderboard', w: 4 }, { id: 'open_opps', w: 12 }],
      alt: { revenue_by_region: 'region_multiples', rep_leaderboard: 'quota_bullets' },
      left_off: [{ metric: 'CSAT and first response time', why: 'Owned by support; the VP sees the consequence as churn risk on named accounts.' }, { metric: 'Site traffic', why: 'Too far upstream. MQL volume and lead quality are the handoff points that matter here.' }] },
    { id: 'marketing_manager', title: 'Marketing Manager', keys: ['marketing manager', 'head of marketing', 'cmo', 'chief marketing', 'marketing director', 'brand', 'marketing lead', 'marketer', 'marketing'], reports_to: 'CEO', accent: 'orange', alerts_focus: ['marketing'],
      day: 'Allocates spend across channels, reviews CPL and MQL volume every morning, argues lead quality with sales, and runs the campaign calendar.',
      measured_on: ['MQLs vs target', 'CAC', 'ROAS', 'MQL to SQL rate'], can_control: ['Channel budget mix', 'Campaign pause and launch', 'Bids and audiences', 'Content and email calendar'],
      kpis: ['mqls', 'cac', 'blended_cpl', 'mql_to_sql', 'roas', 'site_traffic'],
      blocks: [{ id: 'leads_by_channel', w: 8 }, { id: 'alert_feed', w: 4 }, { id: 'cpl_by_channel', w: 4 }, { id: 'traffic_by_source', w: 4 }, { id: 'pipeline_funnel', w: 4 }, { id: 'roas_trend', w: 12 }, { id: 'campaigns', w: 12 }],
      alt: { cpl_by_channel: 'cpl_slope' },
      left_off: [{ metric: 'Rep leaderboard', why: 'Individual rep performance is a sales management concern, not a marketing lever.' }, { metric: 'Open ticket table', why: 'Support detail does not change a spend decision; churn risk is the only support signal surfaced.' }] },
    { id: 'demand_gen', title: 'Demand Generation Lead', keys: ['demand gen', 'demand generation', 'growth', 'performance marketing', 'paid media', 'ppc', 'sem', 'acquisition'], reports_to: 'Marketing Manager', accent: 'orange', alerts_focus: ['marketing'],
      day: 'Lives in the ad platforms. Adjusts bids and budgets daily, watches CPC and CPL by channel, and hands qualified leads to sales.',
      measured_on: ['CPL by channel', 'MQL volume', 'MQL to SQL rate', 'ROAS'], can_control: ['Daily bids and budgets', 'Keyword and audience targeting', 'Landing page tests', 'Channel pause'],
      kpis: ['blended_cpl', 'mqls', 'cac', 'mql_to_sql', 'roas', 'site_traffic'],
      blocks: [{ id: 'cpl_by_channel', w: 4 }, { id: 'leads_by_channel', w: 8 }, { id: 'campaigns', w: 12 }, { id: 'traffic_by_source', w: 4 }, { id: 'roas_trend', w: 8 }],
      alt: { cpl_by_channel: 'cpl_slope' },
      left_off: [{ metric: 'Bookings and quota', why: 'Downstream of the handoff; shown only through ROAS so spend still ties to revenue.' }, { metric: 'Support metrics', why: 'No lever here changes them.' }] },
    { id: 'support_agent', title: 'Support Agent', keys: ['support agent', 'support rep', 'help desk', 'helpdesk', 'customer service rep', 'customer service agent', 'service agent', 'tier 1', 'tier 2', 'frontline'], reports_to: 'Support Manager', accent: 'aqua', alerts_focus: ['support'],
      day: 'Works the queue oldest-first, keeps first response inside SLA, escalates technical issues to engineering, and closes what can be closed the same day.',
      measured_on: ['First response time', 'CSAT on own tickets', 'Same-day resolution'], can_control: ['Which ticket next', 'Escalation', 'Macro and article use', 'Ownership of unassigned tickets'],
      kpis: ['open_tickets', 'first_response', 'resolution_rate', 'csat', 'sla_breach'],
      blocks: [{ id: 'open_tickets', w: 12 }, { id: 'ticket_aging', w: 4 }, { id: 'agent_workload', w: 4 }, { id: 'alert_feed', w: 4 }, { id: 'frt_trend', w: 8 }, { id: 'csat_trend', w: 4 }],
      alt: {},
      left_off: [{ metric: 'Pipeline and bookings', why: 'Not visible to an agent and not actionable from the queue.' }, { metric: 'Ticket arrival heatmap', why: 'Useful for scheduling shifts, which is the manager\'s call.' }] },
    { id: 'support_manager', title: 'Head of Customer Support', keys: ['support manager', 'support lead', 'head of support', 'customer service manager', 'customer service lead', 'support director', 'service manager', 'head of customer service', 'customer support', 'customer service', 'support'], reports_to: 'COO', accent: 'aqua', alerts_focus: ['support'],
      day: 'Watches backlog and SLA every hour, rebalances agents across queues, staffs shifts against arrival patterns, and escalates release-related spikes to product.',
      measured_on: ['SLA breach rate', 'Backlog age', 'CSAT', 'Tickets per 100 customers'], can_control: ['Agent assignment and shifts', 'Queue priorities and SLA targets', 'Escalation to engineering', 'Overtime'],
      kpis: ['open_tickets', 'backlog_age', 'sla_breach', 'first_response', 'csat', 'tickets_per_100'],
      blocks: [{ id: 'tickets_by_queue', w: 8 }, { id: 'alert_feed', w: 4 }, { id: 'ticket_aging', w: 4 }, { id: 'agent_workload', w: 4 }, { id: 'csat_trend', w: 4 }, { id: 'frt_trend', w: 8 }, { id: 'backlog_trend', w: 4 }, { id: 'open_tickets', w: 12 }],
      alt: { backlog_trend: 'ticket_heatmap' },
      left_off: [{ metric: 'CPL and ROAS', why: 'Marketing spend does not change how the queue is staffed.' }, { metric: 'Rep leaderboard', why: 'Sales performance is upstream; new-customer volume already shows up as onboarding tickets.' }] },
    { id: 'customer_success', title: 'Customer Success Manager', keys: ['customer success', 'csm', 'account manager', 'renewals', 'retention', 'success manager', 'onboarding manager'], reports_to: 'VP of Sales', accent: 'violet', alerts_focus: ['support', 'sales'],
      day: 'Owns renewals and expansion for a book of accounts, watches ticket volume on named customers, and gets ahead of churn signals.',
      measured_on: ['NRR', 'Churn-risk accounts', 'Expansion revenue', 'CSAT'], can_control: ['Renewal outreach timing', 'Executive escalations', 'Expansion proposals', 'Onboarding plans'],
      kpis: ['nrr', 'churn_risk', 'active_customers', 'csat', 'open_tickets', 'arr'],
      blocks: [{ id: 'csat_trend', w: 8 }, { id: 'alert_feed', w: 4 }, { id: 'open_tickets', w: 12 }, { id: 'tickets_by_queue', w: 8 }, { id: 'ticket_aging', w: 4 }],
      alt: { tickets_by_queue: 'arr_waterfall' },
      left_off: [{ metric: 'CPL and MQLs', why: 'Acquisition is not in the CSM\'s book.' }, { metric: 'Rep leaderboard', why: 'New-business competition is not a retention lever.' }] },
    { id: 'gm_exec', title: 'General Manager', keys: ['general manager', ' gm', 'ceo', 'coo', 'cfo', 'founder', 'exec', 'president', 'owner', 'chief', 'leadership', 'board', 'managing director'], reports_to: 'Board', accent: 'violet', alerts_focus: ['sales', 'marketing', 'support'],
      day: 'Starts with ARR and bookings against plan, then looks for the one thing that is off and asks which function owns it.',
      measured_on: ['ARR growth', 'Bookings vs plan', 'NRR', 'CAC'], can_control: ['Budget between functions', 'Hiring plan', 'Pricing', 'Release timing'],
      kpis: ['arr', 'bookings_mtd', 'pipeline_coverage', 'cac', 'nrr', 'open_tickets'],
      blocks: [{ id: 'bookings_trend', w: 8 }, { id: 'alert_feed', w: 4 }, { id: 'pipeline_funnel', w: 4 }, { id: 'cpl_by_channel', w: 4 }, { id: 'ticket_aging', w: 4 }, { id: 'csat_trend', w: 6 }, { id: 'revenue_by_region', w: 6 }],
      alt: { revenue_by_region: 'arr_waterfall', cpl_by_channel: 'cpl_slope' },
      left_off: [{ metric: 'Open ticket table', why: 'Row-level support detail belongs with the support lead; the GM needs the backlog number and the trend.' }, { metric: 'Campaign table', why: 'Spend allocation inside marketing is delegated; CAC is the check.' }] },
    { id: 'ops', title: 'Revenue Operations Analyst', keys: ['revops', 'rev ops', 'revenue operations', 'operations', 'ops analyst', 'analyst', 'bizops', 'business operations', 'ops'], reports_to: 'CFO', accent: 'violet', alerts_focus: ['sales', 'marketing', 'support'],
      day: 'Keeps the funnel definitions honest, reconciles marketing, sales, and support numbers, and builds the reports everyone else argues about.',
      measured_on: ['Data completeness', 'Forecast accuracy', 'Funnel conversion by stage'], can_control: ['Stage definitions', 'Lead routing rules', 'Reporting cadence', 'Tooling'],
      kpis: ['mql_to_sql', 'win_rate', 'sales_cycle', 'cac', 'tickets_per_100', 'nrr'],
      blocks: [{ id: 'pipeline_funnel', w: 4 }, { id: 'leads_by_channel', w: 8 }, { id: 'open_opps', w: 12 }, { id: 'tickets_by_queue', w: 8 }, { id: 'alert_feed', w: 4 }, { id: 'campaigns', w: 12 }],
      alt: { leads_by_channel: 'flow_diagram' },
      left_off: [{ metric: 'CSAT', why: 'A quality metric rather than a process metric; tracked by the support lead.' }] }
  ];

  function match(text) {
    const t = ' ' + (text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ') + ' ';
    let best = null, bestScore = 0;
    for (const a of ARCHETYPES) {
      let score = 0;
      for (const k of a.keys) { if (t.includes(k.trim().length < 3 ? k : k.trim())) score += k.trim().length; }
      if (score > bestScore) { best = a; bestScore = score; }
    }
    return { archetype: best || ARCHETYPES[7], matched: !!best };
  }

  // Data-aware insight text so the fallback still reads like it looked at the numbers.
  function insightFor(a, W, d) {
    const K = C().KPIS, f = (id) => { const r = K[id].compute(W, d); return { v: K[id].format(r.value), p: Math.round(C().pct(r.value, r.prev) * 100) }; };
    const cpc = W.cpcMult[d], spike = d >= W.RELEASE_DAY;
    switch (a.id) {
      case 'sales_rep': case 'sales_manager': { const b = f('bookings_mtd'), c = f('pipeline_coverage'); return 'Bookings are ' + b.v + ' month to date (' + (b.p >= 0 ? '+' : '') + b.p + '% vs the same days last month) with pipeline coverage at ' + c.v + '.' + (cpc > 1.15 ? ' Coverage is thinning because paid lead volume fell after the CPC spike; expect fewer new opportunities for the next three weeks unless marketing rebalances spend.' : ' Lead flow from marketing is steady, so coverage should hold.'); }
      case 'marketing_manager': case 'demand_gen': { const m = f('mqls'), c = f('blended_cpl'); return 'MQLs are ' + m.v + ' over 30 days (' + m.p + '%) and blended CPL is ' + c.v + ' (' + (c.p >= 0 ? '+' : '') + c.p + '%).' + (cpc > 1.15 ? ' Paid search CPC is ' + Math.round((cpc - 1) * 100) + '% above baseline and is the whole story; every other channel is flat or improving, so the fix is a budget shift, not a creative refresh.' : ' No channel is out of line; organic keeps getting cheaper.'); }
      case 'support_agent': case 'support_manager': { const o = f('open_tickets'), s = f('sla_breach'), cs = f('csat'); return o.v + ' tickets are open with an SLA breach rate of ' + s.v + ' and CSAT at ' + cs.v + '.' + (spike ? ' The technical queue is still carrying the v4.2 release spike; the oldest tickets are almost all technical and unassigned, so ownership is the first lever.' : ' Volume is in the normal band and the queue is clearing same day.'); }
      case 'customer_success': { const n = f('nrr'), r = f('churn_risk'); return 'NRR is ' + n.v + ' and ' + r.v + ' accounts are flagged churn-risk.' + (spike ? ' The flags come from technical tickets opened since the release, so the outreach list is the breached-SLA rows in the ticket table below.' : ' Risk flags are at the normal baseline.'); }
      case 'gm_exec': { const ar = f('arr'), b = f('bookings_mtd'), o = f('open_tickets'); return 'ARR is ' + ar.v + ' and bookings are ' + b.v + ' month to date.' + (cpc > 1.15 && spike ? ' Two things are off and they are unrelated: paid acquisition cost jumped (marketing) and the release spiked support load (product). The first will show up in bookings next month; the second is already showing in CSAT and churn risk.' : ' Nothing is off plan this week.'); }
      default: { const w = f('win_rate'), m = f('mql_to_sql'); return 'Win rate is ' + w.v + ' and MQL to SQL conversion is ' + m.v + '. Funnel definitions are stable across the period; the visible changes are volume, not conversion.'; }
    }
  }

  function plan(text, W, d) {
    const { archetype: a, matched } = match(text);
    return {
      source: 'fallback',
      matched,
      role_card: { title: a.title, reports_to: a.reports_to, day_looks_like: a.day, measured_on: a.measured_on, can_control: a.can_control, request: text },
      accent: a.accent,
      kpis: a.kpis.slice(),
      blocks: a.blocks.map(b => ({ id: b.id, w: b.w })),
      alt: Object.assign({}, a.alt),
      insight: insightFor(a, W, d),
      left_off: a.left_off.slice(),
      alerts_focus: a.alerts_focus.slice()
    };
  }

  // Validate and repair an LLM reply so the renderer never sees an unknown id.
  function sanitize(p, text, W, d) {
    const K = C().KPIS, B = C().BLOCKS;
    const fb = plan(text, W, d);
    if (!p || typeof p !== 'object') return fb;
    const out = Object.assign({}, fb, p, { source: 'llm' });
    out.kpis = (Array.isArray(p.kpis) ? p.kpis : []).filter(id => K[id]).slice(0, 6);
    if (out.kpis.length < 3) out.kpis = fb.kpis;
    out.blocks = (Array.isArray(p.blocks) ? p.blocks : []).filter(b => b && B[b.id]).map(b => ({ id: b.id, w: [4, 6, 8, 12].includes(+b.w) ? +b.w : B[b.id].w }));
    if (!out.blocks.length) out.blocks = fb.blocks;
    if (!out.blocks.some(b => B[b.id].kind === 'table')) out.blocks.push({ id: 'open_tickets', w: 12 });
    out.role_card = Object.assign({}, fb.role_card, p.role_card || {}, { request: text });
    if (!['blue', 'orange', 'aqua', 'violet'].includes(out.accent)) out.accent = fb.accent;
    if (typeof out.insight !== 'string' || !out.insight.trim()) out.insight = fb.insight;
    if (!Array.isArray(out.left_off)) out.left_off = fb.left_off;
    if (!Array.isArray(out.alerts_focus) || !out.alerts_focus.length) out.alerts_focus = fb.alerts_focus;
    out.alt = fb.alt;
    return out;
  }

  // The prompt the agent sends. Data digest is included so the model writes insight from real numbers.
  function buildPrompt(text, W, d) {
    const K = C().KPIS, B = C().BLOCKS;
    const kpiList = Object.keys(K).map(id => id + ' (' + K[id].label + ', ' + K[id].domain + ')').join('; ');
    const blockList = Object.keys(B).map(id => id + ' (' + B[id].kind + ': ' + B[id].title + ', default w=' + B[id].w + ')').join('; ');
    const digest = C().digest(W, d);
    return [
      'You are a dashboard-building agent. You will be given one request describing a business employee. Build the dashboard that person needs by choosing from a fixed catalog. You never invent numbers; a deterministic engine supplies every value. Your job is the lens: which metrics, which blocks, in what order, and what the data means for this role.',
      '',
      'Company data digest (as of ' + digest.company.as_of + '):',
      JSON.stringify(digest, null, 1),
      '',
      'KPI catalog (choose 4 to 6 by id): ' + kpiList,
      '',
      'Block catalog (choose 4 to 8 by id; w is grid width out of 12; at least one table block is required and every table is filterable and sortable per column): ' + blockList,
      '',
      'Rules: pick only ids from the catalogs. Put the block that answers the role\'s first question of the day first. Include alert_feed for any manager. Write insight as two sentences that cite specific numbers from the digest. left_off lists two or three catalog metrics you deliberately excluded and why, in one sentence each. accent is one of blue, orange, aqua, violet.',
      '',
      'Request: "' + text.replace(/"/g, '\'') + '"',
      '',
      'Reply with JSON only, matching exactly this shape:',
      '{"role_card":{"title":"","reports_to":"","day_looks_like":"","measured_on":["",""],"can_control":["",""]},"accent":"blue","kpis":["id"],"blocks":[{"id":"","w":8}],"insight":"","left_off":[{"metric":"","why":""}],"alerts_focus":["sales"]}'
    ].join('\n');
  }

  window.Planner = { ARCHETYPES, match, plan, sanitize, buildPrompt };
})();
