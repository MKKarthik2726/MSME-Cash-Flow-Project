

function () {
    'use strict';

    /* ---------------------------------------------------------------
       3.1 CONFIG — all API URLs live here (relative URLs).
       Only the three routes named in the project guide are filled in.
       Routes the guide does NOT name are null; the UI then says
       "not connected yet" instead of guessing a URL.
       --------------------------------------------------------------- */
    const CONFIG = {
    api: {
    upload: '/api/statements/upload',                 // POST multipart, field name "file"
    dashboard: function (id) { return '/api/dashboard/' + encodeURIComponent(id); }, // GET
    simulation: '/api/simulation',                    // POST JSON {statementId, customerName, delayDays, paymentAmount}
    forecast: function (id) { return '/api/forecast/' + encodeURIComponent(id); },        // GET
    stress: function (id) { return '/api/stress/' + encodeURIComponent(id); },            // GET
    recommendations: function (id) { return '/api/recommendations/' + encodeURIComponent(id); }, // GET
    deleteData: function (id) { return '/api/statements/' + encodeURIComponent(id); },    // DELETE
    businessDetails: '/api/business-details',         // POST JSON
    login: '/api/auth/login',                         // POST JSON {email, password}
    register: '/api/auth/register'                    // POST JSON {name, businessName, email, password}
},
    UPLOAD_FIELD: 'file',        // multipart field name: CONFIRM against StatementController
    MAX_FILE_BYTES: 10 * 1024 * 1024 // friendly front-end limit only; the server decides
};

    /* ---------------------------------------------------------------
       3.2 State (in memory only; only the login accounts/session use browser storage)
       --------------------------------------------------------------- */
    const state = {
    statementId: null,
    filename: null,
    uploadedAt: null,
    upload: null,        // raw upload response
    dashboard: null,     // raw dashboard response
    forecast: null,
    stress: null,
    recommendations: null,
    business: null,      // optional details typed by the user
    selectedFile: null,
    loading: false
};
    const charts = {};

    /* ---------------------------------------------------------------
       3.3 Small helpers
       --------------------------------------------------------------- */
    const $ = function (id) { return document.getElementById(id); };

    function h(tag, props) {
    const el = document.createElement(tag);
    const p = props || {};
    Object.keys(p).forEach(function (k) {
    const v = p[k];
    if (v === false || v == null) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
});
    for (let i = 2; i < arguments.length; i++) appendKids(el, arguments[i]);
    return el;
}
    function appendKids(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { appendKids(el, k); }); return; }
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
}
    function clear(el) { el.replaceChildren(); return el; }

    // First defined, non-null value among candidate keys.
    function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (v !== undefined && v !== null) return v;
}
    return undefined;
}
    function num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
    // Whole rupees show without ".00" (₹1,25,000); paise appear only when present.
    const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
    function money(v) { const n = num(v); return n === null ? '—' : inr.format(n); }
    // Short axis labels in the units Indian owners use: ₹50K, ₹2.5L, ₹1.2Cr
    function compactINR(v) {
    const n = Number(v), a = Math.abs(n), sign = n < 0 ? '-' : '';
    const t = function (x) { return String(Math.round(x * 10) / 10); };
    if (a >= 1e7) return sign + '₹' + t(a / 1e7) + 'Cr';
    if (a >= 1e5) return sign + '₹' + t(a / 1e5) + 'L';
    if (a >= 1e3) return sign + '₹' + t(a / 1e3) + 'K';
    return sign + '₹' + t(a);
}
    function plainNum(v) { const n = num(v); return n === null ? '—' : new Intl.NumberFormat('en-IN').format(n); }
    function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
    function fmtDateTime(v) {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
    function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}
    function asArray(v) { return Array.isArray(v) ? v : []; }
    function levelClass(level) {
    const l = String(level || '').toUpperCase();
    return l === 'LOW' ? 'b-low' : l === 'MEDIUM' ? 'b-medium' : l === 'HIGH' ? 'b-high' : 'b-na';
}
    // Stress level from the guide's score ranges (used only to validate/label a score the server sent).
    function levelFromScore(score) {
    const s = num(score);
    if (s === null) return null;
    return s >= 70 ? 'LOW' : s >= 40 ? 'MEDIUM' : 'HIGH';
}

    function toast(msg, kind) {
    const t = h('div', { class: 'toast ' + (kind || ''), text: msg });
    $('toasts').append(t);
    setTimeout(function () { t.remove(); }, kind === 'bad' ? 7000 : 4500);
}
    /* ----- SVG helpers (built with createElementNS, never innerHTML) ----- */
    const SVGNS = 'http://www.w3.org/2000/svg';
    function svg(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    const p = attrs || {};
    Object.keys(p).forEach(function (k) { if (p[k] !== null && p[k] !== undefined && p[k] !== false) el.setAttribute(k, p[k]); });
    for (let i = 2; i < arguments.length; i++) appendKids(el, arguments[i]);
    return el;
}
    const ICONS = {
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    cashflow: 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4',
    forecast: 'M3 17l6-6 4 4 8-9M15 6h6v6',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
    clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 7v5l3 2',
    check: 'M5 12l4 4 10-10',
    database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
    wallet: 'M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7l12-3v3M16 14h3',
    down: 'M12 5v14M6 13l6 6 6-6',
    up: 'M12 19V5M6 11l6-6 6 6',
    alert: 'M12 3l10 18H2L12 3zM12 10v5M12 18h.01',
    file: 'M6 3h8l4 4v14H6zM14 3v4h4',
    target: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 12h.01',
    refresh: 'M20 11a8 8 0 1 0-2 6M20 5v6h-6'
};
    function icon(name, size) {
    const s = size || 18;
    return svg('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: ICONS[name] || ICONS.file }));
}
    // Tiny trend line. Only drawn from real values the server sent (needs 2+ points).
    function spark(values, color) {
    const v = values.filter(function (x) { return x !== null && x !== undefined; });
    if (v.length < 2) return null;
    const w = 120, ht = 32;
    const min = Math.min.apply(null, v), max = Math.max.apply(null, v), rng = max - min || 1;
    const pts = v.map(function (y, i) { return [(i / (v.length - 1)) * w, ht - 4 - ((y - min) / rng) * (ht - 10)]; });
    const line = pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    const area = 'M0,' + ht + ' L' + line.replace(/ /g, ' L') + ' L' + w + ',' + ht + ' Z';
    return svg('svg', { class: 'spark', viewBox: '0 0 ' + w + ' ' + ht, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    svg('path', { d: area, fill: color, opacity: '.14' }),
    svg('polyline', { points: line, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
}
    // Decorative placeholder picture for empty states. It shows no data.
    function emptyArt() {
    return svg('svg', { class: 'empty-art', viewBox: '0 0 120 80', 'aria-hidden': 'true' },
    svg('rect', { x: 10, y: 10, width: 100, height: 60, rx: 9, fill: '#eef3fa', stroke: '#c9d6e8' }),
    svg('rect', { x: 24, y: 44, width: 12, height: 16, rx: 3, fill: '#d3deee' }),
    svg('rect', { x: 44, y: 34, width: 12, height: 26, rx: 3, fill: '#bccde6' }),
    svg('rect', { x: 64, y: 48, width: 12, height: 12, rx: 3, fill: '#d3deee' }),
    svg('rect', { x: 84, y: 28, width: 12, height: 32, rx: 3, fill: '#bccde6' }),
    svg('path', { d: 'M22 34 L46 24 L68 36 L96 18', fill: 'none', stroke: '#0f766e', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '2 6' }));
}
    function emptyState(title, text) {
    return h('div', { class: 'empty' }, emptyArt(), h('strong', { text: title }), text ? h('div', { text: text }) : null);
}
    function notConnected(what) {
    return emptyState('Not available yet', what);
}
    function loadingLine(text) {
    return h('div', { class: 'loading-line' }, h('span', { class: 'spinner dark' }), text);
}
    function notice(kind, text) {
    return h('div', { class: 'notice n-' + kind, role: kind === 'bad' ? 'alert' : null }, text);
}

    /* ---------------------------------------------------------------
       3.4 API layer — never throws; always returns {ok,status,data,error,notConnected}
       --------------------------------------------------------------- */
    async function apiFetch(url, options) {
    if (!url) return { ok: false, status: 0, data: null, error: 'API route not configured', notConnected: true };
    let res;
    try {
    res = await fetch(url, options);
} catch (e) {
    return { ok: false, status: 0, data: null, error: 'Cannot reach the server. Check that the application is running and try again.', network: true };
}
    let text = '';
    try { text = await res.text(); } catch (e) { text = ''; }
    let data = null;
    let badJson = false;
    if (text.trim()) {
    try { data = JSON.parse(text); } catch (e) { badJson = true; }
}
    if (!res.ok) {
    if (res.status === 401 && url.indexOf('/api/auth/') === -1 && auth && auth.user) {
    try { leaveApp(); } catch (e) { /* ignore */ }
    try { authMessage('bad', 'Your session has ended. Please login again.'); } catch (e) { /* ignore */ }
}
    const msg = data && typeof data === 'object' ? pick(data, ['message', 'error', 'detail']) : null;
    return {
    ok: false, status: res.status, data: data,
    error: msg ? String(msg) : 'The server returned an error (HTTP ' + res.status + ').',
    notConnected: res.status === 404 || res.status === 405
};
}
    if (badJson) return { ok: false, status: res.status, data: null, error: 'The server sent a reply this page could not read.' };
    if (data === null) return { ok: true, status: res.status, data: null, empty: true };
    return { ok: true, status: res.status, data: data };
}

    /* ---------------------------------------------------------------
       3.5 Navigation
       --------------------------------------------------------------- */
    const TITLES = {
    overview: 'Overview', upload: 'Upload Statement', business: 'Business Details', cashflow: 'Cash Flow', forecast: '30-Day Forecast',
    stress: 'Cash Stress', simulation: 'What-If Simulation', recommendations: 'Recommendations', data: 'Data Management'
};
    function showSection(name) {
    if (!TITLES[name]) name = 'overview';
    document.querySelectorAll('[data-section]').forEach(function (s) { s.hidden = s.dataset.section !== name; });
    document.querySelectorAll('#nav button').forEach(function (b) {
    if (b.dataset.target === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
});
    $('pageTitle').textContent = TITLES[name];
    document.title = TITLES[name] + ' · MSME CashFlow Guard';
    closeMenu();
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    window.scrollTo(0, 0);
    // Charts drawn while hidden can have zero size; resize after showing.
    Object.keys(charts).forEach(function (k) { try { charts[k].resize(); } catch (e) { /* ignore */ } });
}
    function openMenu() { document.body.classList.add('nav-open'); $('menuToggle').setAttribute('aria-expanded', 'true'); }
    function closeMenu() { document.body.classList.remove('nav-open'); $('menuToggle').setAttribute('aria-expanded', 'false'); }

    /* ---------------------------------------------------------------
       3.6 Charts (safe create / replace; friendly fallback if Chart.js is missing)
       --------------------------------------------------------------- */
    function chartReady() { return typeof window.Chart === 'function'; }
    function drawChart(host, key, config, label) {
    clear(host);
    if (charts[key]) { try { charts[key].destroy(); } catch (e) { /* ignore */ } delete charts[key]; }
    if (!chartReady()) {
    host.append(notice('warn', 'The chart library could not be loaded (check your internet connection). The numbers on this page are still available.'));
    return;
}
    try {
    window.Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    window.Chart.defaults.color = '#566579';
    window.Chart.defaults.plugins.legend.labels.usePointStyle = true;
    window.Chart.defaults.plugins.legend.labels.boxWidth = 8;
} catch (e) { /* defaults are optional */ }
    const box = h('div', { class: 'chart-box' });
    const canvas = h('canvas', { role: 'img', 'aria-label': label });
    box.append(canvas);
    host.append(box);
    try {
    charts[key] = new window.Chart(canvas, config);
} catch (e) {
    clear(host).append(notice('warn', 'This chart could not be drawn.'));
}
}
    const PALETTE = ['#0f766e', '#1d4ed8', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#475569'];
    function drawDoughnut(host, key, labels, values, colors, label, fmt) {
    const total = values.reduce(function (a, b) { return a + (num(b) || 0); }, 0);
    if (!(total > 0)) { clear(host).append(emptyState('Nothing to chart', 'All values are zero.')); return; }
    drawChart(host, key, {
    type: 'doughnut',
    data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 3, hoverOffset: 8 }] },
    options: {
    responsive: true, maintainAspectRatio: false, cutout: '66%',
    plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { return ' ' + c.label + ': ' + (fmt ? fmt(c.parsed) : c.parsed); } } } }
}
}, label);
}
    function chartBase(extra) {
    return Object.assign({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
    legend: {
    position: 'bottom',
    labels: {
    // Solid legend swatches even when a line uses a translucent area fill
    generateLabels: function (chart) {
    const base = window.Chart.defaults.plugins.legend.labels.generateLabels(chart);
    if (chart.config.type === 'line') {
    base.forEach(function (l) { const ds = chart.data.datasets[l.datasetIndex]; if (ds && ds.borderColor) l.fillStyle = ds.borderColor; });
}
    return base;
}
}
},
    tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + money(c.parsed.y); } } }
},
    scales: {
    x: { ticks: { maxTicksLimit: 8, maxRotation: 0, autoSkip: true } },
    y: { ticks: { callback: compactINR } }
}
}, extra || {});
}

    /* ---------------------------------------------------------------
       3.7 Data extraction (tolerant of missing fields; field-name
       candidates are ASSUMPTIONS until the real DTOs are confirmed)
       --------------------------------------------------------------- */
    function summary() { return state.dashboard || {}; }
    function getMonthly() {
    return asArray(pick(summary(), ['monthlyTotals', 'monthlyCashFlow', 'monthly', 'monthlySummary'])).map(function (m) {
    return {
    label: String(pick(m, ['month', 'period', 'label', 'name']) || ''),
    inflow: num(pick(m, ['inflow', 'totalInflow', 'inflows', 'totalInflows', 'credit'])),
    outflow: num(pick(m, ['outflow', 'totalOutflow', 'outflows', 'totalOutflows', 'debit']))
};
});
}
    function getForecast() {
    const f = state.forecast || pick(summary(), ['forecast']);
    if (!f || typeof f !== 'object') return null;
    const days = asArray(pick(f, ['days', 'forecastDays', 'dailyForecast', 'dailyBalances'])).map(function (d) {
    return {
    date: pick(d, ['date', 'day']),
    conservative: num(pick(d, ['conservativeBalance', 'conservative'])),
    expected: num(pick(d, ['expectedBalance', 'projectedBalance', 'expected', 'balance'])),
    optimistic: num(pick(d, ['optimisticBalance', 'optimistic'])),
    risk: !!pick(d, ['shortageRisk', 'shortageRiskDay', 'isShortageRisk', 'atRisk'])
};
});
    return {
    days: days,
    confidence: pick(f, ['confidence', 'forecastConfidence']),
    assumptions: asArray(pick(f, ['assumptions', 'risks', 'explanations'])),
    shortage: pick(f, ['shortageRiskDays', 'shortageDays'])
};
}
    function getStress() {
    const s = state.stress || pick(summary(), ['stress', 'stressResult', 'cashStress']);
    return s && typeof s === 'object' ? s : null;
}
    function getRecos() {
    const r = state.recommendations || pick(summary(), ['recommendations']);
    return asArray(Array.isArray(r) ? r : pick(r, ['recommendations', 'items']));
}
    function getRecurring() { return asArray(pick(summary(), ['recurringTransactions', 'upcomingRecurring', 'recurring'])); }
    function getCustomers() {
    const names = [];
    function add(n) { if (n && names.indexOf(String(n)) === -1) names.push(String(n)); }
    asArray(pick(summary(), ['topCustomerInflows', 'topCustomers', 'customers'])).forEach(function (c) {
    add(typeof c === 'string' ? c : pick(c, ['customerName', 'customer', 'name', 'description']));
});
    asArray(pick(state.upload, ['customers', 'customerNames'])).forEach(function (c) {
    add(typeof c === 'string' ? c : pick(c, ['customerName', 'name']));
});
    return names;
}

    /* ---------------------------------------------------------------
       3.8 Renderers
       --------------------------------------------------------------- */
    function renderHeaderStatus() {
    const el = $('dataStatus');
    el.classList.toggle('live', state.statementId !== null || !!state.upload);
    if (state.statementId === null && !state.upload) { el.textContent = 'Data status: no statement uploaded'; return; }
    el.textContent = 'Data status: ' + (state.filename ? state.filename : 'statement loaded') +
    (state.uploadedAt ? ' · uploaded ' + fmtDateTime(state.uploadedAt) : '');
}

    // opt: { icon, accent (colour), spark (svg node) }
    function kpi(label, value, note, opt) {
    const o = opt || {};
    const accent = o.accent ? '--accent:' + o.accent : null;
    return h('div', { class: 'card kpi', style: accent },
    h('div', { class: 'kpi-top' }, h('div', { class: 'label', text: label }),
    o.icon ? h('span', { class: 'ico-chip', style: accent }, icon(o.icon, 18)) : null),
    h('div', { class: 'value mono' + (typeof value === 'string' && value.length > 14 ? ' small' : '') }, value),
    note ? h('div', { class: 'note', text: note }) : null,
    o.spark || null);
}
    function stressBadge(level) {
    return h('span', { class: 'badge ' + levelClass(level), text: level ? String(level).toUpperCase() : 'Not available yet' });
}


    /* ---------------------------------------------------------------
       3.8a Transaction classification + data freshness
       --------------------------------------------------------------- */
    const CAT_RULES = [
    ['Salary / Payroll', /salary|payroll|wages|stipend/i],
    ['Rent / Lease', /\brent\b|lease/i],
    ['EMI / Loan', /\bemi\b|loan|instal|nach/i],
    ['Utilities', /electric|\beb\b|tneb|water|gas bill|internet|broadband|airtel|jio|vodafone|\bvi\b|bsnl|recharge/i],
    ['GST / Tax', /\bgst|\btax\b|\btds\b|income tax|challan/i],
    ['Supplier / Purchase', /purchase|supplier|vendor|raw material|stock|inventory|traders|wholesale/i],
    ['Bank charges', /charge|\bfee\b|commission|penalty|interest debit/i],
    ['Insurance', /insurance|lic\b|premium/i]
    ];
    function getTx() {
    const a = asArray(pick(state.upload, ['preview', 'transactionPreview', 'transactions']));
    return a.length ? a : asArray(pick(summary(), ['transactions', 'transactionPreview']));
}
    function classifyTx(t) {
    const serverCat = pick(t, ['category', 'transactionCategory']);
    if (serverCat) return { name: String(serverCat), est: false };
    const desc = String(pick(t, ['description']) || '');
    const cr = num(pick(t, ['credit'])), db = num(pick(t, ['debit']));
    // Money coming in is a customer payment; the keyword rules below are for money going out.
    if (cr !== null && cr > 0 && !(db > 0)) return { name: 'Customer payment', est: true };
    for (let i = 0; i < CAT_RULES.length; i++) { if (CAT_RULES[i][1].test(desc)) return { name: CAT_RULES[i][0], est: true }; }
    return { name: 'Other', est: true };
}
    function catPill(c) { return h('span', { class: 'cat-pill' + (c.est ? ' est' : ''), text: c.name, title: c.est ? 'Estimated in the browser from the description' : 'Category from the server' }); }

    function renderClassification(host) {
    clear(host);
    const tx = getTx();
    if (!tx.length) { host.append(emptyState('No transactions to classify yet', 'Upload a statement and every transaction will be grouped into categories here.')); return; }
    const groups = {};
    let estimated = false;
    tx.forEach(function (t) {
    const c = classifyTx(t); if (c.est) estimated = true;
    const amt = (num(pick(t, ['debit'])) || 0) + (num(pick(t, ['credit'])) || 0);
    const g = groups[c.name] || (groups[c.name] = { name: c.name, count: 0, amount: 0 });
    g.count += 1; g.amount += amt;
});
    const list = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.amount - a.amount; });
    const chartHost = h('div', { style: 'margin-bottom:14px' });
    host.append(chartHost);
    drawDoughnut(chartHost, 'classDonut', list.map(function (g) { return g.name; }), list.map(function (g) { return g.amount; }),
    list.map(function (_, i) { return PALETTE[i % PALETTE.length]; }), 'Doughnut chart of transaction categories', money);
    const tbody = h('tbody');
    list.forEach(function (g, i) {
    tbody.append(h('tr', null,
    h('td', null, h('span', { class: 'dot', style: 'background:' + PALETTE[i % PALETTE.length] + ';margin-right:8px' }), g.name),
    h('td', { class: 'num mono', text: String(g.count) }),
    h('td', { class: 'num mono', text: money(g.amount) })));
});
    host.append(h('div', { class: 'table-wrap' }, h('table', null,
    h('thead', null, h('tr', null, h('th', { text: 'Category' }), h('th', { class: 'num', text: 'Transactions' }), h('th', { class: 'num', text: 'Amount' }))), tbody)));
    host.append(h('p', { class: 'sub', style: 'margin-top:8px', text: 'Based on the ' + tx.length + ' transactions the server returned in the preview.' + (estimated ? ' Grey labels are estimated in the browser from the description, because the server did not send a category for them.' : '') }));
}

    function renderRecurringList(host, rec) {
    clear(host);
    if (!rec.length) { host.append(emptyState('Nothing to show', 'Recurring salary, rent and EMI payments appear here once the server detects them.')); return; }
    const ul = h('ul', { class: 'list' });
    rec.slice(0, 12).forEach(function (r) {
    const freq = pick(r, ['frequency', 'period']);
    ul.append(h('li', null,
    h('span', null, h('strong', { text: String(pick(r, ['description', 'name']) || 'Payment') }),
    h('div', { class: 'sub', text: (pick(r, ['category']) || '') + (freq ? ' · ' + freq : '') + ' · expected ' + fmtDate(pick(r, ['expectedDate', 'nextDate'])) })),
    h('span', { class: 'mono', text: money(pick(r, ['averageAmount', 'amount'])) })));
});
    host.append(ul);
}

    // Freshness: newest transaction date if the server sent one (or the newest date in the preview), else the upload time.
    function getFreshness() {
    let latest = pick(summary(), ['latestTransactionDate', 'lastTransactionDate', 'dataEndDate', 'endDate']) || pick(state.upload, ['latestTransactionDate', 'lastTransactionDate', 'dataEndDate', 'endDate']);
    let basis = 'latest transaction in your statement';
    if (!latest) {
    const dates = getTx().map(function (t) { const d = new Date(pick(t, ['date', 'transactionDate'])); return isNaN(d) ? null : d; }).filter(Boolean);
    if (dates.length) { latest = new Date(Math.max.apply(null, dates)); basis = 'newest transaction in the preview'; }
}
    if (!latest && state.uploadedAt) { latest = state.uploadedAt; basis = 'upload time (no transaction dates were returned)'; }
    if (!latest) return null;
    const d = new Date(latest); if (isNaN(d)) return null;
    const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
    const level = days <= 7 ? { t: 'Fresh', c: 'b-ok' } : days <= 30 ? { t: 'Ageing', c: 'b-warn' } : { t: 'Stale', c: 'b-bad' };
    return { date: d, days: days, level: level, basis: basis };
}
    function renderFreshness(host) {
    clear(host);
    const f = getFreshness();
    if (!f) { host.append(emptyState('No freshness information yet', 'Upload a statement to see how recent your data is.')); return; }
    host.append(h('div', { class: 'grid g-3' },
    kpi('Data as of', fmtDate(f.date), 'Based on the ' + f.basis, { icon: 'clock', accent: '#1d4ed8' }),
    kpi('Data age', f.days + (f.days === 1 ? ' day' : ' days') + ' old', null, { icon: 'clock', accent: '#0f766e' }),
    kpi('Freshness', h('span', { class: 'badge ' + f.level.c, text: f.level.t.toUpperCase() }), 'Fresh ≤ 7 days · Ageing ≤ 30 · Stale > 30', { icon: 'check', accent: f.level.t === 'Fresh' ? '#15803d' : f.level.t === 'Ageing' ? '#d97706' : '#b91c1c' })));
    if (f.level.t !== 'Fresh') host.append(notice(f.level.t === 'Stale' ? 'bad' : 'warn', 'Forecasts are less reliable when the statement is old. Upload a newer statement for a better estimate.'));
}

    function renderOverview() {
    const s = summary();
    const stress = getStress();
    const fc = getForecast();
    const stressLevel = stress ? (pick(stress, ['stressLevel', 'level']) || levelFromScore(pick(stress, ['score', 'stressScore']))) : null;
    const grid = clear($('kpiGrid'));
    // Sparklines use only monthly values the server returned (2+ months needed).
    const mo = getMonthly();
    const inSeries = mo.map(function (m) { return m.inflow; });
    const outSeries = mo.map(function (m) { return m.outflow; });
    const netSeries = mo.map(function (m) { return m.inflow !== null && m.outflow !== null ? m.inflow - m.outflow : null; });
    const lvl = String(stressLevel || '').toUpperCase();
    grid.append(
    kpi('Latest balance', money(pick(s, ['latestBalance', 'currentBalance', 'closingBalance'])), null, { icon: 'wallet', accent: '#1d4ed8' }),
    kpi('Total inflows', money(pick(s, ['totalInflows', 'totalInflow'])), 'Money received', { icon: 'down', accent: '#0f766e', spark: spark(inSeries, '#0f766e') }),
    kpi('Total outflows', money(pick(s, ['totalOutflows', 'totalOutflow'])), 'Money paid out', { icon: 'up', accent: '#d97706', spark: spark(outSeries, '#d97706') }),
    kpi('Net cash flow', money(pick(s, ['netCashFlow', 'netCashflow'])), 'Inflows minus outflows', { icon: 'forecast', accent: '#13315c', spark: spark(netSeries, '#13315c') }),
    kpi('Cash-stress level', stressBadge(stressLevel), null, { icon: 'shield', accent: lvl === 'LOW' ? '#15803d' : lvl === 'MEDIUM' ? '#d97706' : lvl === 'HIGH' ? '#b91c1c' : '#94a3b8' }),
    kpi('Forecast confidence', fc && fc.confidence !== undefined ? formatConfidence(fc.confidence) : 'Not available yet', null, { icon: 'target', accent: '#7c3aed' }),
    (function () { const f = getFreshness(); return kpi('Data freshness', f ? h('span', { class: 'badge ' + f.level.c, text: f.level.t.toUpperCase() }) : 'Not available yet', f ? 'Data is ' + f.days + (f.days === 1 ? ' day' : ' days') + ' old' : null, { icon: 'clock', accent: '#0891b2' }); })()
    );

    // Shortage-risk warning
    const alertHost = clear($('overviewAlert'));
    const sc = shortageCount(fc);
    if (sc !== null && sc > 0) {
    alertHost.append(notice('warn', '⚠ Possible cash shortage: the forecast shows ' + sc + ' day' + (sc === 1 ? '' : 's') + ' where your balance may run low. This is an estimate, not a guarantee.'));
}

    // Charts
    const monthly = getMonthly();
    if (monthly.length) drawHistorical($('histChartHost'), 'hist', monthly);
    else clear($('histChartHost')).append(emptyState('No cash-flow history yet', 'Upload a bank statement to see monthly inflows and outflows.'));
    renderForecastChart($('fcOverviewHost'), 'fcOverview', fc);
    renderHero();
    renderFlowDonut($('flowDonutHost'));
    renderRiskStrip($('riskStripOverview'), fc);

    // Recent transactions (from upload preview)
    renderTransactions($('recentTxHost'));
    renderQuality($('qualityOverview'));

    // Recurring
    const rec = getRecurring();
    renderRecurringList($('recurringHost'), rec);
}

    /* ----- Hero / welcome banner ----- */
    function heroArt() {
    // Decorative illustration only. It contains no financial figures.
    return svg('svg', { viewBox: '0 0 360 230', 'aria-hidden': 'true', focusable: 'false' },
    svg('rect', { x: 20, y: 24, width: 250, height: 160, rx: 16, fill: '#ffffff', opacity: '.96' }),
    svg('rect', { x: 38, y: 44, width: 90, height: 10, rx: 5, fill: '#cbd7ea' }),
    svg('rect', { x: 38, y: 62, width: 56, height: 8, rx: 4, fill: '#e1e9f4' }),
    svg('rect', { x: 44, y: 128, width: 24, height: 38, rx: 6, fill: '#b9d9d5' }),
    svg('rect', { x: 78, y: 108, width: 24, height: 58, rx: 6, fill: '#7fc3bb' }),
    svg('rect', { x: 112, y: 120, width: 24, height: 46, rx: 6, fill: '#b9d9d5' }),
    svg('rect', { x: 146, y: 94, width: 24, height: 72, rx: 6, fill: '#0f766e' }),
    svg('rect', { x: 180, y: 112, width: 24, height: 54, rx: 6, fill: '#7fc3bb' }),
    svg('rect', { x: 214, y: 84, width: 24, height: 82, rx: 6, fill: '#0f766e' }),
    svg('path', { d: 'M40 112 C80 80 110 104 148 76 S214 70 250 50', fill: 'none', stroke: '#1d4ed8', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    svg('circle', { cx: 250, cy: 50, r: 7, fill: '#1d4ed8', stroke: '#fff', 'stroke-width': 3 }),
    svg('circle', { cx: 300, cy: 150, r: 46, fill: '#14b8a6' }),
    svg('circle', { cx: 300, cy: 150, r: 34, fill: 'none', stroke: '#ffffff', 'stroke-width': 3, opacity: '.7' }),
    svg('text', { x: 300, y: 164, 'text-anchor': 'middle', 'font-size': 40, 'font-weight': 800, fill: '#ffffff' }, '₹'),
    svg('path', { d: 'M278 40 l22 -10 l22 10 v22 c0 14 -10 24 -22 30 c-12 -6 -22 -16 -22 -30 z', fill: '#ffffff', opacity: '.92' }),
    svg('path', { d: 'M290 62 l8 8 l14 -16', fill: 'none', stroke: '#0f766e', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}
    function renderHero() {
    const host = clear($('heroHost'));
    if (state.statementId !== null || state.upload) {
    host.append(h('div', { class: 'card welcome' },
    h('span', { class: 'ico-chip', style: '--accent:#0f766e' }, icon('file', 18)),
    h('div', null, h('strong', { text: 'Statement loaded: ' + (state.filename || 'uploaded file') }),
    h('div', { class: 'sub', text: state.uploadedAt ? 'Uploaded ' + fmtDateTime(state.uploadedAt) : 'Upload time not reported by the server' })),
    h('button', { type: 'button', class: 'btn secondary', onclick: function () { showSection('upload'); } }, 'Upload a newer statement')));
    return;
}
    const steps = [
    ['1', 'Upload', 'Add your bank statement as a CSV file.'],
    ['2', 'Review', 'Check the data-quality report for problems.'],
    ['3', 'Plan ahead', 'See your 30-day outlook, stress level and what-if results.']
    ];
    host.append(h('div', { class: 'hero' },
    h('div', { class: 'hero-text' },
    h('span', { class: 'eyebrow', text: 'Cash-flow monitoring for Indian MSMEs' }),
    h('p', { class: 'hero-title', text: 'Spot cash problems before they reach you' }),
    h('p', { class: 'lead', text: 'Upload a bank statement to see your cash position, a 30-day outlook, and what a late customer payment could do to your balance.' }),
    h('div', { class: 'row' },
    h('button', { type: 'button', class: 'btn light', onclick: function () { showSection('upload'); } }, 'Upload bank statement'),
    h('button', { type: 'button', class: 'btn ghost', onclick: downloadTemplate }, 'Download CSV template'))),
    h('div', { class: 'hero-art' }, heroArt()),
    h('ol', { class: 'steps' }, steps.map(function (s) {
    return h('li', null, h('span', { class: 'num', text: s[0] }), h('div', null, h('strong', { text: s[1] }), h('small', { text: s[2] })));
}))));
}
    function downloadTemplate() {
    // Header row only: no data. Lets users see the expected column layout.
    const blob = new Blob(['date,description,debit,credit,balance\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'cashflow-statement-template.csv' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

    /* ----- Inflow vs outflow doughnut (real totals only) ----- */
    function renderFlowDonut(host) {
    const s = summary();
    const inn = num(pick(s, ['totalInflows', 'totalInflow']));
    const out = num(pick(s, ['totalOutflows', 'totalOutflow']));
    if (inn === null || out === null) { clear(host).append(emptyState('No totals yet', 'Upload a statement to compare money in and money out.')); return; }
    drawDoughnut(host, 'flow', ['Inflows', 'Outflows'], [inn, out], ['#0f766e', '#1d4ed8'], 'Doughnut chart comparing total inflows and outflows', money);
    if (inn + out > 0) {
    host.append(h('ul', { class: 'list', style: 'margin-top:12px' },
    h('li', null, h('span', null, h('span', { class: 'dot teal', style: 'margin-right:8px' }), 'Inflows'), h('strong', { class: 'mono', text: money(inn) })),
    h('li', null, h('span', null, h('span', { class: 'dot', style: 'background:#1d4ed8;margin-right:8px' }), 'Outflows'), h('strong', { class: 'mono', text: money(out) }))));
}
}

    /* ----- 30-day risk calendar (one block per forecast day, from server data) ----- */
    function renderRiskStrip(host, fc) {
    clear(host);
    if (!fc || !fc.days.length) {
    host.append(emptyState('Forecast not available yet', 'When the server returns a forecast, each of the next 30 days appears here as a coloured block.'));
    return;
}
    const strip = h('div', { class: 'strip', role: 'list', 'aria-label': 'Forecast days. Red means a possible shortage is flagged.' });
    fc.days.forEach(function (d, i) {
    const label = fmtDate(d.date) + (d.expected !== null ? ' · ' + money(d.expected) : '') + (d.risk ? ' · shortage risk' : '');
    strip.append(h('span', { class: 'cell' + (d.risk ? ' risk' : ''), role: 'listitem', title: label, 'aria-label': label }, String(i + 1)));
});
    host.append(strip,
    h('div', { class: 'legend-row' }, h('span', { class: 'dot ok' }), 'No risk flagged', h('span', { class: 'dot bad', style: 'margin-left:10px' }), 'Shortage risk'),
    h('p', { class: 'sub', text: 'Estimate only. Numbers count days from the start of the forecast.' }));
    // Summary built from the same server-flagged days
    const flagged = fc.days.filter(function (d) { return d.risk; });
    const total = fc.days.length;
    const sum = h('div', { class: 'strip-summary' + (flagged.length ? '' : ' ok') },
    h('div', { class: 'big mono', text: flagged.length + ' of ' + total }),
    h('div', { class: 'sub', text: flagged.length === 1 ? 'day flagged for possible shortage' : 'days flagged for possible shortage' }));
    if (flagged.length) {
    const chips = h('div', { class: 'chips', style: 'margin:10px 0 0' });
    flagged.slice(0, 10).forEach(function (d) { chips.append(h('span', { class: 'chip', text: fmtDate(d.date) })); });
    if (flagged.length > 10) chips.append(h('span', { text: '+' + (flagged.length - 10) + ' more' }));
    sum.append(chips);
}
    host.append(sum);
}

    function shortageCount(fc) {
    if (!fc) return null;
    if (Array.isArray(fc.shortage)) return fc.shortage.length;
    const n = num(fc.shortage);
    if (n !== null) return n;
    if (fc.days.length) return fc.days.filter(function (d) { return d.risk; }).length;
    return null;
}
    function formatConfidence(c) {
    const n = num(c);
    if (n === null) return String(c);
    return (n <= 1 ? Math.round(n * 100) : Math.round(n)) + '%';
}

    function drawHistorical(host, key, monthly) {
    drawChart(host, key, {
    type: 'bar',
    data: {
    labels: monthly.map(function (m) { return m.label; }),
    datasets: [
{ label: 'Inflows', data: monthly.map(function (m) { return m.inflow; }), backgroundColor: '#0f766e', borderRadius: 8, maxBarThickness: 38 },
{ label: 'Outflows', data: monthly.map(function (m) { return m.outflow; }), backgroundColor: '#1d4ed8', borderRadius: 8, maxBarThickness: 38 }
    ]
},
    options: chartBase()
}, 'Bar chart of monthly inflows and outflows');
}

    function renderForecastChart(host, key, fc) {
    if (!fc || !fc.days.length) {
    clear(host).append(emptyState('Forecast not available yet',
    CONFIG.api.forecast ? 'No forecast data was returned.' : 'The forecast API route is not connected yet, so no projection can be shown.'));
    return;
}
    const labels = fc.days.map(function (d) { return fmtDate(d.date); });
    const sets = [];
    if (fc.days.some(function (d) { return d.conservative !== null; })) sets.push({ label: 'Conservative', data: fc.days.map(function (d) { return d.conservative; }), borderColor: '#b91c1c', backgroundColor: '#b91c1c', borderDash: [6, 4], pointRadius: 0, tension: .25 });
    if (fc.days.some(function (d) { return d.expected !== null; })) sets.push({ label: 'Expected', data: fc.days.map(function (d) { return d.expected; }), borderColor: '#1d4ed8', backgroundColor: 'rgba(29,78,216,.10)', fill: true, borderWidth: 3, pointRadius: 0, tension: .25 });
    if (fc.days.some(function (d) { return d.optimistic !== null; })) sets.push({ label: 'Optimistic', data: fc.days.map(function (d) { return d.optimistic; }), borderColor: '#0f766e', backgroundColor: '#0f766e', borderDash: [2, 3], pointRadius: 0, tension: .25 });
    if (!sets.length) { clear(host).append(emptyState('Forecast not available yet', 'The server returned days but no balance values.')); return; }
    drawChart(host, key, { type: 'line', data: { labels: labels, datasets: sets }, options: chartBase() }, 'Line chart of projected balance by scenario');
}

    function renderTransactions(host) {
    clear(host);
    const tx = getTx();
    if (!tx.length) { host.append(emptyState('No transactions yet', 'Upload a statement to see a preview of your transactions.')); return; }
    const tbody = h('tbody');
    tx.slice(0, 15).forEach(function (t) {
    tbody.append(h('tr', null,
    h('td', { text: fmtDate(pick(t, ['date', 'transactionDate'])) }),
    h('td', { class: 'wrap', text: String(pick(t, ['description']) || '—') }),
    h('td', null, catPill(classifyTx(t))),
    h('td', { class: 'num mono', text: money(pick(t, ['debit'])) }),
    h('td', { class: 'num mono', text: money(pick(t, ['credit'])) }),
    h('td', { class: 'num mono', text: money(pick(t, ['balance'])) })));
});
    host.append(h('div', { class: 'table-wrap' }, h('table', null,
    h('thead', null, h('tr', null, h('th', { text: 'Date' }), h('th', { text: 'Description' }), h('th', { text: 'Category' }), h('th', { class: 'num', text: 'Debit' }), h('th', { class: 'num', text: 'Credit' }), h('th', { class: 'num', text: 'Balance' }))),
    tbody)));
}

    function legendItem(cls, text) {
    return h('span', { style: 'display:inline-flex;align-items:center;gap:6px;white-space:nowrap;margin-right:10px' }, h('span', { class: 'dot ' + cls }), text);
}
    function scoreRing(score) {
    const r = 42, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, score));
    return svg('svg', { class: 'ring', viewBox: '0 0 100 100', role: 'img', 'aria-label': 'Data-quality score ' + score + ' out of 100' },
    svg('circle', { cx: 50, cy: 50, r: r, fill: 'none', stroke: '#e8eef6', 'stroke-width': 10 }),
    svg('circle', { cx: 50, cy: 50, r: r, fill: 'none', stroke: '#0f766e', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': (c * pct / 100).toFixed(1) + ' ' + c.toFixed(1), transform: 'rotate(-90 50 50)' }),
    svg('text', { x: 50, y: 48, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 24, 'font-weight': 800, fill: '#0b2545' }, String(score)),
    svg('text', { x: 50, y: 66, 'text-anchor': 'middle', 'font-size': 9, fill: '#566579' }, 'out of 100'));
}
    function renderQuality(host) {
    clear(host);
    const u = state.upload;
    if (!u) { host.append(emptyState('No data-quality report yet', 'Upload a statement and the server will check it for problems.')); return; }
    const score = num(pick(u, ['dataQualityScore', 'qualityScore']));
    const warnings = asArray(pick(u, ['warnings', 'warningMessages']));
    const total = num(pick(u, ['totalRows'])), valid = num(pick(u, ['validRows']));
    const invalid = num(pick(u, ['invalidRows'])), dup = num(pick(u, ['duplicateRows']));

    // Score ring + row-composition bar (both drawn only from numbers the server sent)
    const meta = h('div', { class: 'q-meta' });
    if (total !== null && total > 0 && valid !== null && invalid !== null && dup !== null) {
    const pct = function (n) { return Math.max(0, Math.min(100, n / total * 100)).toFixed(2) + '%'; };
    meta.append(
    h('div', { class: 'sub', text: 'Row breakdown' }),
    h('div', { class: 'stack', role: 'img', 'aria-label': valid + ' valid, ' + invalid + ' invalid, ' + dup + ' duplicate rows out of ' + total },
    h('span', { class: 's-ok', style: 'width:' + pct(valid) }), h('span', { class: 's-bad', style: 'width:' + pct(invalid) }), h('span', { class: 's-dup', style: 'width:' + pct(dup) })),
    h('div', { class: 'legend-row', style: 'margin:0' },
    legendItem('teal', 'Valid'), legendItem('bad', 'Invalid'), legendItem('warn', 'Duplicate')));
} else {
    meta.append(h('div', { class: 'sub', text: 'Row breakdown not available from the server reply.' }));
}
    host.append(h('div', { class: 'q-top' }, score !== null ? scoreRing(score) : null, meta));
    host.append(
    h('div', { class: 'grid g-kpi q-grid' },
    kpi('Total rows', plainNum(total), null, { icon: 'file', accent: '#1d4ed8' }),
    kpi('Valid rows', plainNum(valid), null, { icon: 'check', accent: '#0f766e' }),
    kpi('Invalid rows', plainNum(invalid), null, { icon: 'alert', accent: '#b91c1c' }),
    kpi('Duplicate rows', plainNum(dup), null, { icon: 'cashflow', accent: '#d97706' }),
    kpi('Quality score', score === null ? '—' : score + ' / 100', null, { icon: 'target', accent: '#7c3aed' })));
    if (warnings.length) {
    const ul = h('ul', { class: 'list plain', style: 'margin-top:12px' });
    warnings.forEach(function (w) {
    const text = typeof w === 'string' ? w : String(pick(w, ['message', 'text']) || JSON.stringify(w));
    ul.append(h('li', null, '⚠ ' + text));
});
    host.append(ul, h('p', { class: 'sub', style: 'margin-top:8px', text: 'Review recommended; this is not a fraud determination.' }));
} else {
    host.append(h('p', { class: 'sub', style: 'margin-top:12px', text: 'The server reported no validation warnings.' }));
}
}

    function renderUploadResult() {
    const host = clear($('uploadResult'));
    if (!state.upload) return;
    const card = h('div', { class: 'card' }, h('header', null, h('div', null, h('h3', { text: 'Upload result' }),
    h('p', { class: 'sub', text: String(pick(state.upload, ['message', 'summary']) || 'The server accepted the upload.') }))));
    const q = h('div'); renderQuality(q); card.append(q);
    const tx = h('div', { style: 'margin-top:16px' }); renderTransactions(tx);
    card.append(h('h3', { text: 'Transaction preview', style: 'margin-top:16px' }), tx);
    host.append(card);
}

    function renderCashFlow() {
    const s = summary();
    const g = clear($('cfKpis'));
    g.append(
    kpi('Total inflows', money(pick(s, ['totalInflows', 'totalInflow'])), null, { icon: 'down', accent: '#0f766e' }),
    kpi('Total outflows', money(pick(s, ['totalOutflows', 'totalOutflow'])), null, { icon: 'up', accent: '#d97706' }),
    kpi('Net cash flow', money(pick(s, ['netCashFlow', 'netCashflow'])), null, { icon: 'forecast', accent: '#13315c' }),
    kpi('Average balance', money(pick(s, ['averageBalance', 'avgBalance'])), null, { icon: 'wallet', accent: '#1d4ed8' }),
    kpi('Minimum balance', money(pick(s, ['minimumBalance', 'minBalance'])), null, { icon: 'alert', accent: '#b91c1c' }),
    kpi('Maximum balance', money(pick(s, ['maximumBalance', 'maxBalance'])), null, { icon: 'target', accent: '#15803d' }),
    kpi('Low-balance days', plainNum(pick(s, ['lowBalanceDays'])), null, { icon: 'clock', accent: '#7c3aed' }));
    const monthly = getMonthly();
    if (monthly.length) drawHistorical($('monthlyHost'), 'monthly', monthly);
    else clear($('monthlyHost')).append(emptyState('No monthly data yet', state.statementId === null ? 'Upload a statement first.' : 'The server did not return monthly totals.'));
    renderRanked($('topCustomersHost'), 'topCust', 'bar', pick(s, ['topCustomerInflows', 'topCustomers']), ['customerName', 'customer', 'name', 'description'], 'No customer inflow data available yet.');
    renderClassification($('classHost'));
    renderRecurringList($('recurringHost2'), getRecurring());
    renderRanked($('topCategoriesHost'), 'topCat', 'doughnut', pick(s, ['topExpenseCategories', 'topExpenses']), ['category', 'name', 'description'], 'No expense-category data available yet.');
}
    // Ranked list with a chart above it. Everything comes from the server's list.
    function renderRanked(host, key, type, list, nameKeys, emptyText) {
    clear(host);
    const items = asArray(list).slice(0, 8);
    if (!items.length) { host.append(emptyState('Not available yet', emptyText)); return; }
    const names = items.map(function (it) { return String(typeof it === 'string' ? it : pick(it, nameKeys) || '—'); });
    const values = items.map(function (it) { return num(pick(it, ['amount', 'total', 'totalAmount'])); });
    if (values.some(function (v) { return v !== null; })) {
    const chartHost = h('div', { style: 'margin-bottom:14px' });
    host.append(chartHost);
    if (type === 'doughnut') {
    drawDoughnut(chartHost, key, names, values.map(function (v) { return v || 0; }), names.map(function (_, i) { return PALETTE[i % PALETTE.length]; }), 'Doughnut chart of ' + key, money);
} else {
    drawChart(chartHost, key, {
    type: 'bar',
    data: { labels: names, datasets: [{ label: 'Amount', data: values, backgroundColor: names.map(function (_, i) { return PALETTE[i % PALETTE.length]; }), borderRadius: 8, maxBarThickness: 26 }] },
    options: {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' ' + money(c.parsed.x); } } } },
    scales: { x: { ticks: { callback: compactINR } } }
}
}, 'Bar chart of ' + key);
}
}
    const ul = h('ul', { class: 'list' });
    items.forEach(function (it, i) {
    ul.append(h('li', null,
    h('span', null, h('span', { class: 'dot', style: 'background:' + PALETTE[i % PALETTE.length] + ';margin-right:8px' }), names[i]),
    h('strong', { class: 'mono', text: money(typeof it === 'string' ? null : pick(it, ['amount', 'total', 'totalAmount'])) })));
});
    host.append(ul);
}

    function renderForecast() {
    const fc = getForecast();
    renderForecastChart($('fcHost'), 'fc', fc);
    renderRiskStrip($('fcStrip'), fc);
    const k = clear($('fcKpis'));
    const sc = shortageCount(fc);
    k.append(
    kpi('Forecast confidence', fc && fc.confidence !== undefined ? formatConfidence(fc.confidence) : 'Not available yet', null, { icon: 'target', accent: '#7c3aed' }),
    kpi('Shortage-risk days', sc === null ? 'Not available yet' : String(sc), null, { icon: 'alert', accent: sc ? '#b91c1c' : '#15803d' }),
    kpi('Forecast period', fc && fc.days.length ? fmtDate(fc.days[0].date) + ' – ' + fmtDate(fc.days[fc.days.length - 1].date) : 'Not available yet', 'Estimate, not a guarantee', { icon: 'clock', accent: '#1d4ed8' }));
    $('fcRange').textContent = fc && fc.days.length ? 'Showing ' + fc.days.length + ' days, ' + fmtDate(fc.days[0].date) + ' to ' + fmtDate(fc.days[fc.days.length - 1].date) + '. Estimate only.' : '';
    const sh = clear($('fcShortage'));
    const riskDays = fc ? fc.days.filter(function (d) { return d.risk; }) : [];
    if (!fc) sh.append(notConnected('No forecast has been loaded.'));
    else if (!riskDays.length) sh.append(h('p', { text: sc ? 'The server reported ' + sc + ' shortage-risk day(s) but did not list the dates.' : 'No shortage-risk days were reported.' }));
    else {
    const ul = h('ul', { class: 'list' });
    riskDays.forEach(function (d) { ul.append(h('li', null, h('span', { text: fmtDate(d.date) }), h('span', { class: 'badge b-bad', text: 'Risk' }))); });
    sh.append(ul);
}
    const as = clear($('fcAssumptions'));
    if (!fc || !fc.assumptions.length) as.append(notConnected('No assumptions were returned with the forecast.'));
    else {
    const ul = h('ul', { class: 'list plain' });
    fc.assumptions.forEach(function (a) { ul.append(h('li', { text: typeof a === 'string' ? a : String(pick(a, ['text', 'message', 'description']) || '') })); });
    as.append(ul);
}
}

    function renderStress() {
    const host = clear($('stressHost'));
    const s = getStress();
    if (!s) {
    host.append(h('div', { class: 'card' },
    h('div', { class: 'gauge-wrap' }, gaugeSVG(null)),
    notConnected(CONFIG.api.stress ? 'No stress result was returned.' : 'Not available yet. The stress-score API route is not connected yet.')));
    return;
}
    const score = num(pick(s, ['score', 'stressScore']));
    const level = String(pick(s, ['stressLevel', 'level']) || levelFromScore(score) || '').toUpperCase();
    const left = h('div', { class: 'card' },
    h('header', null, h('div', null, h('h3', { text: 'Cash-stress score' }), h('p', { class: 'sub', text: 'Out of 100. A higher score means healthier cash.' })), stressBadge(level || null)),
    h('div', { class: 'gauge-wrap' }, gaugeSVG(score)),
    h('div', { class: 'legend-row', style: 'justify-content:center' },
    h('span', { class: 'dot bad' }), '0–39 HIGH', h('span', { class: 'dot warn', style: 'margin-left:10px' }), '40–69 MEDIUM', h('span', { class: 'dot ok', style: 'margin-left:10px' }), '70–100 LOW'));
    const parts = h('div', { class: 'card' }, h('header', null, h('h3', { text: 'What makes up the score' })),
    h('ul', { class: 'list' },
    contribution('Cash buffer', pick(s, ['cashBufferScore', 'cashBuffer', 'cashBufferPoints']), 40),
    contribution('Low-balance days', pick(s, ['lowBalanceDaysScore', 'lowBalanceDays', 'lowBalancePoints']), 30),
    contribution('Balance trend', pick(s, ['balanceTrendScore', 'balanceTrend', 'trendPoints']), 30)),
    h('p', { class: 'sub', style: 'margin-top:10px', text: 'Forecast confidence: ' + (pick(s, ['confidence', 'forecastConfidence']) !== undefined ? formatConfidence(pick(s, ['confidence', 'forecastConfidence'])) : 'Not available yet') }));
    const factors = asArray(pick(s, ['mainRiskFactors', 'riskFactors']));
    const reasons = asArray(pick(s, ['reasons', 'explanations']));
    const why = h('div', { class: 'card' }, h('header', null, h('h3', { text: 'Main risk factors and reasons' })));
    if (!factors.length && !reasons.length) why.append(notConnected('No explanations were returned.'));
    else {
    const ul = h('ul', { class: 'list plain' });
    factors.forEach(function (f) { ul.append(h('li', null, h('strong', { text: 'Risk: ' }), typeof f === 'string' ? f : String(pick(f, ['text', 'message']) || ''))); });
    reasons.forEach(function (r) { ul.append(h('li', { text: typeof r === 'string' ? r : String(pick(r, ['text', 'message']) || '') })); });
    why.append(ul);
}
    host.append(h('div', { class: 'grid g-2' }, left, parts), why);
}
    // Semicircle gauge. Segment colours follow the guide's ranges: 0-39 HIGH, 40-69 MEDIUM, 70-100 LOW.
    function polar(cx, cy, r, deg) { const a = deg * Math.PI / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
    function arcPath(cx, cy, r, v0, v1) {
    const p0 = polar(cx, cy, r, 180 - v0 * 1.8), p1 = polar(cx, cy, r, 180 - v1 * 1.8);
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 0 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
}
    function gaugeSVG(score) {
    const cx = 110, cy = 108, r = 84;
    const has = score !== null && score !== undefined;
    const segs = [[0, 40, '#ef4444'], [40, 70, '#f59e0b'], [70, 100, '#22c55e']];
    const kids = segs.map(function (g) {
    return svg('path', { d: arcPath(cx, cy, r, g[0], g[1]), fill: 'none', stroke: g[2], 'stroke-width': 18, opacity: has ? '1' : '.25' });
});
    if (has) {
    const p = polar(cx, cy, r - 24, 180 - Math.max(0, Math.min(100, score)) * 1.8);
    kids.push(
    svg('line', { x1: cx, y1: cy, x2: p[0].toFixed(2), y2: p[1].toFixed(2), stroke: '#0b2545', 'stroke-width': 4, 'stroke-linecap': 'round' }),
    svg('circle', { cx: cx, cy: cy, r: 9, fill: '#0b2545' }),
    svg('circle', { cx: cx, cy: cy, r: 3.5, fill: '#ffffff' }));
}
    kids.push(
    svg('text', { x: cx, y: cy + 40, 'text-anchor': 'middle', 'font-size': 32, 'font-weight': 800, fill: '#0b2545' }, has ? String(score) : '—'),
    svg('text', { x: cx, y: cy + 56, 'text-anchor': 'middle', 'font-size': 10, fill: '#566579' }, has ? 'out of 100' : 'Not available yet'),
    svg('text', { x: cx - r, y: cy + 16, 'text-anchor': 'middle', 'font-size': 10, fill: '#566579' }, '0'),
    svg('text', { x: cx + r, y: cy + 16, 'text-anchor': 'middle', 'font-size': 10, fill: '#566579' }, '100'));
    return svg('svg', { class: 'gauge', viewBox: '0 0 220 172', role: 'img', 'aria-label': has ? 'Cash-stress gauge showing ' + score + ' out of 100' : 'Cash-stress gauge, no score available yet' }, kids);
}
    function contribution(label, value, max) {
    const n = num(value);
    return h('li', { style: 'display:block' },
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { text: label }), h('strong', { class: 'mono', text: n === null ? 'Not available yet' : n + ' / ' + max })),
    n === null ? null : h('div', { class: 'bar', style: 'margin-top:6px' }, h('span', { style: 'width:' + Math.max(0, Math.min(100, n / max * 100)) + '%' })));
}

    function renderRecommendations() {
    const host = clear($('recoHost'));
    const recos = getRecos();
    if (!recos.length) {
    host.append(h('div', { class: 'card' }, emptyState('No recommendations yet', CONFIG.api.recommendations
    ? 'The server returned no recommendations.' : 'Recommendations come from the server. That API route is not connected yet.')));
    return;
}
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    recos.slice().sort(function (a, b) {
    return (order[String(pick(a, ['priority']) || '').toUpperCase()] ?? 3) - (order[String(pick(b, ['priority']) || '').toUpperCase()] ?? 3);
}).forEach(function (r) {
    const pr = String(pick(r, ['priority', 'priorityLevel']) || '').toUpperCase();
    const next = pick(r, ['suggestedAction', 'nextAction', 'action']);
    host.append(h('div', { class: 'card reco p-' + pr.toLowerCase(), style: 'margin-bottom:12px' },
    h('header', null, h('h3', { text: String(pick(r, ['title']) || 'Recommendation') }), h('span', { class: 'badge ' + levelClass(pr === 'HIGH' ? 'HIGH' : pr === 'MEDIUM' ? 'MEDIUM' : pr === 'LOW' ? 'LOW' : ''), text: (pr || 'N/A') + ' priority' })),
    h('p', { text: String(pick(r, ['explanation', 'description', 'message']) || '') }),
    pick(r, ['reason', 'relatedRisk']) ? h('p', { class: 'sub', style: 'margin-top:6px', text: 'Why: ' + pick(r, ['reason', 'relatedRisk']) }) : null,
    next ? h('p', { style: 'margin-top:8px' }, h('strong', { text: 'Suggested next step: ' }), String(next)) : null));
});
}

    function renderDataInfo() {
    const host = clear($('dataInfo'));
    if (state.statementId === null && !state.upload) { host.append(emptyState('No statement uploaded', 'Go to Upload Statement to add one.')); }
    else {
    host.append(h('div', { class: 'grid g-3' },
    kpi('File name', state.filename || '—', null, { icon: 'file', accent: '#1d4ed8' }),
    kpi('Uploaded', state.uploadedAt ? fmtDateTime(state.uploadedAt) : 'Not reported by server', null, { icon: 'clock', accent: '#0f766e' }),
    kpi('Statement ID', state.statementId !== null ? String(state.statementId) : 'Not reported by server', null, { icon: 'database', accent: '#7c3aed' })));
}
    renderFreshness($('freshHost'));
    const note = clear($('deleteNote'));
    if (!CONFIG.api.deleteData) note.append(notice('warn', 'Data deletion API not connected yet. The final delete action is disabled, and no data is removed from this page.'));
    $('deleteBtn').disabled = state.statementId === null && !state.upload;
}

    function renderSimCustomers() {
    const sel = $('simCustomer');
    const names = getCustomers();
    const prev = sel.value;
    clear(sel);
    if (!names.length) {
    sel.append(h('option', { value: '', text: 'No customers available yet' }));
    sel.disabled = true;
    $('simCustomerHint').textContent = 'Customers appear here after a statement is analysed by the server.';
} else {
    sel.disabled = false;
    sel.append(h('option', { value: '', text: 'Select a customer…' }));
    names.forEach(function (n) { sel.append(h('option', { value: n, text: n })); });
    if (names.indexOf(prev) !== -1) sel.value = prev;
    $('simCustomerHint').textContent = '';
}
}

    function renderAll() {
    renderHeaderStatus();
    renderOverview();
    renderUploadResult();
    renderCashFlow();
    renderForecast();
    renderStress();
    renderRecommendations();
    renderDataInfo();
    renderSimCustomers();
    renderBusiness();
}

    /* ---------------------------------------------------------------
       3.9 Loading data from the server
       --------------------------------------------------------------- */
    async function loadDashboard() {
    if (state.statementId === null) return;
    const r = await apiFetch(CONFIG.api.dashboard(state.statementId), { headers: { 'Accept': 'application/json' } });
    if (r.ok && r.data) { state.dashboard = r.data; }
    else if (r.notConnected) toast('Dashboard API not connected yet.', 'bad');
    else if (!r.ok) toast(r.error, 'bad');
    else toast('The dashboard reply was empty.', 'bad');
    return r;
}
    async function loadOptional(key, url) {
    if (!url || state.statementId === null) return;
    const r = await apiFetch(url, { headers: { 'Accept': 'application/json' } });
    if (r.ok && r.data) state[key] = r.data;
}
    async function refreshAll() {
    if (state.statementId === null) {
    toast('Nothing to refresh yet. Upload a statement first.', '');
    return;
}
    const btn = $('refreshBtn'); btn.disabled = true;
    ['kpiGrid'].forEach(function (id) { clear($(id)).append(loadingLine('Loading…')); });
    await loadDashboard();
    await Promise.all([
    loadOptional('forecast', CONFIG.api.forecast && CONFIG.api.forecast(state.statementId)),
    loadOptional('stress', CONFIG.api.stress && CONFIG.api.stress(state.statementId)),
    loadOptional('recommendations', CONFIG.api.recommendations && CONFIG.api.recommendations(state.statementId))
    ]);
    renderAll();
    btn.disabled = false;
}

    /* ---------------------------------------------------------------
       3.10 Upload
       --------------------------------------------------------------- */
    function showFileError(msg) {
    const el = $('fileError');
    if (msg) { el.textContent = msg; el.hidden = false; } else { el.hidden = true; el.textContent = ''; }
}
    function validateFile(file) {
    if (!file) return 'Please choose a CSV file first.';
    if (!/\.csv$/i.test(file.name)) return 'Only .csv files are accepted. Please export your statement as CSV.';
    if (file.size === 0) return 'This file is empty. Please choose a statement that contains data.';
    if (file.size > CONFIG.MAX_FILE_BYTES) return 'This file is larger than ' + fmtSize(CONFIG.MAX_FILE_BYTES) + '. Please upload a smaller statement.';
    return null;
}
    function setFile(file) {
    const err = validateFile(file);
    showFileError(err);
    if (err) { state.selectedFile = null; } else { state.selectedFile = file; }
    $('fileInfo').hidden = !state.selectedFile;
    if (state.selectedFile) {
    $('fileName').textContent = file.name;
    $('fileSize').textContent = fmtSize(file.size);
}
    $('uploadBtn').disabled = !state.selectedFile;
    $('clearFileBtn').disabled = !file;
}
    function clearFile() {
    $('fileInput').value = '';
    state.selectedFile = null;
    $('fileInfo').hidden = true;
    showFileError(null);
    $('uploadBtn').disabled = true;
    $('clearFileBtn').disabled = true;
}
    async function doUpload() {
    const err = validateFile(state.selectedFile);
    if (err) { showFileError(err); return; }
    const file = state.selectedFile;
    const fd = new FormData();
    fd.append(CONFIG.UPLOAD_FIELD, file);            // no manual Content-Type: the browser sets the multipart boundary
    $('uploadBtn').disabled = true; $('clearFileBtn').disabled = true;
    $('uploadLoading').hidden = false;
    showFileError(null);
    const r = await apiFetch(CONFIG.api.upload, { method: 'POST', body: fd });
    $('uploadLoading').hidden = true;
    $('clearFileBtn').disabled = false;
    $('uploadBtn').disabled = false;

    if (r.notConnected) {
    showFileError('Backend API not connected yet. The upload screen is ready, but the server did not accept this request.');
    return;
}
    if (!r.ok) { showFileError(r.error); toast('Upload failed.', 'bad'); return; }
    if (!r.data || typeof r.data !== 'object') {
    showFileError('The server accepted the file but sent an empty reply, so no summary can be shown.');
    return;
}
    state.upload = r.data;
    state.filename = file.name;
    state.uploadedAt = pick(r.data, ['uploadedAt', 'uploadTime', 'uploadTimestamp']) || null;
    const id = pick(r.data, ['statementId', 'id']);
    state.statementId = id !== undefined ? id : null;
    state.dashboard = null; state.forecast = null; state.stress = null; state.recommendations = null;
    toast('Server confirmed the upload.', 'ok');
    renderAll();
    if (state.statementId !== null) { await refreshAll(); }
    else toast('The upload reply did not include a statement ID, so the dashboard cannot be loaded yet.', '');
}

    /* ---------------------------------------------------------------
       3.11 Simulation
       --------------------------------------------------------------- */
    function syncDelay(value, source) {
    let v = parseInt(value, 10);
    if (!Number.isInteger(v)) { $('simDelayOut').textContent = '— days'; renderSimTimeline(); return; }
    if (source === 'num') { if (v >= 1 && v <= 30) $('simDelayRange').value = v; }
    else $('simDelayNum').value = v;
    $('simDelayOut').textContent = v + (v === 1 ? ' day' : ' days');
    renderSimTimeline();
}
    // Live picture of the delay the user chose. It reflects only the user's own input.
    function renderSimTimeline() {
    const host = clear($('simTimeline'));
    const v = parseInt($('simDelayNum').value, 10);
    if (!Number.isInteger(v) || v < 1 || v > 30) { host.append(h('div', { class: 'sub', text: 'Choose a delay from 1 to 30 days to preview it here.' })); return; }
    const pct = (v / 30 * 100).toFixed(2) + '%';
    host.append(
    h('div', { class: 'tl-label', text: 'Payment arrives ' + v + (v === 1 ? ' day' : ' days') + ' later than expected' }),
    h('div', { class: 'tl-track', 'aria-hidden': 'true' }, h('span', { class: 'tl-fill', style: 'width:' + pct }), h('span', { class: 'tl-dot start' }), h('span', { class: 'tl-dot end', style: 'left:' + pct })),
    h('div', { class: 'tl-scale', 'aria-hidden': 'true' }, h('span', { text: 'Expected date' }), h('span', { text: '10 days' }), h('span', { text: '20 days' }), h('span', { text: '30 days' })));
}
    function validateSim() {
    let ok = true;
    $('errCustomer').textContent = ''; $('errAmount').textContent = ''; $('errDelay').textContent = '';
    const customer = $('simCustomer').value;
    if (!customer) { $('errCustomer').textContent = 'Please select a customer.'; ok = false; }
    const rawAmt = $('simAmount').value.trim();
    const amt = Number(rawAmt);
    if (!rawAmt || !Number.isFinite(amt) || amt <= 0) { $('errAmount').textContent = 'Enter a payment amount greater than zero.'; ok = false; }
    const rawDelay = $('simDelayNum').value.trim();
    const delay = Number(rawDelay);
    if (!rawDelay || !Number.isInteger(delay) || delay < 1 || delay > 30) { $('errDelay').textContent = 'Delay must be a whole number from 1 to 30.'; ok = false; }
    return ok ? { statementId: state.statementId, customerName: customer, delayDays: delay, paymentAmount: amt } : null;
}
    async function runSimulation(ev) {
    ev.preventDefault();
    const body = validateSim();
    if (!body) return;
    const btn = $('simRunBtn'); btn.disabled = true; $('simLoading').hidden = false;
    clear($('simResult'));
    const r = await apiFetch(CONFIG.api.simulation, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body)
});
    btn.disabled = false; $('simLoading').hidden = true;
    const host = $('simResult');
    if (r.notConnected) { host.append(h('div', { class: 'card' }, notice('warn', 'Simulation not connected yet. The server does not provide POST /api/simulation, so no result can be shown.'), compareShell(null))); return; }
    if (!r.ok) { host.append(h('div', { class: 'card' }, notice('bad', r.error), compareShell(null))); return; }
    if (!r.data || typeof r.data !== 'object') { host.append(h('div', { class: 'card' }, notice('warn', 'The server sent an empty reply, so there is nothing to compare.'))); return; }
    host.append(h('div', { class: 'card' }, h('header', null, h('h3', { text: 'Normal vs delayed payment' })), compareShell(r.data)));
    const nMin = num(pick(r.data, ['normalMinimumBalance'])), sMin = num(pick(r.data, ['simulatedMinimumBalance']));
    if (nMin !== null && sMin !== null && $('simChartHost')) {
    drawChart($('simChartHost'), 'sim', {
    type: 'bar',
    data: { labels: ['Normal', 'Delayed'], datasets: [{ label: 'Minimum balance', data: [nMin, sMin], backgroundColor: ['#0f766e', '#d97706'], borderRadius: 10, maxBarThickness: 80 }] },
    options: chartBase({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' Minimum balance: ' + money(c.parsed.y); } } } } })
}, 'Bar chart comparing minimum balance with and without the delay');
}
    toast('Simulation result received from the server.', 'ok');
}
    function deltaCards(d) {
    const nMin = num(pick(d, ['normalMinimumBalance'])), sMin = num(pick(d, ['simulatedMinimumBalance']));
    const diff = nMin !== null && sMin !== null ? sMin - nMin : null;
    const sd = pick(d, ['shortageDays', 'simulatedShortageDays']);
    return h('div', { class: 'grid g-3', style: 'margin-bottom:14px' },
    kpi('Minimum balance change', diff === null ? '—' : money(diff), 'Delayed minus normal', { icon: 'wallet', accent: diff !== null && diff < 0 ? '#b91c1c' : '#0f766e' }),
    kpi('Shortage-risk days', sd === undefined ? '—' : plainNum(sd), 'With the delay', { icon: 'alert', accent: '#d97706' }),
    kpi('Stress level', h('span', null, stressBadge(pick(d, ['normalStressLevel']) || null), ' → ', stressBadge(pick(d, ['simulatedStressLevel']) || null)), 'Normal → delayed', { icon: 'shield', accent: '#1d4ed8' }));
}
    function compareShell(d) {
    const get = function (keys) { return d ? pick(d, keys) : undefined; };
    function val(v, fmt) { return v === undefined || v === null ? '—' : (fmt ? fmt(v) : String(v)); }
    const rows = [
    ['Original payment date', val(get(['originalPaymentDate']), fmtDate), null],
    ['Simulated payment date', null, val(get(['simulatedPaymentDate']), fmtDate)],
    ['Minimum balance', val(get(['normalMinimumBalance']), money), val(get(['simulatedMinimumBalance']), money)],
    ['Shortage-risk days', val(get(['normalShortageDays']), plainNum), val(get(['shortageDays', 'simulatedShortageDays']), plainNum)],
    ['Stress level', val(get(['normalStressLevel'])), val(get(['simulatedStressLevel']))]
    ];
    const normalScore = get(['normalStressScore']); const simScore = get(['simulatedStressScore']);
    if (normalScore !== undefined || simScore !== undefined) rows.push(['Stress score', val(normalScore), val(simScore)]);
    const tbody = h('tbody');
    rows.forEach(function (r) { tbody.append(h('tr', null, h('td', { text: r[0] }), h('td', { class: 'mono', text: r[1] === null ? '' : r[1] }), h('td', { class: 'sim mono', text: r[2] === null ? '' : r[2] }))); });
    const rec = get(['recommendation']);
    return h('div', null,
    d ? deltaCards(d) : null,
    d ? h('div', { id: 'simChartHost', style: 'margin-bottom:14px' }) : null,
    h('div', { class: 'table-wrap' }, h('table', { class: 'compare' },
    h('thead', null, h('tr', null, h('th', { text: 'Measure' }), h('th', { text: 'Normal' }), h('th', { text: 'Delayed' }))), tbody)),
    h('p', { style: 'margin-top:12px' }, h('strong', { text: 'Recommendation: ' }), rec ? String(rec) : (d ? 'None returned.' : '—')));
}

    /* ---------------------------------------------------------------
       3.12 Data deletion (final action disabled until a real API is configured)
       --------------------------------------------------------------- */
    function openDeleteDialog() {
    const dlg = $('deleteDialog');
    const note = $('delDialogNote');
    if (!CONFIG.api.deleteData) {
    note.hidden = false; note.textContent = 'Data deletion API not connected yet. Nothing can be deleted from this page.';
    $('delConfirm').disabled = true;
} else { note.hidden = true; $('delConfirm').disabled = false; }
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}
    async function confirmDelete() {
    if (!CONFIG.api.deleteData) return;
    const r = await apiFetch(CONFIG.api.deleteData(state.statementId), { method: 'DELETE' });
    if (!r.ok) { toast(r.error, 'bad'); return; }
    // Only clear after the server confirmed success.
    state.statementId = null; state.filename = null; state.uploadedAt = null;
    state.upload = null; state.dashboard = null; state.forecast = null; state.stress = null; state.recommendations = null;
    $('deleteDialog').close();
    toast('Server confirmed the data was deleted.', 'ok');
    renderAll();
}

    /* ---------------------------------------------------------------
       3.13 Wiring
       --------------------------------------------------------------- */

    /* ---------------------------------------------------------------
       3.13 Business details (optional extra inputs)
       --------------------------------------------------------------- */
    const MAX_PAYMENTS = 10;
    function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function addPayRow() {
    const host = $('bizPayRows');
    if (host.children.length >= MAX_PAYMENTS) { toast('You can add up to ' + MAX_PAYMENTS + ' upcoming payments.', ''); return; }
    const row = h('div', { class: 'pay-row row', style: 'align-items:flex-end;gap:10px' },
    h('div', { class: 'field', style: 'flex:2;min-width:160px;margin:0' }, h('label', { text: 'Payment for' }), h('input', { type: 'text', class: 'pay-name', maxlength: '60', placeholder: 'e.g. GST, supplier invoice' })),
    h('div', { class: 'field', style: 'flex:1;min-width:130px;margin:0' }, h('label', { text: 'Amount (₹)' }), h('input', { type: 'number', class: 'pay-amount', min: '0.01', step: '0.01', inputmode: 'decimal', placeholder: 'e.g. 12000' })),
    h('div', { class: 'field', style: 'flex:1;min-width:150px;margin:0' }, h('label', { text: 'Due date (optional)' }), h('input', { type: 'date', class: 'pay-date', min: todayISO() })),
    h('button', { type: 'button', class: 'btn secondary', 'aria-label': 'Remove this payment', onclick: function () { row.remove(); } }, 'Remove'));
    host.append(row);
}
    function readMoney(id, errId, label) {
    const raw = $(id).value.trim();
    $(errId).textContent = '';
    if (raw === '') return { value: null };
    const n = Number(raw);
    if (!isFinite(n) || n < 0) { $(errId).textContent = label + ' must be a number, 0 or more.'; return { error: true }; }
    if (n > 1e10) { $(errId).textContent = label + ' is too large.'; return { error: true }; }
    return { value: n };
}
    function readBusiness() {
    let bad = false;
    const rent = readMoney('bizRent', 'eBizRent', 'Monthly rent'); if (rent.error) bad = true;
    const other = readMoney('bizOther', 'eBizOther', 'Other fixed expenses'); if (other.error) bad = true;
    const cash = readMoney('bizCash', 'eBizCash', 'Cash in hand'); if (cash.error) bad = true;
    const payments = []; let payErr = '';
    document.querySelectorAll('#bizPayRows .pay-row').forEach(function (r, i) {
    const name = r.querySelector('.pay-name').value.trim();
    const amtRaw = r.querySelector('.pay-amount').value.trim();
    const date = r.querySelector('.pay-date').value;
    if (!name && !amtRaw && !date) return;                       // empty row: ignore
    const amt = Number(amtRaw);
    if (!name) { payErr = 'Payment ' + (i + 1) + ': enter what the payment is for.'; return; }
    if (amtRaw === '' || !isFinite(amt) || amt <= 0 || amt > 1e10) { payErr = 'Payment ' + (i + 1) + ': enter an amount above 0.'; return; }
    if (date && date < todayISO()) { payErr = 'Payment ' + (i + 1) + ': the due date is in the past.'; return; }
    payments.push({ name: name, amount: amt, date: date || null });
});
    $('eBizPay').textContent = payErr;
    if (payErr) bad = true;
    if (bad) return null;
    return { rent: rent.value, other: other.value, cash: cash.value, payments: payments };
}
    async function saveBusiness() {
    const b = readBusiness();
    if (!b) return;
    if (b.rent === null && b.other === null && b.cash === null && !b.payments.length) { toast('Nothing to save yet. Fill in at least one field.', ''); return; }
    state.business = b;
    renderBusiness();
    if (!CONFIG.api.businessDetails) { toast('Saved on this page. The server route is not connected yet, so these numbers are not sent anywhere.', ''); return; }
    $('bizLoading').hidden = false; $('bizSave').disabled = true;
    const r = await apiFetch(CONFIG.api.businessDetails, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ statementId: state.statementId, monthlyRent: b.rent, otherFixedExpenses: b.other, cashInHand: b.cash,
    upcomingPayments: b.payments.map(function (p) { return { name: p.name, amount: p.amount, dueDate: p.date }; }) }) });
    $('bizLoading').hidden = true; $('bizSave').disabled = false;
    if (r.ok) toast('Business details saved on the server.', 'ok'); else toast(r.error || 'The server could not save the details.', 'bad');
}
    function clearBusiness() {
    state.business = null;
    ['bizRent', 'bizOther', 'bizCash'].forEach(function (id) { $(id).value = ''; });
    ['eBizRent', 'eBizOther', 'eBizCash', 'eBizPay'].forEach(function (id) { $(id).textContent = ''; });
    clear($('bizPayRows'));
    renderBusiness();
}
    function renderBusiness() {
    const host = clear($('bizSummary'));
    const b = state.business;
    if (!b) { host.append(h('div', { class: 'card' }, emptyState('Nothing saved yet', 'Fill in what you know and press Save. Every field is optional.'))); return; }
    const fixed = (b.rent || 0) + (b.other || 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let due30 = 0, payTotal = 0, next = null;
    b.payments.forEach(function (p) {
    payTotal += p.amount;
    const d = p.date ? new Date(p.date + 'T00:00:00') : null;
    const days = d ? Math.round((d - today) / 86400000) : null;
    if (days === null || days <= 30) due30 += p.amount;
    if (d && (!next || d < next.date)) next = { date: d, name: p.name };
});
    const total30 = fixed + due30;
    const cards = [
    kpi('Monthly fixed costs', money(fixed), 'Rent + other fixed expenses', { icon: 'cashflow', accent: '#d97706' }),
    kpi('Upcoming payments', money(payTotal), b.payments.length ? b.payments.length + ' payment' + (b.payments.length === 1 ? '' : 's') + (next ? ' · next: ' + next.name + ' on ' + fmtDate(next.date) : '') : 'None added', { icon: 'clock', accent: '#7c3aed' }),
    kpi('Needed in the next 30 days', money(total30), 'Fixed costs + payments due within 30 days (undated ones included)', { icon: 'up', accent: '#1d4ed8' })
    ];
    if (b.cash !== null) {
    const left = b.cash - total30;
    cards.push(kpi('Cash in hand', money(b.cash), left >= 0 ? 'Covers these costs, with ' + money(left) + ' left' : 'Short by ' + money(-left) + ' for these costs', { icon: 'wallet', accent: left >= 0 ? '#15803d' : '#b91c1c' }));
    if (fixed > 0) cards.push(kpi('Cash in hand covers', Math.floor(b.cash / (fixed / 30)) + ' days', 'Of monthly fixed costs only', { icon: 'target', accent: '#0f766e' }));
}
    host.append(h('div', { class: 'card' },
    h('header', null, h('div', null, h('h3', { text: 'What these details add up to' }), h('p', { class: 'sub', text: 'A quick estimate from only the numbers you typed. It ignores money coming in, so it is not a forecast.' }))),
    h('div', { class: 'grid g-kpi' }, cards),
    h('div', { class: 'notice n-info', style: 'margin-top:14px' }, h('span', { 'aria-hidden': 'true', text: 'ℹ' }),
    h('span', { text: CONFIG.api.businessDetails ? 'These details are also sent to the server with your statement.' : 'These details stay on this page only. They are cleared when you refresh or log out.' }))));
}

    /* ---------------------------------------------------------------
       3.12 Login / Register
       If CONFIG.api.login / register are set, the server is used.
       If they are null, accounts are kept in this browser only (demo mode):
       passwords are salted + hashed (SHA-256), but this is NOT real security.
       --------------------------------------------------------------- */
    const USERS_KEY = 'cfg_users_v1', SESSION_KEY = 'cfg_session_v1';
    function store(kind) { try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch (e) { return null; } }
    const mem = {};
    let storageOk = true;
    function readJSON(kind, key, fallback) {
    try { const st = store(kind); if (st) { const v = st.getItem(key); return v ? JSON.parse(v) : fallback; } } catch (e) { /* storage blocked */ }
    storageOk = false;
    return mem[kind + key] !== undefined ? mem[kind + key] : fallback;
}
    function writeJSON(kind, key, val) {
    try { const st = store(kind); if (st) { st.setItem(key, JSON.stringify(val)); return true; } } catch (e) { /* storage blocked */ }
    storageOk = false; mem[kind + key] = val; return true;   // kept in memory for this page visit only
}
    async function sha256(text) {
    try {
    if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}
} catch (e) { /* fall through */ }
    let x = 5381; for (let i = 0; i < text.length; i++) x = ((x << 5) + x + text.charCodeAt(i)) | 0;
    return 'weak-' + (x >>> 0).toString(16);
}
    function randomSalt() {
    try { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
    catch (e) { return String(Date.now()) + Math.random().toString(16).slice(2); }
}
    const auth = { user: null };
    function setFieldError(inputId, errId, msg) {
    const i = $(inputId), e = $(errId);
    if (e) e.textContent = msg || '';
    if (i) { i.classList.toggle('invalid', !!msg); if (msg) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); }
    return !msg;
}
    function authMessage(kind, text) {
    const el = $('authMsg');
    if (!text) { el.hidden = true; el.replaceChildren(); return; }
    el.hidden = false; el.replaceChildren(notice(kind, text));
}
    function switchAuthTab(which) {
    const login = which === 'login';
    $('loginForm').hidden = !login; $('registerForm').hidden = login;
    $('tabLogin').setAttribute('aria-selected', String(login)); $('tabRegister').setAttribute('aria-selected', String(!login));
    $('authTitle').nextElementSibling.textContent = login ? 'Sign in to see your cash-flow dashboard' : 'Create your account to get started';
    authMessage(null);
    setTimeout(function () { $(login ? 'loginEmail' : 'regName').focus(); }, 0);
}
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    function enterApp(user) {
    auth.user = user;
    document.body.classList.remove('locked');
    $('userChip').hidden = false;
    $('userName').textContent = user.name;
    $('userAvatar').textContent = (user.name || '?').trim().charAt(0).toUpperCase();
    try { renderAll(); } catch (e) { try { console.error(e); } catch (x) { /* ignore */ } }
    try { showSection((location.hash || '#overview').slice(1)); } catch (e) { /* ignore */ }
    window.scrollTo(0, 0);
}
    function leaveApp() {
    const s = store('session'); try { s && s.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    auth.user = null;
    // wipe in-memory business data so the next person never sees it
    state.statementId = null; state.filename = null; state.uploadedAt = null; state.upload = null; state.dashboard = null;
    state.forecast = null; state.stress = null; state.recommendations = null; state.selectedFile = null;
    Object.keys(charts).forEach(function (k) { try { charts[k].destroy(); } catch (e) { /* ignore */ } delete charts[k]; });
    clearBusiness();
    document.body.classList.add('locked');
    $('userChip').hidden = true;
    document.querySelectorAll('#authWrap input').forEach(function (i) { i.value = ''; });
    switchAuthTab('login');
}
    async function doRegister(ev) {
    ev.preventDefault();
    authMessage(null);
    const name = $('regName').value.trim(), biz = $('regBiz').value.trim(), email = $('regEmail').value.trim().toLowerCase();
    const p1 = $('regPass').value, p2 = $('regPass2').value;
    let ok = true;
    ok = setFieldError('regName', 'eRegName', name.length < 2 ? 'Please enter your full name.' : '') && ok;
    ok = setFieldError('regEmail', 'eRegEmail', !EMAIL_RE.test(email) ? 'Enter a valid email address.' : '') && ok;
    ok = setFieldError('regPass', 'eRegPass', (p1.length < 8 || !/[A-Za-z]/.test(p1) || !/\d/.test(p1)) ? 'Use at least 8 characters with letters and numbers.' : '') && ok;
    ok = setFieldError('regPass2', 'eRegPass2', p1 !== p2 ? 'Passwords do not match.' : '') && ok;
    if (!ok) return;
    $('registerBtn').disabled = true;
    try {
    if (CONFIG.api.register) {
    const r = await apiFetch(CONFIG.api.register, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ name: name, businessName: biz, email: email, password: p1 }) });
    if (!r.ok) { authMessage('bad', r.error); return; }
    switchAuthTab('login'); $('loginEmail').value = email;
    authMessage('ok', 'Account created. Please login.');
    return;
}
    const users = readJSON('local', USERS_KEY, []);
    if (users.some(function (u) { return u.email === email; })) { setFieldError('regEmail', 'eRegEmail', 'This email is already registered. Try logging in.'); return; }
    const salt = randomSalt();
    const rec = { name: name, businessName: biz, email: email, salt: salt, hash: await sha256(salt + p1), createdAt: new Date().toISOString() };
    users.push(rec);
    if (!writeJSON('local', USERS_KEY, users)) { authMessage('bad', 'The account could not be saved.'); return; }
    const session = { name: name, email: email, businessName: biz };
    writeJSON('session', SESSION_KEY, session);
    enterApp(session);
} finally { $('registerBtn').disabled = false; }
}
    async function doLogin(ev) {
    ev.preventDefault();
    authMessage(null);
    const email = $('loginEmail').value.trim().toLowerCase(), pass = $('loginPass').value;
    let ok = true;
    ok = setFieldError('loginEmail', 'eLoginEmail', !EMAIL_RE.test(email) ? 'Enter a valid email address.' : '') && ok;
    ok = setFieldError('loginPass', 'eLoginPass', !pass ? 'Enter your password.' : '') && ok;
    if (!ok) return;
    $('loginBtn').disabled = true;
    try {
    if (CONFIG.api.login) {
    const r = await apiFetch(CONFIG.api.login, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ email: email, password: pass }) });
    if (!r.ok) { authMessage('bad', r.status === 401 || r.status === 403 ? 'Incorrect email or password.' : r.error); return; }
    const u = { name: String(pick(r.data || {}, ['name', 'fullName', 'username']) || email), email: email };
    writeJSON('session', SESSION_KEY, u); enterApp(u); return;
}
    const users = readJSON('local', USERS_KEY, []);
    const u = users.find(function (x) { return x.email === email; });
    const bad = 'Incorrect email or password.';
    if (!u) { authMessage('bad', users.length ? bad : 'No account found in this browser. Please register first.'); return; }
    if ((await sha256(u.salt + pass)) !== u.hash) { authMessage('bad', bad); return; }
    const session = { name: u.name, email: u.email, businessName: u.businessName };
    writeJSON('session', SESSION_KEY, session);
    enterApp(session);
} finally { $('loginBtn').disabled = false; }
}
    function initAuth() {
    $('tabLogin').addEventListener('click', function () { switchAuthTab('login'); });
    $('tabRegister').addEventListener('click', function () { switchAuthTab('register'); });
    $('toRegister').addEventListener('click', function (e) { e.preventDefault(); switchAuthTab('register'); });
    $('toLogin').addEventListener('click', function (e) { e.preventDefault(); switchAuthTab('login'); });
    $('loginBtn').addEventListener('click', doLogin);
    $('registerBtn').addEventListener('click', doRegister);
    [['loginForm', doLogin], ['registerForm', doRegister]].forEach(function (pair) {
    $(pair[0]).addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') pair[1](e); });
});
    $('logoutBtn').addEventListener('click', function () { try { fetch('/api/auth/logout', { method: 'POST' }).catch(function () { /* ignore */ }); } catch (e) { /* ignore */ } leaveApp(); toast('You have been logged out.', 'ok'); });
    document.querySelectorAll('.pw-toggle').forEach(function (b) {
    b.addEventListener('click', function () {
    const i = $(b.dataset.pw); const show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show';
});
});
    $('authModeNote').textContent = (CONFIG.api.login && CONFIG.api.register) ? '' :
    'Demo mode: accounts are stored only in this browser. Connect the login/register API for real accounts.';
    const sess = readJSON('session', SESSION_KEY, null);
    if (!storageOk) $('authModeNote').textContent = 'This preview blocks browser storage, so accounts last only until you close or refresh the page. Open the file directly in Chrome/Edge to keep them.';
    if (sess && sess.name) enterApp(sess); else { document.body.classList.add('locked'); setTimeout(function () { $('loginEmail').focus(); }, 0); }
}

    function init() {
    $('todayDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Icons: nav items, section headings, refresh button
    const NAV_ICONS = { overview: 'grid', upload: 'upload', business: 'wallet', cashflow: 'cashflow', forecast: 'forecast', stress: 'shield', simulation: 'clock', recommendations: 'check', data: 'database' };
    document.querySelectorAll('#nav button').forEach(function (b) {
    const slot = b.querySelector('.ico');
    if (slot) slot.replaceChildren(icon(NAV_ICONS[b.dataset.target], 18));
});
    document.querySelectorAll('[data-section]').forEach(function (sec) {
    if (sec.dataset.section === 'overview') return;
    const heading = sec.querySelector('h2');
    if (heading) heading.prepend(h('span', { class: 'ico-chip sm' }, icon(NAV_ICONS[sec.dataset.section], 18)));
});
    $('refreshBtn').replaceChildren(icon('refresh', 16), ' Refresh');
    $('templateBtn').addEventListener('click', downloadTemplate);

    document.querySelectorAll('#nav button').forEach(function (b) { b.addEventListener('click', function () { showSection(b.dataset.target); }); });
    $('menuToggle').addEventListener('click', function () { document.body.classList.contains('nav-open') ? closeMenu() : openMenu(); });
    $('scrim').addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    $('refreshBtn').addEventListener('click', refreshAll);

    // Upload
    const dz = $('dropzone'), fi = $('fileInput');
    dz.addEventListener('click', function () { fi.click(); });
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    fi.addEventListener('change', function () { if (fi.files.length) setFile(fi.files[0]); });
    ['dragenter', 'dragover'].forEach(function (t) { dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (t) { dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.remove('drag'); }); });
    dz.addEventListener('drop', function (e) {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    if (files.length > 1) toast('Only one file at a time. Using the first file.', '');
    setFile(files[0]);
});
    $('uploadBtn').addEventListener('click', doUpload);
    $('clearFileBtn').addEventListener('click', clearFile);

    // Simulation
    $('simDelayRange').addEventListener('input', function (e) { syncDelay(e.target.value, 'range'); });
    $('simDelayNum').addEventListener('input', function (e) { syncDelay(e.target.value, 'num'); });
    $('simForm').addEventListener('submit', runSimulation);
    $('simRunBtn').addEventListener('click', function (e) { e.preventDefault(); runSimulation(e); });

    // Business details
    $('bizAddPay').addEventListener('click', addPayRow);
    $('bizSave').addEventListener('click', saveBusiness);
    $('bizClear').addEventListener('click', clearBusiness);

    // Delete
    $('deleteBtn').addEventListener('click', openDeleteDialog);
    $('delCancel').addEventListener('click', function () { $('deleteDialog').close(); });
    $('delConfirm').addEventListener('click', confirmDelete);

    // Chart.js may finish loading after first paint: redraw charts then.
    window.addEventListener('load', function () { if (!chartReady()) setTimeout(renderAll, 1500); else renderAll(); });

    renderAll();
    renderSimTimeline();
    initAuth();
    showSection((location.hash || '#overview').slice(1));
    window.addEventListener('hashchange', function () { showSection(location.hash.slice(1)); });
}
    init();
})();
</script>

<!-- =====================================================================
     THEME SCRIPT: visual effects only (no business logic, no data access)
     ===================================================================== -->
<script>
    (function () {
    'use strict';
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // Floating colour orbs + scroll progress bar
    var orbs = document.createElement('div'); orbs.className = 'bg-orbs'; orbs.setAttribute('aria-hidden', 'true');
    orbs.innerHTML = '<i></i><i></i><i></i>';
    var prog = document.createElement('div'); prog.className = 'scroll-progress'; prog.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(prog, document.body.firstChild);
    document.body.insertBefore(orbs, document.body.firstChild);

    var tb = document.querySelector('.topbar');
    var ticking = false;
    function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
    ticking = false;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, window.scrollY / h) : 0) + ')';
    if (tb) tb.classList.toggle('scrolled', window.scrollY > 8);
});
}
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    // Cursor spotlight on cards
    if (fine && !reduced) {
    var raf = 0;
    document.addEventListener('mousemove', function (e) {
    if (raf) return;
    raf = requestAnimationFrame(function () {
    raf = 0;
    var c = e.target && e.target.closest ? e.target.closest('.card') : null;
    if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
});
}, { passive: true });
}

    // Button ripple
    document.addEventListener('click', function (e) {
    if (reduced) return;
    var b = e.target && e.target.closest ? e.target.closest('.btn') : null;
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
    var s = document.createElement('span'); s.className = 'ripple';
    s.style.width = s.style.height = d + 'px';
    s.style.left = (e.clientX - r.left - d / 2) + 'px'; s.style.top = (e.clientY - r.top - d / 2) + 'px';
    b.appendChild(s); setTimeout(function () { if (s.parentNode) s.remove(); }, 700);
});

    // Count-up for rupee KPI values (starts when the card is actually visible)
    var RE = /^(-?)₹\s?([\d,]+)(\.\d+)?$/;
    var io = ('IntersectionObserver' in window && !reduced) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
    if (!en.isIntersecting) return;
    io.unobserve(en.target); run(en.target);
});
}, { threshold: 0.2 }) : null;
    function run(el) {
    var final = el.getAttribute('data-final'); if (!final) return;
    var m = RE.exec(final); if (!m) { el.textContent = final; return; }
    var dec = m[3] ? m[3].length - 1 : 0;
    var target = parseFloat(m[2].replace(/,/g, '') + (m[3] || ''));
    var fmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    var t0 = performance.now(), dur = 1200;
    (function step(now) {
    var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    if (k < 1) { el.textContent = m[1] + '₹' + fmt.format(target * e); requestAnimationFrame(step); }
    else el.textContent = final;
})(t0);
}
    function prep(el) {
    if (!io || el.hasAttribute('data-final')) return;
    var t = el.textContent.trim(), m = RE.exec(t);
    if (!m || !isFinite(parseFloat(m[2].replace(/,/g, '')))) return;
    if (parseFloat(m[2].replace(/,/g, '')) === 0) return;
    el.setAttribute('data-final', t);
    el.textContent = m[1] + '₹0' + (m[3] ? '.' + new Array(m[3].length).join('0') : '');
    io.observe(el);
}
    function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches && node.matches('.kpi .value')) prep(node);
    if (node.querySelectorAll) node.querySelectorAll('.kpi .value').forEach(prep);
}
    var content = document.querySelector('.content');
    if (content && io) {
    new MutationObserver(function (list) {
    list.forEach(function (mu) { mu.addedNodes.forEach(scan); });
}).observe(content, { childList: true, subtree: true });
    scan(content);
}

    // Smoother chart animation once Chart.js is available
    var tries = 0, timer = setInterval(function () {
    tries++;
    if (window.Chart) {
    try { window.Chart.defaults.animation = { duration: reduced ? 0 : 1400, easing: 'easeOutQuart' }; } catch (e) { /* optional */ }
    clearInterval(timer);
} else if (tries > 100) clearInterval(timer);
}, 100);
})();
