(function () {
  'use strict';
  var L = window.Logic, O = window.OlaXlsx;
  var S = {
    files: [], cat: { map: {}, alias: {}, provs: {} }, tab: 'hoy', onlyUn: false, orderDate: '', busy: 0,
    gmail: { q: 'has:attachment newer_than:3d', threads: [], msg: '', open: {} },
    hist: { orders: {}, seen: {}, boxes: {}, status: {}, picked: {}, disp: {} }, sync: { state: 'idle', msg: '', last: '', added: 0 }, tf: { chain: '', city: '', oc: '', date: '', q: '' }, histRef: null, done: {}, sample: null, images: false, dl: null, mcp: null, db: null, catRef: null, dbMsg: '', filter: ''
  };
  var uid = 0;

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return L.fmt(n); }
  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 3200); }

  // ---------------------------------------------------------------- catálogo (guardado)
  function normCat(c) { c = c || {}; return { map: c.map || {}, alias: c.alias || {}, provs: c.provs || {} }; }
  var saveTimer = null, saving = Promise.resolve();
  function saveCat() {
    try { localStorage.setItem('catalog_v1', JSON.stringify(S.cat)); } catch (e) {}
    if (!S.catRef) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saving = saving.then(function () { return S.catRef.set(JSON.parse(JSON.stringify(S.cat))); })
        .catch(function (e) { S.dbMsg = 'No se pudo guardar el catálogo compartido (' + (e && e.code || 'error') + '). Quedó guardado solo en este navegador.'; renderAll(); });
    }, 500);
  }
  function setProv(key, row, value) {
    value = String(value || '').trim().toUpperCase();
    var e = S.cat.map[key] || (S.cat.map[key] = { n: row.name, a: row.ara || '' });
    if (!e.n) e.n = row.name;
    if (!e.c && row.caja) e.c = row.caja;
    e.p = value;
    if (value && !S.cat.provs[value]) S.cat.provs[value] = { email: '' };
    saveCat();
  }


  // ---------------------------------------------------------------- historial (cuentas)
  function ordGroup(o) { return (o.chain || '') + '|' + (o.oc || o.name || ''); }
  function ordBetter(o, b) { return (o.totalOk === true && b.totalOk !== true) || ((o.totalOk === true) === (b.totalOk === true) && String(o.savedAt || '') > String(b.savedAt || '')); }
  // Garantía anti-repetidos: una sola orden por cadena + número de OC, sin importar cómo esté escrita la ciudad.
  function dedupOrders(map) {
    var best = {}, out = {}, n = 0;
    Object.keys(map).forEach(function (k) { var o = map[k], g = ordGroup(o); if (!best[g]) best[g] = k; else if (ordBetter(o, map[best[g]])) best[g] = k; });
    Object.keys(best).forEach(function (g) {
      var w = map[best[g]];
      Object.keys(map).forEach(function (k) { if (k !== best[g] && ordGroup(map[k]) === g) { var l = map[k]; if (!w.driveId && l.driveId) w.driveId = l.driveId; if (!w.mailUrl && l.mailUrl) w.mailUrl = l.mailUrl; n++; } });
      out[best[g]] = w;
    });
    return { orders: out, removed: n };
  }
  function normHist(h) { h = h ? JSON.parse(JSON.stringify(h)) : {}; var d = dedupOrders(h.orders || {}); return { orders: d.orders, seen: h.seen || {}, boxes: h.boxes || {}, status: h.status || {}, picked: h.picked || {}, disp: h.disp || {}, costs: h.costs || {}, users: h.users || {}, ver: h.ver || 0, dedup: d.removed }; }
  function findOrderKey(f) { var g = (f.chain || '') + '|' + (f.oc || f.name || ''), ks = Object.keys(S.hist.orders); for (var i = 0; i < ks.length; i++) if (ordGroup(S.hist.orders[ks[i]]) === g) return ks[i]; return null; }
  var hTimer = null, hSaving = Promise.resolve();
  function saveHist() {
    try { localStorage.setItem('hist_v1', JSON.stringify(S.hist)); } catch (e) {}
    if (!S.histRef) return;
    clearTimeout(hTimer);
    hTimer = setTimeout(function () {
      hSaving = hSaving.then(function () { return S.histRef.set(JSON.parse(JSON.stringify(S.hist))); })
        .catch(function () { S.dbMsg = 'No se pudo guardar el historial compartido; quedó solo en este navegador.'; });
    }, 500);
  }
  function orderId(f) { return (f.oc || f.name) + '|' + (f.city || ''); }
  function syncHist() {
    var changed = false;
    S.files.forEach(function (f) {
      var id = findOrderKey(f) || orderId(f), rec = {
        id: id, chain: f.chain || '', oc: f.oc || '', city: f.city || '', date: f.date || '', poDate: f.poDate || '', name: f.name, source: f.source,
        declared: f.declared == null ? null : f.declared, driveId: f.driveId || (S.hist.orders[id] || {}).driveId || '', mailUrl: f.mailUrl || (S.hist.orders[id] || {}).mailUrl || '', unread: f.unread || 0, totalOk: f.totalOk === undefined ? null : f.totalOk, savedAt: (S.hist.orders[id] || {}).savedAt || new Date().toISOString(),
        lines: f.lines.map(function (l) { return { sku: l.sku || '', key: l.key, name: l.name, unit: l.unit, caja: l.caja || '', emb: l.emb || 0, cx: l.cx, qty: l.qty, price: l.price || 0 }; })
      };
      var old = S.hist.orders[id];
      if (!old || JSON.stringify(old.lines) !== JSON.stringify(rec.lines) || old.city !== rec.city || old.date !== rec.date || (old.poDate || '') !== rec.poDate || (old.driveId || '') !== rec.driveId || (old.mailUrl || '') !== rec.mailUrl || (old.unread || 0) !== rec.unread || (old.totalOk === undefined ? null : old.totalOk) !== rec.totalOk) { S.hist.orders[id] = rec; changed = true; }
    });
    if (changed) saveHist();
  }
  function histOrders() {
    var best = {};
    Object.keys(S.hist.orders).forEach(function (k) {
      var o = S.hist.orders[k], g = ordGroup(o), b = best[g];
      // misma orden guardada dos veces (p. ej. ciudad escrita distinto): se queda la verificada / la más reciente
      if (!b || (o.totalOk === true && b.totalOk !== true) || ((o.totalOk === true) === (b.totalOk === true) && String(o.savedAt || '') > String(b.savedAt || ''))) best[g] = o;
    });
    return Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) {
      return dkey(b.date) - dkey(a.date) || (a.city < b.city ? -1 : 1);
    });
  }
  function dateOf(d) { return d.date; }
  // en la pantalla Hoy el calendario puede ir por fecha de entrega (normal) o por fecha de pedido; sin fecha de pedido se usa la de entrega
  function hdate(d) { return S.dateMode === 'ped' ? (d.recv || d.date) : d.date; }
  function modeLbl() { return S.dateMode === 'ped' ? 'pedidos del ' : 'entrega '; }
  function defaultDay(dates) {
    var n = new Date(), t = +(n.getFullYear() + ('0' + (n.getMonth() + 1)).slice(-2) + ('0' + n.getDate()).slice(-2)), up = dates.filter(function (d) { return dkey(d) >= t; }).sort(function (a, b) { return dkey(a) - dkey(b); });
    return up[0] || dates[0];
  }
  function dayTxt() { return S.hoyDate === '*' ? 'todos los días' : S.hoyDate; }
  function dm(d) { var m = /^(\d{2})\.(\d{2})/.exec(d || ''); return m ? m[1] + '/' + m[2] : '—'; }
  function dkey(d) { var m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(d || ''); return m ? +(m[3] + m[2] + m[1]) : 0; }
  // filas de detalle (una por producto y orden) con proveedor según el catálogo actual
  function histDetail() {
    var out = [];
    histOrders().forEach(function (o) {
      var cons = L.consolidate([{ city: o.city, lines: o.lines }], S.cat);
      cons.rows.forEach(function (r) {
        var ch = o.chain || (o.lines[0] && o.lines[0].sku ? 'Ara' : ''), pr = L.presentation(r.name, r.unit, ch);
        var bx = O.lookup(r.ara || r.name, S.hist.boxes), cxv = r.cx, embv = r.emb || 0, est = false;
        out.push({ frozen: /SOLEI|CONGELAD/.test(L.norm(r.name)), kgq: (ch === 'Éxito' || pr.kgQty || /SOLEI|CONGELAD/.test(L.norm(r.name))) ? 'ex' : pr.g ? 'es' : 'no', ref: bx ? bx.ref : '', cap: bx ? O.capOf(bx.ref) : 0, est: false, known: !!bx, chain: ch, pres: pr.pres, word: pr.word, emb: embv, kg: (ch === 'Éxito' || pr.kgQty) ? r.qty : (pr.g ? Math.round(r.qty * pr.g) / 1000 : 0), date: o.date, recv: o.poDate || '', ara: r.ara || '', oc: o.oc, city: o.city, prov: L.provOf(r, S.cat) || '', sku: /^N:/.test(r.key) ? '' : r.key, name: r.name, unit: r.unit, cx: cxv, qty: r.qty, price: r.qty ? Math.round(r.val / r.qty) : 0, val: r.val || 0 });
      });
    });
    return out;
  }
  function dlLedger() {
    var ords = histOrders(), det = histDetail(), wb = XLSX.utils.book_new();
    var A = [['Fecha entrega', 'OC', 'Ciudad', 'Productos', 'Cajas', 'Valor neto sin IVA (COP)']];
    ords.forEach(function (o, i) {
      var r = i + 2;
      A.push([o.date, o.oc, o.city, { t: 'n', v: o.lines.length, f: 'COUNTIFS(Detalle!B:B,B' + r + ',Detalle!C:C,C' + r + ')' },
        { t: 'n', v: o.lines.reduce(function (a, l) { return a + l.cx; }, 0), f: 'SUMIFS(Detalle!H:H,Detalle!B:B,B' + r + ',Detalle!C:C,C' + r + ')' },
        { t: 'n', v: o.lines.reduce(function (a, l) { return a + l.qty * l.price; }, 0), f: 'SUMIFS(Detalle!K:K,Detalle!B:B,B' + r + ',Detalle!C:C,C' + r + ')' }]);
    });
    var n = ords.length + 1;
    A.push(['TOTAL', '', '', '', { t: 'n', f: 'SUM(E2:E' + n + ')' }, { t: 'n', f: 'SUM(F2:F' + n + ')' }]);
    var wsA = XLSX.utils.aoa_to_sheet(A); wsA['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 11 }, { wch: 10 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsA, 'Órdenes');
    var D = [['Fecha entrega', 'OC', 'Ciudad', 'Proveedor', 'Código Ara', 'Producto', 'Unidad', 'Cajas', 'Cantidad', 'Precio unit.', 'Valor']];
    det.forEach(function (d, i) { var r = i + 2; D.push([d.date, d.oc, d.city, d.prov, d.sku, d.name, d.unit, d.cx, d.qty, d.price, { t: 'n', v: d.qty * d.price, f: 'I' + r + '*J' + r }]); });
    var wsD = XLSX.utils.aoa_to_sheet(D); wsD['!cols'] = [{ wch: 14 }, { wch: 13 }, { wch: 15 }, { wch: 16 }, { wch: 12 }, { wch: 32 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsD, 'Detalle');
    wb.Workbook = { CalcPr: { fullCalcOnLoad: true } };
    saveXlsx(wb, 'Cuentas de pedidos.xlsx');
  }
  function cop(n) { return '$ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  var PASS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
  async function sha(t) { try { var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); } catch (e) { return 'x:' + t; } }
  function renderLocked(elId, again, title, msg) {
    var el = $(elId || '#p-ledger'); again = again || renderLedger;
    el.innerHTML = '<div class="card lock"><div style="font-size:42px">🔒</div><h2>' + (title || 'Cuentas privadas') + '</h2><p class="muted">' + (msg || 'Aquí están los valores en pesos. Escribe la clave para verlos.') + '</p><input type="password" id="pw" placeholder="Clave" autocomplete="off"><div id="pwerr" class="muted" style="color:var(--badtx);min-height:18px"></div><button class="btn" id="pwgo">Entrar</button></div>';
    var go = async function () {
      var v = $('#pw').value, okp = (await sha(v)) === PASS_HASH || ('x:' + v) === PASS_HASH;
      if (okp) { S.unlocked = true; again(); } else { $('#pwerr').textContent = 'Clave incorrecta'; $('#pw').value = ''; }
    };
    addEye($('#pw')); $('#pwgo').onclick = go; $('#pw').onkeydown = function (e) { if (e.key === 'Enter') go(); }; $('#pw').focus();
  }
  // ---- cuentas: ventas por producto, comparación de meses y ganancia (privado)
  S.lg = S.lg || { tab: 'ord', gran: 'month', rng: 'all' };
  function pkey(d) { return d.chain + '|' + L.norm(d.name); }
  function monthsOf(rows) { var o = {}; rows.forEach(function (d) { var i = dIso(d.date); if (i) o[i.slice(0, 7)] = 1; }); return Object.keys(o).sort(); }
  function inMonth(rows, m) { return rows.filter(function (d) { var i = dIso(d.date); return i && i.slice(0, 7) === m; }); }
  function pct(a, b) { if (!b) return a ? '<span class="muted">nuevo</span>' : '–'; var p = Math.round((a - b) / Math.abs(b) * 100); return '<b style="color:' + (p >= 0 ? '#1a7f37' : '#c62828') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%</b>'; }
  function prodSum(rows) { var P = {}; rows.forEach(function (d) { var k = pkey(d), p = P[k] = P[k] || { name: d.name, chain: d.chain, v: 0, q: 0, w: d.word }; p.v += d.val || d.qty * d.price; p.q += d.qty; }); return P; }
  function ledgerPro(det) {
    var g = S.lg, MS = monthsOf(det), h = '', cs = S.hist.costs = S.hist.costs || {};
    var tabs = '<div style="overflow-x:auto;margin:6px 0">' + segBtns([['ord', '🧾 Órdenes'], ['ven', '💰 Ventas por producto'], ['gan', '📈 Ganancia']], g.tab, 'data-lt') + '</div>';
    if (g.tab === 'ven') {
      var mA = g.mA && MS.indexOf(g.mA) >= 0 ? g.mA : MS[MS.length - 1], mB = g.mB && MS.indexOf(g.mB) >= 0 ? g.mB : (MS.length > 1 ? MS[MS.length - 2] : MS[0]), PA = prodSum(inMonth(det, mA)), PB = prodSum(inMonth(det, mB)), ks = {};
      Object.keys(PA).concat(Object.keys(PB)).forEach(function (k) { ks[k] = 1; });
      var list = Object.keys(ks).map(function (k) { var a = PA[k], b = PB[k]; return { k: k, name: (a || b).name, chain: (a || b).chain, a: a ? a.v : 0, b: b ? b.v : 0, qa: a ? a.q : 0, w: (a || b).w }; }).sort(function (x, y) { return Math.max(y.a, y.b) - Math.max(x.a, x.b); });
      var tA = list.reduce(function (t, r) { return t + r.a; }, 0), tB = list.reduce(function (t, r) { return t + r.b; }, 0), sel = function (id, cur) { return '<select id="' + id + '" style="font-size:16px;padding:7px">' + MS.map(function (m) { return '<option value="' + m + '"' + (m === cur ? ' selected' : '') + '>' + mLab(m) + '</option>'; }).join('') + '</select>'; };
      var chn = function (c) { var a = 0, b = 0; list.forEach(function (r) { if (r.chain === c) { a += r.a; b += r.b; } }); return '<tr><td style="padding:6px">Subtotal ' + esc(c) + '</td><td class="n">' + cop(a) + '</td><td class="n">' + cop(b) + '</td><td class="n">' + pct(a, b) + '</td><td></td></tr>'; };
      h += tabs + '<div class="card"><h2 style="margin:0 0 6px">💰 Precios de venta de OLA por producto</h2><p class="muted" style="margin:0 0 8px">Valor neto sin IVA, por fecha de entrega, tal como viene en cada orden.</p><div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap"><label class="muted" style="font-size:11px">Mes principal<br>' + sel('lgA', mA) + '</label><label class="muted" style="font-size:11px">Compararlo con<br>' + sel('lgB', mB) + '</label></div>' +
        '<div class="tablewrap" style="margin-top:10px;max-height:520px"><table><thead><tr><th>Producto</th><th class="n">' + esc(mLab(mA)) + '</th><th class="n">' + esc(mLab(mB)) + '</th><th class="n">Cambio</th><th class="n">Precio prom. (' + esc(mLab(mA)) + ')</th></tr></thead><tbody>' +
        list.map(function (r) { return '<tr><td><span class="cb ' + esc(r.chain) + '" style="margin-right:6px">' + esc(r.chain) + '</span>' + esc(r.name) + '</td><td class="n">' + (r.a ? cop(r.a) : '–') + '</td><td class="n">' + (r.b ? cop(r.b) : '–') + '</td><td class="n">' + pct(r.a, r.b) + '</td><td class="n">' + (r.a && r.qa ? cop(r.a / r.qa) + ' / ' + esc(r.w || 'und') : '–') + '</td></tr>'; }).join('') +
        '</tbody><tfoot>' + chn('Ara') + chn('Éxito') + '<tr style="font-weight:800;border-top:3px solid #1F3864"><td style="padding:8px 6px">TOTAL</td><td class="n">' + cop(tA) + '</td><td class="n">' + cop(tB) + '</td><td class="n">' + pct(tA, tB) + '</td><td></td></tr></tfoot></table></div></div>';
    } else if (g.tab === 'gan') {
      var rng = g.rng && g.rng !== 'all' && MS.indexOf(g.rng) < 0 ? 'all' : (g.rng || 'all'), rows = rng === 'all' ? det : inMonth(det, rng), cost = function (d) { var c = cs[pkey(d)]; return c == null || c === '' ? null : +c * d.qty; };
      var agg = function (rr) { var v = 0, c = 0, vk = 0, miss = 0; rr.forEach(function (d) { var vv = d.val || d.qty * d.price, cc = cost(d); v += vv; if (cc == null) miss++; else { c += cc; vk += vv; } }); return { v: v, c: c, g: vk - c, vk: vk, miss: miss, m: vk ? (vk - c) / vk * 100 : 0 }; };
      var T = agg(rows), prods = {}; det.forEach(function (d) { var k = pkey(d); prods[k] = prods[k] || { k: k, name: d.name, chain: d.chain, w: d.word, price: d.price }; });
      var plist = Object.keys(prods).map(function (k) { return prods[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }); }), nCost = plist.filter(function (p) { return cs[p.k] != null && cs[p.k] !== ''; }).length;
      var keyOf = function (d) { var i = dIso(d.date); return g.gran === 'month' ? i.slice(0, 7) : g.gran === 'week' ? monOf(i) : i; }, B = {};
      rows.forEach(function (d) { if (!dIso(d.date)) return; var k = keyOf(d); (B[k] = B[k] || []).push(d); });
      var bks = Object.keys(B).sort().reverse().map(function (k) { var a = agg(B[k]); a.k = k; var no = {}; B[k].forEach(function (d) { no[d.chain + d.oc] = 1; }); a.n = Object.keys(no).length; return a; }), mx = Math.max.apply(null, bks.map(function (b) { return Math.abs(b.g); }).concat([1]));
      var lab = function (k) { return g.gran === 'month' ? mLab(k) : g.gran === 'week' ? 'Semana del ' + shortD(k) : shortD(k) + ' ' + k.slice(0, 4); };
      var OB = {}; rows.forEach(function (d) { var k = d.chain + '|' + d.oc; (OB[k] = OB[k] || { chain: d.chain, oc: d.oc, city: d.city, date: d.date, rows: [] }).rows.push(d); });
      var ol = Object.keys(OB).map(function (k) { var o = OB[k], a = agg(o.rows); a.o = o; return a; }).sort(function (x, y) { return dkey(y.o.date) - dkey(x.o.date); });
      h += tabs + '<div class="card"><h2 style="margin:0 0 6px">📈 Ganancia</h2><p class="muted" style="margin:0 0 8px">Ganancia = lo que paga la cadena (sin IVA) − lo que te cuesta el producto. Escribe abajo el costo por unidad de cada producto; sin costo no se calcula.</p>' +
        '<div style="display:flex;flex-wrap:wrap"><button class="chp' + (rng === 'all' ? ' on' : '') + '" data-lr="all">Todo</button>' + MS.map(function (m) { return '<button class="chp' + (rng === m ? ' on' : '') + '" data-lr="' + m + '">' + mLab(m) + '</button>'; }).join('') + '</div>' +
        '<div class="hero" style="margin-top:8px"><div class="kpi"><b>' + cop(T.v) + '</b><span>ventas sin IVA</span></div><div class="kpi"><b>' + cop(T.c) + '</b><span>costo (productos con costo)</span></div><div class="kpi"><b style="color:' + (T.g >= 0 ? '#1a7f37' : '#c62828') + '">' + cop(T.g) + '</b><span>ganancia</span></div><div class="kpi"><b>' + T.m.toFixed(1).replace('.', ',') + '%</b><span>margen</span></div></div>' +
        (T.miss ? '<div class="banner" style="background:#fff3cd;border-color:#e0a800">⚠️ ' + T.miss + ' línea(s) sin costo no suman a la ganancia (venta con costo: ' + cop(T.vk) + ' de ' + cop(T.v) + '). Llena el costo de esos productos abajo.</div>' : '') + '</div>' +
        '<details class="card"' + (nCost < plist.length ? ' open' : '') + '><summary style="cursor:pointer;font-weight:700">🏷️ Costo por unidad de cada producto (' + nCost + ' de ' + plist.length + ')</summary><p class="muted" style="margin:6px 0">En COP, por la misma unidad con que se vende (la que dice «Precio venta»). Se guarda solo.</p><div class="tablewrap" style="max-height:420px"><table><thead><tr><th>Producto</th><th class="n">Precio venta</th><th class="n">Tu costo</th><th class="n">Margen</th></tr></thead><tbody>' +
        plist.map(function (p) { var c = cs[p.k], mg = c != null && c !== '' && p.price ? ((p.price - c) / p.price * 100).toFixed(1).replace('.', ',') + '%' : '–'; return '<tr><td><span class="cb ' + esc(p.chain) + '" style="margin-right:6px">' + esc(p.chain) + '</span>' + esc(p.name) + '</td><td class="n">' + (p.price ? cop(p.price) + ' / ' + esc(p.w || 'und') : '–') + '</td><td class="n"><input type="number" inputmode="decimal" min="0" step="any" data-cost="' + esc(p.k) + '" value="' + (c == null ? '' : c) + '" style="width:96px;font-size:16px;padding:5px;text-align:right"></td><td class="n">' + mg + '</td></tr>'; }).join('') + '</tbody></table></div></details>' +
        '<div class="card"><div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h3 style="margin:0">Ganancia por período</h3>' + segBtns([['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']], g.gran, 'data-lg') + '</div><div class="tablewrap" style="max-height:380px;margin-top:8px"><table><thead><tr><th>Período</th><th class="n">Órdenes</th><th class="n">Ventas</th><th class="n">Costo</th><th class="n">Ganancia</th><th class="n">Margen</th></tr></thead><tbody>' +
        bks.map(function (b) { var w = Math.round(Math.abs(b.g) / mx * 100); return '<tr><td>' + esc(lab(b.k)) + (b.miss ? ' <span class="chip warn">' + b.miss + ' sin costo</span>' : '') + '</td><td class="n">' + b.n + '</td><td class="n">' + cop(b.v) + '</td><td class="n">' + cop(b.c) + '</td><td class="n"><b style="color:' + (b.g >= 0 ? '#1a7f37' : '#c62828') + '">' + cop(b.g) + '</b><div style="height:5px;border-radius:3px;margin-top:3px;width:' + w + '%;background:' + (b.g >= 0 ? '#2e8b57' : '#c62828') + ';margin-left:auto"></div></td><td class="n">' + b.m.toFixed(1).replace('.', ',') + '%</td></tr>'; }).join('') + '</tbody></table></div></div>' +
        '<div class="card"><h3 style="margin:0 0 8px">Ganancia por pedido</h3><div class="tablewrap" style="max-height:420px"><table><thead><tr><th>Entrega</th><th>Cadena · OC</th><th>Ciudad</th><th class="n">Venta</th><th class="n">Costo</th><th class="n">Ganancia</th><th class="n">Margen</th></tr></thead><tbody>' +
        ol.map(function (a) { var o = a.o; return '<tr><td>' + esc(o.date) + '</td><td>' + esc(o.chain) + ' · ' + esc(o.oc) + '</td><td>' + esc(o.city) + '</td><td class="n">' + cop(a.v) + '</td><td class="n">' + cop(a.c) + '</td><td class="n"><b style="color:' + (a.g >= 0 ? '#1a7f37' : '#c62828') + '">' + (a.vk ? cop(a.g) : '–') + '</b>' + (a.miss ? ' <span class="chip warn">' + a.miss + ' sin costo</span>' : '') + '</td><td class="n">' + (a.vk ? a.m.toFixed(1).replace('.', ',') + '%' : '–') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    } else h += tabs;
    return h;
  }
  function ledgerBind(el) {
    var g = S.lg, go = function () { renderLedger(); };
    el.querySelectorAll('[data-lt]').forEach(function (b) { b.onclick = function () { g.tab = b.dataset.lt; go(); }; });
    el.querySelectorAll('[data-lg]').forEach(function (b) { b.onclick = function () { g.gran = b.dataset.lg; go(); }; });
    el.querySelectorAll('[data-lr]').forEach(function (b) { b.onclick = function () { g.rng = b.dataset.lr; go(); }; });
    var a = $('#lgA'), b = $('#lgB'); if (a) a.onchange = function () { g.mA = this.value; go(); }; if (b) b.onchange = function () { g.mB = this.value; go(); };
    el.querySelectorAll('[data-cost]').forEach(function (i) { i.onchange = function () { var v = this.value; if (v === '') delete S.hist.costs[i.dataset.cost]; else S.hist.costs[i.dataset.cost] = +v; saveHist(); go(); }; });
  }
  function renderLedger() {
    if (!S.unlocked) { renderLocked(); return; }
    var el = $('#p-ledger'), ords = histOrders(), det = histDetail(), h = '';
    if (!ords.length) { el.innerHTML = '<div class="card"><h2>Cuentas</h2><p class="muted">Aquí se van guardando solas todas las órdenes que leas (fecha, OC, ciudad, cajas y valor). Todavía no hay ninguna.</p></div>'; return; }
    var tcx = 0, tval = 0; det.forEach(function (d) { tcx += d.cx; tval += d.qty * d.price; });
    stStyle(); var lp = ledgerPro(det), onlyOrd = S.lg.tab === 'ord';
    h += '<div class="hero"><div class="kpi"><b>' + ords.length + '</b><span>órdenes guardadas</span></div><div class="kpi"><b>' + fmt(tcx) + '</b><span>cajas en total</span></div><div class="kpi"><b>' + cop(tval) + '</b><span>valor neto sin IVA</span></div></div>';
    var heroH = h; h = '';
    h += '<div class="card row" style="justify-content:space-between"><div><h2>Órdenes recibidas</h2><span class="muted">Se guardan automáticamente al leer cada pedido. El Excel trae fórmulas (suma por orden).</span></div><div class="row"><button class="btn" id="dlLed">Descargar Excel de cuentas</button><button class="btn" id="dlLedOla">Excel con formato y precios</button><button class="btn sec" id="lockBtn">Bloquear</button></div></div>';
    h += '<div class="tablewrap" style="max-height:340px"><table><thead><tr><th>Entrega</th><th>OC</th><th>Ciudad</th><th class="n">Productos</th><th class="n">Cajas</th><th class="n">Valor neto</th><th>Control</th><th></th></tr></thead><tbody>';
    ords.forEach(function (o) {
      var cx = 0, val = 0; o.lines.forEach(function (l) { cx += l.cx; val += l.qty * l.price; });
      var ok = o.declared == null ? '' : Math.abs(o.declared - val) < 1 ? '<span class="chip">Coincide con el PDF</span>' : '<span class="chip bad">No coincide</span>';
      h += '<tr><td>' + esc(o.date) + '</td><td>' + esc(o.oc) + '</td><td>' + esc(o.city) + '</td><td class="n">' + o.lines.length + '</td><td class="n">' + fmt(cx) + '</td><td class="n">' + (val ? cop(val) : '–') + '</td><td>' + ok + '</td><td><button class="btn sec sm" data-hdel="' + esc(o.id) + '">Quitar</button></td></tr>';
    });
    h += '</tbody></table></div>';
    el.innerHTML = heroH + lp.replace('</div>', ' <button class="btn sec sm" id="lockBtn2">🔒 Bloquear</button></div>') + (onlyOrd ? h : '');
    ledgerBind(el); if ($('#lockBtn2')) $('#lockBtn2').onclick = function () { S.unlocked = false; renderLedger(); };
    if (!onlyOrd) return;
    $('#dlLed').onclick = dlLedger; $('#dlLedOla').onclick = function () { dlOla(histDetail(), true, 'Cuentas OLA con precios.xlsx'); };
    $('#lockBtn').onclick = function () { S.unlocked = false; renderLedger(); };
    el.querySelectorAll('[data-hdel]').forEach(function (b) { b.onclick = function () { delete S.hist.orders[b.dataset.hdel]; saveHist(); renderLedger(); }; });
  }



  // ---------------------------------------------------------------- sincronización automática (carpeta de Drive)
  var FOLDER = 'Pedidos OLA';
  function drvErr(e) {
    var c = e && e.code;
    if (c === 'server_not_connected') return 'Google Drive no está conectado en tu cuenta de Claude (Ajustes → Conectores).';
    if (c === 'needs_reauth') return 'Vuelve a conectar Google Drive en Ajustes → Conectores.';
    if (c === 'approval_required' || c === 'not_in_manifest' || c === 'consent_required') return 'Falta permitir que esta página lea Google Drive.';
    return 'No se pudo leer Drive' + (c ? ' (' + c + ')' : '') + (e && e.message ? ': ' + String(e.message).slice(0, 160) : '') + (e && e.step ? ' [paso: ' + e.step + ']' : '') + '.';
  }
  function drvFiles(r) { var p = r && r.payload; return (p && p.files) || (Array.isArray(p) ? p : []); }
  function drvB64(r) {
    var p = r && r.payload; if (typeof p === 'string') return p;
    return pick(p, ['content', 'data', 'base64', 'base64Content', 'fileContent', 'bytes']) || '';
  }

  // ---- lectura directa del correo (solo lectura: nunca se modifica nada en Gmail)
  function mimeFiles(raw) {
    var s = String(raw).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var bin = atob(s), out = [];
    function walk(txt) {
      var i = txt.search(/\r?\n\r?\n/); if (i < 0) return;
      var head = txt.slice(0, i).replace(/\r?\n[ \t]+/g, ' '), body = txt.slice(i).replace(/^\r?\n\r?\n/, '');
      var ct = (/^content-type:\s*([^\r\n]*)/im.exec(head) || [])[1] || '', cd = (/^content-disposition:\s*([^\r\n]*)/im.exec(head) || [])[1] || '', te = (/^content-transfer-encoding:\s*([^\r\n;]*)/im.exec(head) || [])[1] || '';
      var bm = /boundary="?([^";\s]+)"?/i.exec(ct);
      if (/multipart\//i.test(ct) && bm) {
        var parts = body.split('--' + bm[1]);
        for (var k = 1; k < parts.length; k++) { if (/^--/.test(parts[k])) break; walk(parts[k].replace(/^\r?\n/, '')); }
        return;
      }
      var fm = /filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i.exec(cd) || /name="?([^";\r\n]+)"?/i.exec(ct);
      if (fm && /base64/i.test(te)) {
        var nm = fm[1].trim(), enc = /^=\?utf-8\?b\?(.+)\?=$/i.exec(nm); if (enc) { try { nm = decodeURIComponent(escape(atob(enc[1]))); } catch (e) {} }
        var b = atob(body.replace(/[^A-Za-z0-9+\/=]/g, '')), u = new Uint8Array(b.length);
        for (var j = 0; j < b.length; j++) u[j] = b.charCodeAt(j);
        out.push({ name: nm, data: u });
      }
    }
    walk(bin);
    return out;
  }
  async function mailSync(st) {
    var q = '(from:jeronimo-martins.com OR from:grupo-exito.com) has:attachment ' + 'after:2026/09/01', msgs = [], tok = '', pg = 0;
    do {
      var a = { query: q, pageSize: 50, view: 'THREAD_VIEW_MINIMAL' }; if (tok) a.pageToken = tok;
      var r = await S.mcp.callTool('Gmail', 'search_threads', a), p = (r && r.payload) || {};
      (p.threads || []).forEach(function (t) { (t.messages || []).forEach(function (m) { msgs.push({ id: m.id, ms: +m.internalDate || 0, url: m.viewUrl || '' }); }); });
      tok = p.nextPageToken || p.next_page_token || ''; pg++;
    } while (tok && pg < 16);
    var fresh = msgs.filter(function (m) { return !S.hist.seen['g:' + m.id]; });
    for (var i = 0; i < fresh.length; i++) {
      var m = fresh[i];
      try {
        S.sync.msg = 'Leyendo correo ' + (i + 1) + ' de ' + fresh.length + '…'; renderAll(); if (i && i % 10 === 0) { try { syncHist(); saveHist(); } catch (e) {} }
        var rr = await S.mcp.callTool('Gmail', 'get_message', { messageId: m.id, messageFormat: 'RAW' }), pl = rr && rr.payload;
        if (typeof pl === 'string') { try { pl = JSON.parse(pl); } catch (e) {} }
        var raw = pick(pl, ['raw']); if (!raw) throw new Error('sin contenido');
        var day = new Date(m.ms - 5 * 3600e3).toISOString().slice(0, 10), got = 0, fail = 0;
        var files = mimeFiles(raw).filter(function (f) { return /\.(pdf|xlsx|xls|xlsb|xlsm|csv)$/i.test(f.name); });
        for (var k = 0; k < files.length; k++) {
          var n0 = S.files.length; curFileId = ''; curMail = m.url; lastStatus = '';
          try { await processFile(new File([files[k].data], day + ' ' + m.id.slice(-6) + ' ' + files[k].name)); } catch (e) {}
          curMail = '';
          if (S.files.length > n0 || lastStatus === 'empty' || lastStatus === 'dup') { got++; if (lastStatus === 'empty') st.empty++; } else fail++;
        }
        if (!fail) S.hist.seen['g:' + m.id] = true; else { st.bad++; st.names.push('correo ' + m.id.slice(-6)); }
      } catch (e) { st.bad++; st.names.push('correo ' + m.id.slice(-6)); }
    }
    st.mails = fresh.length; st.found = msgs.length;
  }
  async function driveSync(manual) {
    if (!S.mcp || S.sync.state === 'run') return;
    var busyOn = false, step = 'carpeta';
    S.sync = { state: 'run', msg: 'Buscando pedidos nuevos…', last: S.sync.last, added: 0 }; renderAll();
    try {
      var fr = drvFiles(await S.mcp.callTool('Google Drive', 'search_files', { query: "mimeType = 'application/vnd.google-apps.folder' and title = '" + FOLDER + "'", pageSize: 5, excludeContentSnippets: true }));
      if (!fr.length) { S.sync = { state: 'none', msg: 'Todavía no existe la carpeta “' + FOLDER + '” en tu Drive.', last: S.sync.last, added: 0 }; renderAll(); return; }
      step = 'lista de archivos'; var list = [];
      for (var k = 0; k < fr.length; k++) {
        var tok = '', pg = 0;
        do {
          var q = { query: "parentId = '" + fr[k].id + "' and trashed = false", pageSize: 100, orderBy: 'modifiedTime desc', excludeContentSnippets: true };
          if (tok) q.pageToken = tok;
          var rr = await S.mcp.callTool('Google Drive', 'search_files', q);
          list = list.concat(drvFiles(rr)); tok = (rr && rr.payload && (rr.payload.nextPageToken || rr.payload.next_page_token)) || ''; pg++;
        } while (tok && pg < 10);
      }
      // también los pedidos sueltos que estén en la raíz de «Mi unidad» (fuera de la carpeta)
      try { var rt = await S.mcp.callTool('Google Drive', 'search_files', { query: "parentId = 'root' and trashed = false", pageSize: 100, orderBy: 'modifiedTime desc', excludeContentSnippets: true }); var have = {}; list.forEach(function (f) { have[f.id] = 1; }); drvFiles(rt).forEach(function (f) { if (!have[f.id]) list.push(f); }); } catch (e) {}
      if (S.hist.ver !== 3) { S.hist.seen = {}; S.hist.ver = 3; }
      var fresh = list.filter(function (f) { return !S.hist.seen[f.id] && /\.(pdf|xlsx|xls|xlsb|xlsm|csv)$/i.test(f.title || ''); });
      var before = histOrders().length, bad = 0, empty = 0, badNames = [];
      S.busy++; busyOn = true;
      for (var i = 0; i < fresh.length; i++) {
        S.sync.msg = 'Leyendo ' + (i + 1) + ' de ' + fresh.length + '…'; renderAll();
        try {
          step = 'descarga de ' + fresh[i].title; var b = drvB64(await S.mcp.callTool('Google Drive', 'download_file_content', { fileId: fresh[i].id }));
          if (!b) throw new Error('vacío');
          var n0 = S.files.length; curFileId = fresh[i].id; await processFile(b64ToFile(b, fresh[i].title)); curFileId = '';
          if (S.files.length > n0 || lastStatus === 'empty' || lastStatus === 'dup') { S.hist.seen[fresh[i].id] = true; if (lastStatus === 'empty') empty++; } else { bad++; badNames.push(fresh[i].title); }
        } catch (e) { bad++; badNames.push(fresh[i].title); }
      }
      var mst = { empty: 0, bad: 0, names: [], mails: 0 };
      try { S.sync.msg = 'Revisando el correo…'; renderAll(); await mailSync(mst); } catch (e) { mst.err = (e && e.message) || 'error'; }
      empty += mst.empty; bad += mst.bad; badNames = badNames.concat(mst.names);
      S.busy--; busyOn = false; syncHist(); saveHist();
      var added = histOrders().length - before;
      try { localStorage.setItem('ola_cnt', String(histOrders().length)); } catch (e) {}
      S.sync = { state: (bad || mst.err) ? 'warn' : 'ok', msg: (fresh.length || mst.mails) ? ((mst.found ? mst.found + ' correo(s) con adjuntos desde septiembre; ' + (mst.mails || 0) + ' nuevos leídos; ' : '') + added + ' pedido(s) nuevo(s) agregado(s)' + (empty ? '; ' + empty + ' archivo(s) de Éxito sin órdenes de OLA' : '') + (bad ? '; ' + bad + ' archivo(s) no se pudieron leer: ' + badNames.slice(0, 3).join(', ') : '') + (mst.err ? '; no se pudo leer el correo (' + mst.err + ')' : '')) : (mst.err ? 'No se pudo leer el correo (' + mst.err + ')' : 'No hay pedidos nuevos.'), last: new Date().toLocaleString('es-CO'), added: added };
    } catch (e) { if (busyOn) S.busy--; try { e.step = e.step || step; } catch (x) {} S.sync = { state: 'err', msg: drvErr(e), last: S.sync.last, added: 0 }; }
    renderAll();
  }
  function syncBanner() {
    var y = S.sync, ic = { run: '<span class="spin"></span>', ok: '✅', warn: '⚠️', err: '⚠️', none: 'ℹ️', idle: '' }[y.state] || '';
    if (!S.mcp) return '';
    return '<div class="banner ' + (y.state === 'err' || y.state === 'warn' ? 'bad' : 'ok') + '" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' + ic + ' <span><b>Sincronización automática:</b> ' + esc(y.msg || 'lista') + (y.last ? ' <span class="muted">· última: ' + esc(y.last) + '</span>' : '') + '</span><span style="flex:1"></span><button class="btn sec sm" id="syncNow"' + (y.state === 'run' ? ' disabled' : '') + '>Revisar ahora</button></div>';
  }

  // ---------------------------------------------------------------- tabla de pedidos (vista principal)
  function tblRows() {
    var f = S.tf, q = L.norm(f.q);
    return az(histDetail().filter(function (d) {
      return (!f.chain || d.chain === f.chain) && (!f.city || d.city === f.city) && (!f.oc || d.oc === f.oc) && (!f.date || d.date === f.date) &&
        (!q || L.norm(d.name + ' ' + d.ara + ' ' + d.sku + ' ' + d.oc + ' ' + d.city).indexOf(q) >= 0);
    }));
  }
  function opts(vals, cur, all) {
    return '<option value="">' + all + '</option>' + vals.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
  }
  function uniq(a) { var o = []; a.forEach(function (x) { if (x && o.indexOf(x) < 0) o.push(x); }); return o; }
  function renderTbl() {
    var el = $('#p-tbl'), all = histDetail();
    if (!all.length) { el.innerHTML = syncBanner() + '<div class="card"><h2>Todavía no hay pedidos</h2><p class="muted">Cuando llegue un pedido a la carpeta de Drive aparece aquí solo. También puedes agregar uno a mano.</p><button class="btn" data-go="load">+ Agregar pedido a mano</button></div>'; var sn0 = $('#syncNow'); if (sn0) sn0.onclick = function () { driveSync(true); }; return; }
    var f = S.tf;
    var chains = uniq(all.map(function (d) { return d.chain; })).sort();
    el.innerHTML = syncBanner() + '<div class="seg">' + [''].concat(chains).map(function (c) { return '<button data-chain="' + esc(c) + '" class="' + (f.chain === c ? 'on' : '') + '">' + (c || 'Todas') + '</button>'; }).join('') + '</div>' +
      '<div class="card row" style="align-items:flex-end">' +
      '<label class="muted">Ciudad<br><select id="fc">' + opts(uniq(all.map(function (d) { return d.city; })), f.city, 'Todas') + '</select></label>' +
      '<label class="muted">Entrega<br><select id="fd">' + opts(uniq(all.map(function (d) { return d.date; })), f.date, 'Todas') + '</select></label>' +
      '<label class="muted">Orden (OC)<br><select id="fo">' + opts(uniq(all.map(function (d) { return d.oc; })), f.oc, 'Todas') + '</select></label>' +
      '<label class="muted">Buscar producto<br><input id="fq" value="' + esc(f.q) + '" placeholder="tomate, papa, código…" style="width:200px"></label>' +
      '<button class="btn sec sm" id="fx">Limpiar filtros</button><span style="flex:1"></span><button class="btn" id="dlTbl">Descargar Excel (con consolidado)' + (f.chain ? ' de ' + esc(f.chain) : '') + '</button><button class="btn sec sm" id="dlTblSimple">Tabla simple</button></div>' +
      '<div id="tk"></div><div class="tablewrap"><table><thead><tr><th>Cadena</th><th>Entrega</th><th>Pedido</th><th>OC</th><th>Ciudad</th><th>Código</th><th>Producto</th><th>Presentación</th><th class="n">Cajas</th><th class="n">Und/caja</th><th class="n">Cantidad</th><th>Unidad</th><th class="n">Peso aprox. (kg)</th></tr></thead><tbody id="tb"></tbody><tfoot id="tf"></tfoot></table></div>';
    el.querySelectorAll('[data-chain]').forEach(function (b) { b.onclick = function () { S.tf.chain = b.dataset.chain; renderTbl(); }; });
    $('#fc').onchange = function () { S.tf.city = this.value; tblBody(); };
    $('#fd').onchange = function () { S.tf.date = this.value; tblBody(); };
    $('#fo').onchange = function () { S.tf.oc = this.value; tblBody(); };
    $('#fq').oninput = function () { S.tf.q = this.value; tblBody(); };
    $('#fx').onclick = function () { S.tf = { chain: '', city: '', oc: '', date: '', q: '' }; renderTbl(); };
    $('#dlTbl').onclick = dlTblOla; if ($('#dlTblSimple')) $('#dlTblSimple').onclick = dlTbl;
    var sn = $('#syncNow'); if (sn) sn.onclick = function () { driveSync(true); };
    tblBody();
  }
  function tblBody() {
    var rows = tblRows(), cx = 0, kg = 0, words = {}, h = '', pend = false;
    rows.forEach(function (d) {
      cx += d.cx; kg += d.kg; words[d.word] = (words[d.word] || 0) + d.qty; if (d.word === 'por confirmar') pend = true;
      h += '<tr class="r-' + esc(d.chain) + '"><td><span class="cb ' + esc(d.chain) + '">' + esc(d.chain) + '</span></td><td>' + esc(d.date) + '</td><td>' + esc(d.recv) + '</td><td>' + srcLink(d.chain, d.oc, d.city, '📄') + '</td><td>' + esc(d.city) + '</td><td>' + esc(d.sku) + '</td><td><b>' + esc(d.ara || d.name) + '</b></td><td>' + esc(d.pres || '–') + '</td><td class="n">' + (d.cx ? fmt(d.cx) : '–') + '</td><td class="n">' + (d.emb ? fmt(d.emb) : '–') + '</td><td class="n"><b>' + fmt(d.qty) + '</b></td><td>' + esc(d.word) + '</td><td class="n">' + (d.kg ? fmt(d.kg) : '–') + '</td></tr>';
    });
    $('#tb').innerHTML = h || '<tr><td colspan="13" class="muted">Ningún producto con esos filtros.</td></tr>';
    $('#tf').innerHTML = '<tr><td colspan="8">TOTAL (' + rows.length + ' líneas)</td><td class="n">' + fmt(cx) + '</td><td></td><td colspan="2">' + Object.keys(words).map(function (u) { return fmt(words[u]) + ' ' + u; }).join(' · ') + '</td><td class="n">' + fmt(kg) + '</td></tr>';
    $('#tk').innerHTML = '<p class="muted" style="margin:0 0 8px">' + rows.length + ' líneas' + (kg ? ' · ' + wk(kg) + ' aprox.' : '') + '</p>';
  }
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('No se pudo cargar ' + src)); }; document.head.appendChild(s); }); }
  async function dlOla(rows, prices, filename, extra) {
    if (!rows.length) { toast('No hay pedidos para exportar con esos filtros.'); return; }
    if (!S.dl) { toast('La descarga no está disponible en esta vista.'); return; }
    try {
      toast('Armando el Excel…');
      if (!window.ExcelJS) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js');
      var wb = window.OlaXlsx.build(window.ExcelJS, rows, Object.assign({ prices: prices, dateText: function (d) { return L.addDays(d, 0) || d; } }, extra || {}));
      var buf = await wb.xlsx.writeBuffer();
      await S.dl.save({ filename: filename, data: new Uint8Array(buf) });
      toast('Archivo listo: ' + filename);
    } catch (e) { if (!e || e.code !== 'declined') toast('No se pudo armar el Excel: ' + (e && e.message || e)); }
  }

  // ---------------------------------------------------------------- pantalla "Hoy"
  var CITY_COL = { BARRANQUILLA: '#FFD966', MONTERIA: '#A9D08E', VALLEDUPAR: '#F4B183', CARTAGENA: '#9DC3E6', MEDELLIN: '#B4A7D6', CUCUTA: '#F4A6CF' };
  var STAT = ['nuevo', 'visto', 'armado'], STAT_T = { nuevo: '🔴 Nuevo', visto: '🟡 Visto', armado: '🟢 Armado' };

  // ---- WhatsApp y lista de alistamiento
  function srcLink(chain, oc, city, label) {
    var r = S.hist.orders[oc + '|' + city] || histOrders().filter(function (x) { return x.oc === oc; })[0], href = r && (r.driveId ? 'https://drive.google.com/file/d/' + encodeURIComponent(r.driveId) + '/view' : r.mailUrl); if (!href) return esc(oc);
    return esc(oc) + ' <a target="_blank" rel="noopener" title="Abrir el documento original para comparar" href="' + esc(href) + '">' + (label || '📄 original') + '</a>';
  }
  function ordLinks(o) {
    var a = [];
    if (o.driveId) a.push('<a target="_blank" rel="noopener" href="https://drive.google.com/file/d/' + encodeURIComponent(o.driveId) + '/view">📄 Abrir el original (Drive)</a>');
    if (o.mailUrl) a.push('<a target="_blank" rel="noopener" href="' + esc(o.mailUrl) + '">✉️ Abrir el correo</a>');
    if (!a.length) a.push('<a target="_blank" rel="noopener" href="https://mail.google.com/mail/u/0/#search/' + encodeURIComponent(o.oc) + '">✉️ Buscar en Gmail</a>', '<a target="_blank" rel="noopener" href="https://drive.google.com/drive/search?q=' + encodeURIComponent(o.oc) + '">📁 Buscar en Drive</a>');
    return a.join(' · ');
  }
  function az(rows) { return rows.slice().sort(function (x, y) { return String(x.name).localeCompare(String(y.name), 'es', { sensitivity: 'base', numeric: true }); }); }
  // un solo renglón por producto: si el mismo producto viene en dos órdenes de la misma ciudad se suma (y se guarda de cuáles órdenes viene)
  function mergeRows(rows) {
    var m = {}, out = [];
    rows.forEach(function (d) {
      var k = [d.chain, L.norm(d.name), d.word || '', d.emb || 0].join('|'), g = m[k];
      if (!g) { g = m[k] = Object.assign({}, d, { qty: 0, cx: 0, kg: 0, parts: [] }); out.push(g); }
      g.qty += d.qty || 0; g.cx += d.cx || 0; g.kg += d.kg || 0; g.parts.push(d);
    });
    return out;
  }
  function waLink(t) { return 'https://wa.me/?text=' + encodeURIComponent(t); }
  function waCity(c, rows) {
    rows = mergeRows(az(rows));
    var t = '*Pedido ' + c + '* · ' + modeLbl() + dayTxt() + '\n' + rows.length + ' productos\n';
    az(rows).forEach(function (d) { t += '• ' + d.name + ': ' + qtyEq(d) + (d.chain ? ' (' + d.chain + ')' : '') + '\n'; });
    return t;
  }
  // mensaje de WhatsApp de lo buscado: primero cada ciudad con sus productos y al final el total
  function waSearch(rows, label) {
    var cs = uniq(rows.map(function (d) { return d.city; })).sort(function (a, b) { return a.localeCompare(b, 'es', { sensitivity: 'base' }); });
    var t = '*Pedido: ' + label + '* · ' + modeLbl() + dayTxt() + '\n';
    cs.forEach(function (c) {
      t += '\n*' + c + '*\n';
      mergeRows(az(rows.filter(function (d) { return d.city === c; }))).forEach(function (d) { t += '• ' + d.name + ': ' + qtyEq(d) + (d.chain ? ' (' + d.chain + ')' : '') + '\n'; });
    });
    var cr = consRows(rows), kg = 0; cr.forEach(function (p) { kg += p.kg || 0; });
    t += '\n*TOTAL*\n';
    cr.forEach(function (p) { t += '• ' + p.name + ': ' + consQty(p, p.qty, p.cx, p.kg).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() + '\n'; });
    return t + cr.length + ' producto(s)' + (kg ? ' · ≈ ' + wk(kg) : '') + ' · ' + cs.length + ' destino(s)\n';
  }
  function waDay(base, cities) {
    var t = '*Despacho ' + (S.dateMode === 'ped' ? 'pedidos del ' : '') + dayTxt() + '*\n';
    cities.forEach(function (c) { var r = base.filter(function (d) { return d.city === c; }), ords = {}, kg = 0; r.forEach(function (d) { ords[d.chain + ' ' + d.oc] = 1; kg += d.kg; }); t += '• ' + c + ': ' + r.length + ' productos' + (kg ? ' · ' + wk(kg) + '' : '') + ' (' + Object.keys(ords).join(', ') + ')\n'; });
    return t;
  }
  function pkKey(c, d, i) { return d.date + '|' + c + '|' + d.chain + d.oc + '|' + d.name; }
  // la papa sin lavar se cuenta en costales; el resto de productos en canastillas
  function cxWord(name, short) { return 'CX'; }
  function isCostal(name) { return /PAPA SIN LAVAR/.test(L.norm(name)); }
  // equivalencias de empaque: papa sin lavar = 12 kg por pucha (costal); tomate de árbol a granel = 6 kg por canastilla.
  // Se SUMAN a lo que ya se muestra, no lo reemplazan.
  function eqOf(name, kg) {
    var e = O.eqOf(name, kg); return e ? e.replace(/^(\d+),(\d)/, '$1,$2').replace(/^(\d{4,})/, function (m) { return fmt(+m); }) : '';
  }
  function eqTxt(d) {
    if (d.chain === 'Éxito' || d.word === 'kilos') return eqOf(d.name, d.kg || d.qty);
    // zanahoria en paquetes/bolsas: 12 por CX (solo si la línea no trae ya sus CX)
    if (/ZANAHORIA/.test(L.norm(d.name)) && !d.cx && /PAQUETE|PQT|BOLSA/.test(L.norm(d.name)) && d.qty > 0) { var r = Math.round(d.qty / 12 * 10) / 10; return String(r).replace('.', ',') + ' CX'; }
    return '';
  }
  function qtyEq(d) { var e = eqTxt(d); return qtyTxt(d) + (e ? ' (= ' + e + ')' : ''); }
  function qtyTxt(d) {
    if (d.chain === 'Éxito' || d.word === 'kilos') return wk(d.qty);
    var w = d.word || 'unid.';
    return (d.cx && d.emb ? fmt(d.cx) + ' ' + cxWord(d.name) + ' × ' + fmt(d.emb) + ' = ' : '') + fmt(d.qty) + ' ' + w;
  }
  function pkKeys(c, g) { return g.parts.map(function (d) { return pkKey(c, d); }); }
  // avance de una ciudad: cuántos productos (ya unidos) están alistados
  function pickInfo(c, rows) {
    var g = mergeRows(rows), n = 0;
    g.forEach(function (x) { if (pkKeys(c, x).every(function (k) { return S.hist.picked[k]; })) n++; });
    return { n: n, t: g.length };
  }
  function progHtml(c, rows) {
    var p = pickInfo(c, rows), kg = 0; rows.forEach(function (d) { kg += d.kg || 0; });
    return '<div class="cprog" data-prog="' + esc(c) + '"><div class="cprog-t"><span><b>' + p.t + '</b> producto' + (p.t === 1 ? '' : 's') + (kg ? ' · ' + wk(kg) : '') + '</span><span data-cnt="' + esc(c) + '">' + p.n + ' / ' + p.t + ' alistados</span></div><div class="cbar"><i style="width:' + (p.t ? Math.round(100 * p.n / p.t) : 0) + '%"></i></div></div>';
  }
  // cubicaje (solo Ara): cajas por tipo, estibas, cubicaje y peso con empaque, como el cuadro de abajo del Excel
  function n1(x, d) { return (+x || 0).toLocaleString('es-CO', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function cubHtml(t, big) {
    if (!t || !t.cx) return '';
    var est = n1(t.est2) + ' estibas si se arma una por producto';
    var tipos = [['Medianas', t.MEDIANA], ['Minis', t.MINI], ['Bultos 18×20×25', t.A], ['Bultos ×12', t.B]].filter(function (x) { return x[1] > 0; }).map(function (x) { return n1(x[1]) + ' ' + x[0].toLowerCase(); }).join(' · ');
    return '<div class="cub' + (big ? ' big' : '') + '"><div class="cub-t"><b>📦 ' + n1(t.cx) + ' cajas</b><span>' + n1(t.est1, 1) + ' estibas</span><span>cubicaje ' + n1(t.cub, 1) + '</span></div>' +
      '<div class="cub-s">' + tipos + '</div><div class="cub-s">' + est + ' · peso con empaque ' + wk(t.total) + '</div></div>';
  }
  function checkList(c, rows) {
    var g = mergeRows(rows), GR = (O.GROUPS || []).concat(['OTROS']), by = {}, order = [];
    g.forEach(function (d) { var k = O.groupOf ? O.groupOf(d.name) : 'PRODUCTOS'; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(d); });
    order.sort(function (a, b) { var x = GR.indexOf(a), y = GR.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
    var nice = { 'HORTALIZAS Y VERDURAS': 'Hortalizas y verduras' };
    var doneG = function (k) { return by[k].every(function (d) { return pkKeys(c, d).every(function (x) { return S.hist.picked[x]; }); }); };
    order.sort(function (a, b) { return (doneG(a) ? 1 : 0) - (doneG(b) ? 1 : 0); });   // grupos ya alistados al final
    var h = '<div class="ckl' + (S.pendOnly ? ' pend' : '') + '" data-ckl="' + esc(c) + '"><div class="cktool"><div class="seg" style="margin:0"><button data-pf="all"' + (S.pendOnly ? '' : ' class="on"') + '>Todos</button><button data-pf="pend"' + (S.pendOnly ? ' class="on"' : '') + '>Pendientes</button></div><input type="search" data-lq="' + esc(c) + '" placeholder="🔍 Filtrar en ' + esc(c) + '"></div><div class="ckcols">';
    order.forEach(function (k) {
      var items = by[k].map(function (d) { var ks = pkKeys(c, d); return { d: d, ks: ks, on: ks.every(function (x) { return S.hist.picked[x]; }) }; });
      items.sort(function (a, b) { return (a.on ? 1 : 0) - (b.on ? 1 : 0); });   // los pendientes primero al abrir
      var done = items.filter(function (x) { return x.on; }).length, kg = 0; items.forEach(function (x) { kg += x.d.kg || 0; });
      h += '<details class="grp' + (done === items.length ? ' alldone' : '') + '"' + (done === items.length ? '' : ' open') + '><summary><span class="gn">' + esc(nice[k] || (k.charAt(0) + k.slice(1).toLowerCase())) + '</span><span class="gs muted">' + (kg ? wk(kg) + ' · ' : '') + '<span data-gc>' + done + '/' + items.length + '</span></span></summary>';
      items.forEach(function (x) {
        var d = x.d, qt = qtyTxt(d), sub = [];
        if (d.parts.length > 1) sub.push(d.parts.map(function (p) { return 'OC ' + esc(p.oc) + ': ' + esc(qtyTxt(p)); }).join(' · '));
        var who = S.hist.picked[x.ks[0]], eq = eqTxt(d), kgTxt = eq ? '<small class="eq">= ' + esc(eq) + '</small>' : (d.kg && d.chain !== 'Éxito' && !/\bkg\b|\bt$/.test(qt) ? '<small class="muted">≈ ' + wk(d.kg) + '</small>' : '');
        h += '<label class="ck' + (x.on ? ' done' : '') + '" data-nm="' + esc(L.norm(d.name)) + '"><input type="checkbox" data-pks="' + esc(x.ks.join('¦')) + '" data-c="' + esc(c) + '"' + (x.on ? ' checked' : '') + '><span class="nm">' + esc(d.name) + (sub.length ? '<small class="muted">' + sub.join(' · ') + '</small>' : '') + (x.on && typeof who === 'string' ? '<small class="muted">✔ ' + esc(who) + '</small>' : '') + '</span><b class="q">' + esc(qt) + kgTxt + '</b></label>';
      });
      h += '</details>';
    });
    return h + '</div><p class="muted ckno" style="display:none;margin:8px 0">Nada coincide.</p></div>';
  }
  // actualiza barra, contadores y grupos desde las casillas (sin volver a dibujar: la lista no salta)
  function updList(c) {
    var card = document.querySelector('[data-card="' + c + '"]'); if (!card) return;
    var all = card.querySelectorAll('[data-pks]'), n = 0; all.forEach(function (i) { if (i.checked) n++; });
    var t = card.querySelector('[data-cnt]'); if (t) t.textContent = n + ' / ' + all.length + ' alistados';
    var bar = card.querySelector('.cbar i'); if (bar) bar.style.width = (all.length ? Math.round(100 * n / all.length) : 0) + '%';
    card.querySelectorAll('details.grp').forEach(function (g) {
      var a = g.querySelectorAll('[data-pks]'), k = 0; a.forEach(function (i) { if (i.checked) k++; });
      var gc = g.querySelector('[data-gc]'); if (gc) gc.textContent = k + '/' + a.length; g.classList.toggle('alldone', k === a.length);
    });
  }
  // ---- consolidado del día: un producto por fila, una columna por ciudad
  function consRows(rows) {
    var m = {}, order = [];
    rows.forEach(function (d) {
      var k = L.norm(d.name);
      if (!m[k]) { m[k] = { name: d.name, word: d.word, chain: d.chain, by: {}, qty: 0, cx: 0, kg: 0 }; order.push(k); }
      var p = m[k], b = p.by[d.city] || (p.by[d.city] = { qty: 0, cx: 0 });
      b.kg = (b.kg || 0) + (d.kg || 0); b.qty += d.qty; b.cx += d.cx || 0; p.qty += d.qty; p.cx += d.cx || 0; p.kg += d.kg || 0;
    });
    return az(order.map(function (k) { return m[k]; }));
  }
  function consQty(p, q, cx, kg) {
    var e = (p.chain === 'Éxito' || p.word === 'kilos') ? eqOf(p.name, kg || q) : '', es = e ? ' <span class="eq">= ' + e + '</span>' : '';
    if (p.chain === 'Éxito') return wk(q) + es;
    if (p.word === 'kilos') return wk(q) + (cx ? ' <span class="muted" style="font-size:11px">(' + fmt(cx) + ' ' + cxWord(p.name, 1) + ')</span>' : '') + es;
    return fmt(q) + ' ' + (p.word || 'unid.') + (cx ? ' <span class="muted" style="font-size:11px">(' + fmt(cx) + ' ' + cxWord(p.name, 1) + ')</span>' : '');
  }
  function consKey(p) { return (S.dateMode === 'ped' ? 'P' : '') + S.hoyDate + '|CONS|' + p.chain + '|' + p.name; }
  function consHtml(rows, cities) {
    var cr = consRows(rows), done = cr.filter(function (p) { return S.hist.picked[consKey(p)]; }).length;
    var h = '<div class="card" style="padding:10px 14px"><div class="muted" id="consCnt" style="margin-bottom:6px">' + done + ' / ' + cr.length + ' productos sacados</div><div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:15px"><thead><tr>' +
      '<th style="text-align:left;padding:6px;position:sticky;left:0;background:#fff">☑ Producto</th><th style="padding:6px;white-space:nowrap">TOTAL</th>' + cities.map(function (c) { return '<th style="padding:6px;white-space:nowrap;border-bottom:3px solid ' + (CITY_COL[L.norm(c).replace(/ /g, '')] || '#BFBFBF') + '">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
    cr.forEach(function (p) {
      var k = consKey(p), on = !!S.hist.picked[k];
      h += '<tr data-cr style="border-top:1px solid var(--bd);' + (on ? 'opacity:.45' : '') + '"><td style="padding:8px 6px;position:sticky;left:0;background:#fff"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" style="width:22px;height:22px" data-ck="' + esc(k) + '"' + (on ? ' checked' : '') + '>' + esc(p.name) + '</label></td>' +
        '<td style="padding:6px;white-space:nowrap;font-weight:700;text-align:right">' + consQty(p, p.qty, p.cx, p.kg) + (p.kg && p.chain !== 'Éxito' && p.word !== 'kilos' ? '<br><span class="muted" style="font-size:11px;font-weight:400">≈ ' + wk(p.kg) + '</span>' : '') + '</td>' +
        cities.map(function (c) { var b = p.by[c]; return '<td style="padding:6px;white-space:nowrap;text-align:right">' + (b ? consQty(p, b.qty, b.cx, b.kg) : '<span class="muted">–</span>') + '</td>'; }).join('') + '</tr>';
    });
    var tk = 0; cr.forEach(function (p) { tk += p.kg || 0; });
    return h + '</tbody><tfoot><tr style="border-top:3px solid #1F3864;font-weight:700"><td style="padding:8px 6px;position:sticky;left:0;background:#fff">TOTAL GENERAL (' + cr.length + ' productos)</td><td style="padding:6px;text-align:right;white-space:nowrap">≈ ' + wk(tk) + '</td>' + cities.map(function (c) { var ck = 0; cr.forEach(function (p) { if (p.by[c]) ck += p.by[c].kg || 0; }); return '<td style="padding:6px;text-align:right;white-space:nowrap">≈ ' + wk(ck) + '</td>'; }).join('') + '</tr></tfoot></table></div></div>';
  }
  function consWa(rows) {
    var t = '*Consolidado ' + S.bChain + ' · ' + dayTxt() + '*\n';
    consRows(rows).forEach(function (p) { t += '• ' + p.name + ': ' + consQty(p, p.qty, p.cx, p.kg).replace(/<[^>]+>/g, '') + '\n'; });
    return t;
  }
  // Excel del consolidado: la misma hoja "CONSOLIDADO ALMACENES" de siempre (colores por ciudad, grupos y subtotales)
  function dlCons(rows, filename) {
    return dlOla(rows, false, filename, { merge: true, only: true, title: (S.bChain || '') + ' · ' + dayTxt() });
  }
  // ---- calendario de despachos: cada día muestra cuántas órdenes de Ara y de Éxito llegan
  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  function calYM() {
    var m = S.calM && /^(\d{4})-(\d{2})$/.exec(S.calM);
    if (!m && S.hoyDate && S.hoyDate !== '*') m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(S.hoyDate), m = m && [0, m[3], m[2]];
    if (!m) { var n = new Date(); return [n.getFullYear(), n.getMonth() + 1]; }
    return [+m[1], +m[2]];
  }
  function calHtml(all, consV) {
    var info = {};
    all.forEach(function (d) { var x = info[hdate(d)] = info[hdate(d)] || {}; (x[d.chain] = x[d.chain] || {})[d.oc] = 1; });
    var ym = calYM(), y = ym[0], m = ym[1], first = new Date(y, m - 1, 1), nd = new Date(y, m, 0).getDate(), off = (first.getDay() + 6) % 7, now = new Date();
    var tk = ('0' + now.getDate()).slice(-2) + '.' + ('0' + (now.getMonth() + 1)).slice(-2) + '.' + now.getFullYear();
    var open = S.calOpen !== false;
    var h = '<div class="card" style="padding:6px 10px;max-width:340px"><div class="row" style="justify-content:space-between;align-items:center;gap:4px"><button class="btn sec sm" data-cm="-1" style="padding:2px 9px;min-height:30px">‹</button><button id="calTg" style="background:none;border:0;font:600 14px inherit;color:inherit;cursor:pointer;padding:4px 6px">' + MESES[m - 1] + ' ' + y + ' ' + (open ? '▴' : '▾') + '</button><button class="btn sec sm" data-cm="1" style="padding:2px 9px;min-height:30px">›</button></div>';
    if (open) {
      h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;margin-top:4px">' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(function (x) { return '<div class="muted" style="font-size:10px">' + x + '</div>'; }).join('');
      for (var i = 0; i < off; i++) h += '<div></div>';
      for (var d = 1; d <= nd; d++) {
        var key = ('0' + d).slice(-2) + '.' + ('0' + m).slice(-2) + '.' + y, x = info[key], on = S.hoyDate === key, st = 'border-radius:6px;padding:1px 0;border:1.5px solid ' + (on ? '#1F3864' : key === tk ? '#9aa' : 'transparent') + ';background:' + (on ? '#dbe6ff' : 'transparent') + ';';
        var dot = function (c, n) { return n ? '<span title="' + c + ': ' + n + ' orden(es)" style="display:inline-block;min-width:12px;height:11px;line-height:11px;font-size:8.5px;font-weight:700;border-radius:99px;margin:0 1px;' + (c === 'Ara' ? 'background:#ed3237;color:#fff' : 'background:#ffd200;color:#1a1a1a') + '">' + n + '</span>' : ''; };
        h += x ? '<button data-day="' + key + '" style="' + st + 'cursor:pointer;min-height:32px;font-family:inherit"><div style="font-size:13px;line-height:14px;color:#0a1d44;font-weight:' + (on ? 900 : 800) + '">' + d + '</div><div style="line-height:11px">' + dot('Ara', Object.keys(x.Ara || {}).length) + dot('Éxito', Object.keys(x['Éxito'] || {}).length) + '</div></button>'
          : '<div style="' + st + 'color:#a9a9a9;font-size:12px;line-height:32px">' + d + '</div>';
      }
      h += '</div>';
    }
    h += '<div class="row" style="gap:8px;margin-top:4px;align-items:center;flex-wrap:wrap;font-size:10.5px"><span class="muted"><span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:#ed3237"></span> Ara</span><span class="muted"><span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:#ffd200"></span> Éxito · órdenes</span>' + (consV ? '<span style="flex:1"></span><button class="btn' + (S.hoyDate === '*' ? '' : ' sec') + ' sm" id="calAll" style="font-size:11px;padding:2px 8px;min-height:26px">Todos los días</button>' : '') + '</div></div>';
    return h;
  }

  // ---- estadísticas interactivas (rango de fechas + medida + día/semana/mes; sin precios)
  S.st = S.st || {};
  S.st.measure = S.st.measure || 'kg'; S.st.gran = S.st.gran || 'day'; S.st.chain = S.st.chain || ''; S.st.city = S.st.city || '';
  var ST_U = { kg: 'kg', cx: 'CX', ord: 'órdenes', bag: 'bolsas' }, ST_UL = { kg: 'Kilos', cx: 'CX', ord: 'Órdenes', bag: 'Bolsas congeladas' };
  function p2(n) { return ('0' + n).slice(-2); }
  function iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function fromIso(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 12); }
  function addD(s, n) { var d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); }
  function dIso(s) { var m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(s || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; }
  function monOf(s) { var d = fromIso(s), w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return iso(d); }
  function shortD(s) { return +s.slice(8, 10) + ' ' + MESES[+s.slice(5, 7) - 1].slice(0, 3).toLowerCase(); }
  var ST_PRE = [['hoy', 'Hoy'], ['sem', 'Esta semana'], ['7d', 'Últimos 7 días'], ['30d', 'Últimos 30 días'], ['mes', 'Este mes'], ['mesp', 'Mes pasado'], ['todo', 'Todo']];
  function stRange(src) {
    var e = src || S.st, all = histDetail(), ds = all.map(function (d) { return dIso(d.date); }).filter(Boolean).sort(), t = iso(new Date()), pre = e.preset, f, to, pf, pt, now = new Date();
    var mo = function (y, m) { return [iso(new Date(y, m, 1, 12)), iso(new Date(y, m + 1, 0, 12))]; };
    if (!pre) { var cm = mo(now.getFullYear(), now.getMonth()); pre = ds.some(function (x) { return x >= cm[0] && x <= cm[1]; }) || !ds.length ? 'mes' : 'ult'; }
    if (pre === 'hoy') { f = to = t; }
    else if (pre === 'sem') { f = monOf(t); to = addD(f, 6); }
    else if (pre === '7d') { to = t; f = addD(t, -6); }
    else if (pre === '30d') { to = t; f = addD(t, -29); }
    else if (pre === 'mes') { var a = mo(now.getFullYear(), now.getMonth()); f = a[0]; to = a[1]; var b = mo(now.getFullYear(), now.getMonth() - 1); pf = b[0]; pt = b[1]; }
    else if (pre === 'mesp') { var a2 = mo(now.getFullYear(), now.getMonth() - 1); f = a2[0]; to = a2[1]; var b2 = mo(now.getFullYear(), now.getMonth() - 2); pf = b2[0]; pt = b2[1]; }
    else if (pre === 'ult') { var l = ds[ds.length - 1], ld = fromIso(l), a3 = mo(ld.getFullYear(), ld.getMonth()); f = a3[0]; to = a3[1]; var b3 = mo(ld.getFullYear(), ld.getMonth() - 1); pf = b3[0]; pt = b3[1]; }
    else if (pre === 'todo') { f = ds[0] || t; to = ds[ds.length - 1] || t; }
    else if (/^m:\d{4}-\d{2}$/.test(pre)) { var my = +pre.slice(2, 6), mm = +pre.slice(7, 9) - 1, a4 = mo(my, mm); f = a4[0]; to = a4[1]; var b4 = mo(my, mm - 1); pf = b4[0]; pt = b4[1]; }
    else { f = e.from || t; to = e.to || f; if (to < f) { var x = f; f = to; to = x; } }
    if (!pf) { var len = Math.round((fromIso(to) - fromIso(f)) / 864e5) + 1; pt = addD(f, -1); pf = addD(pt, -(len - 1)); }
    return { pre: pre, from: f, to: to, pfrom: pf, pto: pt, label: f === to ? shortD(f) + ' ' + f.slice(0, 4) : shortD(f) + ' – ' + shortD(to) + ' ' + to.slice(0, 4), plabel: pf === pt ? shortD(pf) : shortD(pf) + ' – ' + shortD(pt) };
  }
  function mLab(m) { return MESES[+m.slice(5, 7) - 1].slice(0, 3) + ' ' + m.slice(0, 4); }
  function stMonths() { var o = {}; histDetail().forEach(function (d) { var i = dIso(d.date); if (i) o[i.slice(0, 7)] = 1; }); return Object.keys(o).sort(); }
  function monRange(m) { var y = +m.slice(0, 4), k = +m.slice(5, 7) - 1; return [iso(new Date(y, k, 1, 12)), iso(new Date(y, k + 1, 0, 12))]; }
  function stRows(f, to) {
    var e = S.st;
    return histDetail().filter(function (d) { var i = dIso(d.date); return i && i >= f && i <= to && (!e.chain || d.chain === e.chain) && (!e.city || d.city === e.city); });
  }
  function mk() { return { kg: 0, es: 0, cx: 0, bags: 0, o: {} }; }
  function mkAdd(x, d) { var kv = d.kg || (d.frozen ? (d.qty || 0) * 0.5 : 0); x.kg += kv; if (d.kgq === 'es') x.es += kv; if (d.frozen) x.bags += d.qty || 0; if (d.chain === 'Ara') x.cx += d.cx || 0; x.o[d.chain + '|' + d.oc] = 1; }
  function mval(x) { var m = S.st.measure; return m === 'kg' ? x.kg : m === 'cx' ? x.cx : m === 'bag' ? x.bags : Object.keys(x.o).length; }
  function stAgg(rows) {
    var P = {}, C = {}, T = mk(), AR = mk(), EX = mk(), cos = 0, cx = 0, miss = {};
    rows.forEach(function (d) {
      var k = d.chain + '|' + L.norm(d.name), p = P[k] = P[k] || { name: d.name, chain: d.chain, word: d.word, frozen: d.frozen, kg: 0, cx: 0, bags: 0, qty: 0, o: {}, cxw: cxWord(d.name) };
      p.qty += d.qty || 0; if (d.kgq === 'es') p.kgq = 'es'; else if (!p.kgq) p.kgq = d.kgq; if (d.kgq === 'no') { var ms = miss[k] = miss[k] || { name: d.name, chain: d.chain, qty: 0, word: d.word }; ms.qty += d.qty || 0; } mkAdd(p, d); mkAdd(C[d.city] = C[d.city] || mk(), d); mkAdd(T, d); mkAdd(d.chain === 'Éxito' ? EX : AR, d);
      if (d.chain === 'Ara') { cx += d.cx || 0; if (isCostal(d.name)) cos += d.cx || 0; }
    });
    var list = Object.keys(P).map(function (k) { return P[k]; }).sort(function (a, b) { return mval(b) - mval(a) || b.kg - a.kg; });
    return { miss: Object.keys(miss).map(function (k) { return miss[k]; }), prods: list, P: P, cities: C, T: T, AR: AR, EX: EX, bags: T.bags, ords: Object.keys(T.o).length, kg: T.kg, cx: cx, cos: cos };
  }
  function stBuckets(rows, R) {
    var g = S.st.gran, B = {}, keyOf = function (i) { return g === 'month' ? i.slice(0, 7) : g === 'week' ? monOf(i) : i; };
    var cur = R.from, n = 0; while (cur <= R.to && n < 800) { var k0 = keyOf(cur); B[k0] = B[k0] || { k: k0, a: mk(), e: mk(), rows: [] }; cur = addD(cur, 1); n++; }
    rows.forEach(function (d) { var k = keyOf(dIso(d.date)); var b = B[k] = B[k] || { k: k, a: mk(), e: mk(), rows: [] }; b.rows.push(d); mkAdd(d.chain === 'Éxito' ? b.e : b.a, d); });
    return Object.keys(B).sort().map(function (k) { return B[k]; });
  }
  function bLabel(k) { var g = S.st.gran; return g === 'month' ? MESES[+k.slice(5, 7) - 1].slice(0, 3) : g === 'week' ? shortD(k) : k.slice(8, 10); }
  function bTitle(k) { var g = S.st.gran; return g === 'month' ? MESES[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4) : g === 'week' ? 'Semana del ' + shortD(k) : shortD(k) + ' ' + k.slice(0, 4); }

  // ---- gráficos SVG (con nombres, números y ventana de detalle al pasar el mouse)
  function stTrunc(t, n) { t = String(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
  function cf(v) { if (S.st.measure === 'kg' && Math.abs(v) >= 1000) return (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1).replace('.', ',') + ' t'; v = Math.round(v); return v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1).replace('.', ',') + 'k' : fmt(v); }
  function tipReg(h) { S.stTips.push(h); return S.stTips.length - 1; }
  function ta(h) { return h ? ' data-tip="' + tipReg(h) + '"' : ''; }
  function tl(l, v) { return '<div style="display:flex;justify-content:space-between;gap:14px"><span style="opacity:.8">' + l + '</span><b>' + v + '</b></div>'; }
  function tHead(t) { return '<div style="font-size:13px;font-weight:700;margin-bottom:3px;border-bottom:1px solid rgba(255,255,255,.25);padding-bottom:3px">' + t + '</div>'; }
  function stStyle() {
    if (document.getElementById('stCss')) return;
    var c = document.createElement('style'); c.id = 'stCss';
    c.textContent = '.stcard{background:#fff;border:1px solid #e3e7ef;border-radius:14px;padding:12px 14px;margin:10px 0;box-shadow:0 1px 2px rgba(20,40,80,.06)}' +
      '.sthead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}.sthead h3{margin:0;flex:1;font-size:16px;color:#1F3864;min-width:140px}' +
      '.stlab{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#6b7690;font-weight:700;margin:0 0 4px}' +
      '.chp{border:1px solid #c9d2e6;background:#fff;border-radius:99px;padding:6px 12px;font-weight:600;font-size:12.5px;font-family:inherit;cursor:pointer;color:#1F3864;min-height:34px;margin:2px}.chp.on{background:#1F3864;color:#fff;border-color:#1F3864}' +
      '.seg{display:inline-flex;flex-wrap:wrap;border:1px solid #c9d2e6;border-radius:10px;overflow:hidden;background:#fff}.seg button{border:0;border-right:1px solid #e3e7ef;background:#fff;padding:8px 12px;font-weight:600;font-size:13px;font-family:inherit;cursor:pointer;color:#1F3864;min-height:38px}.seg button:last-child{border-right:0}.seg button.on{background:#1F3864;color:#fff}' +
      '.rpill{border:1px solid #c9d2e6;background:#f4f7fd;border-radius:99px;padding:6px 12px;font-weight:600;font-size:12px;font-family:inherit;color:#1F3864;cursor:pointer;min-height:34px}' +
      '.rpanel{background:#f4f7fd;border-radius:10px;padding:8px 10px;margin-bottom:10px}' +
      '.hit{fill:transparent;cursor:pointer}.hit:hover{fill:rgba(31,56,100,.09)}[data-tip]{cursor:pointer}' +
      '#stTip{position:fixed;z-index:99999;pointer-events:none;background:#14213d;color:#fff;border-radius:10px;padding:9px 12px;font-size:12px;line-height:1.5;width:max-content;max-width:270px;box-shadow:0 8px 24px rgba(0,0,0,.28);display:none}';
    document.head.appendChild(c);
    var t = document.createElement('div'); t.id = 'stTip'; document.body.appendChild(t);
  }
  function stDonut(items, center, unit) {
    var u = ST_U[S.st.measure], its = items.filter(function (i) { return i.v > 0; }), tot = its.reduce(function (a, i) { return a + i.v; }, 0) || 1, cx0 = 160, cy0 = 96, R = 50, SW = 24, C = 2 * Math.PI * R, off = 0, ang = -Math.PI / 2;
    var svg = '<svg viewBox="0 0 320 192" width="100%" style="max-width:360px;display:block;margin:auto"><g transform="rotate(-90 ' + cx0 + ' ' + cy0 + ')"><circle cx="' + cx0 + '" cy="' + cy0 + '" r="' + R + '" fill="none" stroke="#eee" stroke-width="' + SW + '"/>';
    its.forEach(function (i) { var len = i.v / tot * C; svg += '<circle cx="' + cx0 + '" cy="' + cy0 + '" r="' + R + '" fill="none" stroke="' + i.c + '" stroke-width="' + SW + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"' + ta(i.tip || tHead(esc(i.l)) + tl(ml(), mf(i.v)) + tl('Parte del total', Math.round(i.v / tot * 100) + '%')) + '/>'; off += len; });
    svg += '</g>';
    if (center) svg += '<text x="' + cx0 + '" y="' + (cy0 + 2) + '" text-anchor="middle" font-size="17" font-weight="700" fill="#1F3864">' + esc(center) + '</text><text x="' + cx0 + '" y="' + (cy0 + 16) + '" text-anchor="middle" font-size="10" fill="#777">' + esc(unit) + '</text>';
    var lastR = -99, lastL = 999;
    its.forEach(function (i) {
      var fr = i.v / tot, mid = ang + fr * Math.PI; ang += fr * 2 * Math.PI;
      if (fr < 0.035) return;
      var rr = R + SW / 2 + 7, x = cx0 + rr * Math.cos(mid), y = cy0 + rr * Math.sin(mid), right = Math.cos(mid) >= 0;
      if (right) { y = Math.max(y, lastR + 25); lastR = y; } else { y = Math.min(y, lastL - 25); lastL = y; }
      y = Math.max(14, Math.min(178, y));
      svg += '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + (right ? 'start' : 'end') + '" font-size="10.5" font-weight="700" fill="#222">' + esc(stTrunc(i.l, 14)) + '</text><text x="' + x.toFixed(1) + '" y="' + (y + 11).toFixed(1) + '" text-anchor="' + (right ? 'start' : 'end') + '" font-size="10" fill="#555">' + mf(i.v) + (S.st.measure === 'kg' ? '' : ' ' + u) + ' · ' + Math.round(fr * 100) + '%</text>';
    });
    svg += '</svg>';
    var leg = '<div style="display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;margin-top:6px">' + items.map(function (i) { return '<span style="font-size:12.5px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + i.c + ';margin-right:4px"></span>' + esc(i.l) + ' <b>' + mf(i.v) + '</b></span>'; }).join('') + '</div>';
    return svg + leg;
  }
  function stHBars(items) {
    var u = ST_U[S.st.measure], W = 400, LX = 168, BW = 150, hx = items.some(function (i) { return i.x; }), rh = hx ? 38 : 28, max = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([1])), svg = '<svg viewBox="0 0 ' + W + ' ' + (items.length * rh + 6) + '" width="100%" style="max-width:700px;display:block;margin:auto">';
    items.forEach(function (i, k) {
      var y = k * rh + 4, w = i.v > 0 ? Math.max(3, i.v / max * BW) : 0;
      svg += '<text x="0" y="' + (y + 14) + '" font-size="11" font-weight="600" fill="#333">' + esc(stTrunc(i.l, 27)) + '</text><rect x="' + LX + '" y="' + y + '" width="' + w.toFixed(1) + '" height="20" rx="4" fill="' + i.c + '"/><text x="' + (LX + w + 5).toFixed(1) + '" y="' + (y + 14) + '" font-size="11.5" font-weight="700" fill="#1F3864">' + (i.es && S.st.measure === 'kg' ? '≈ ' : '') + mf(i.v) + (S.st.measure === 'kg' ? '' : ' ' + u) + '</text>' + (i.x ? '<text x="0" y="' + (y + 29) + '" font-size="10" font-weight="600" fill="#2a7ab0">' + esc(i.x) + '</text>' : '') +
        '<rect class="hit" x="0" y="' + (k * rh) + '" width="' + W + '" height="' + rh + '"' + ta(i.tip || (tHead(esc(i.l)) + tl(ml(), mf(i.v)) + (i.t ? tl('Cadena', esc(i.t)) : '') + (i.x ? '<div style="opacity:.85">' + esc(i.x) + '</div>' : ''))) + '/>';
    });
    return svg + '</svg>';
  }
  function stNice(v) { var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function bkTip(b) {
    var A = stAgg(b.rows), u = ST_U[S.st.measure], o = [tHead(esc(bTitle(b.k)))];
    if (!b.rows.length) return o[0] + '<div style="opacity:.8">Sin pedidos</div>';
    o.push(tl('Total', mf(mval(A.T))));
    if (S.st.measure !== 'kg') o.push(tl('Kilos', wk(A.kg)));
    o.push(tl('<span style="color:#ff8a8d">●</span> Ara', mf(mval(A.AR))), tl('<span style="color:#ffd200">●</span> Éxito', mf(mval(A.EX))), tl('Órdenes', A.ords));
    var tp = A.prods.filter(function (p) { return mval(p) > 0; }).slice(0, 4);
    if (tp.length) o.push('<div style="margin-top:5px;opacity:.7;font-size:10.5px;letter-spacing:.06em">PRODUCTOS</div>' + tp.map(function (p) { return tl(esc(stTrunc(p.name, 22)), mf(mval(p)) + (p.frozen ? ' · ' + fmt(p.bags) + ' bolsas' : '')); }).join(''));
    var cl = Object.keys(A.cities).sort(function (a, c) { return mval(A.cities[c]) - mval(A.cities[a]); }).slice(0, 5);
    if (cl.length) o.push('<div style="margin-top:5px;opacity:.7;font-size:10.5px;letter-spacing:.06em">DESTINOS</div>' + cl.map(function (c) { return tl(esc(c), mf(mval(A.cities[c]))); }).join(''));
    return o.join('');
  }
  function stCols(bk) {
    var u = ST_U[S.st.measure], W = 360, H = 200, L0 = 40, B0 = 24, T0 = 16, n = bk.length || 1, vv = function (b) { return mval(b.a) + mval(b.e); }, max = Math.max.apply(null, bk.map(vv).concat([1])), step = (W - L0 - 6) / n, bw = Math.min(34, step * 0.74), every = Math.ceil(n / 12), lab = step >= 22 ? 1 : Math.ceil(24 / step);
    var top = stNice(max), svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:760px;display:block;margin:auto">', sc = (H - B0 - T0) / top;
    [0, 0.5, 1].forEach(function (f) { var y = T0 + (H - B0 - T0) * (1 - f); svg += '<line x1="' + L0 + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#e3e3e3"/><text x="' + (L0 - 4) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#777">' + cf(top * f) + '</text>'; });
    var act = bk.filter(function (b) { return vv(b) > 0; }), avg = act.length ? act.reduce(function (a, b) { return a + vv(b); }, 0) / act.length : 0;
    bk.forEach(function (b, i) {
      var x = L0 + i * step + (step - bw) / 2, a = mval(b.a), e = mval(b.e), ha = a * sc, he = e * sc, y0 = H - B0, both = a > 0 && e > 0;
      svg += '<g>' + (ha ? '<rect x="' + x.toFixed(1) + '" y="' + (y0 - ha).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + ha.toFixed(1) + '" rx="2" fill="#ed3237"/>' : '') + (he ? '<rect x="' + x.toFixed(1) + '" y="' + (y0 - ha - he).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + he.toFixed(1) + '" rx="2" fill="#ffd200"/>' : '');
      if (both && bw >= 22) { if (ha >= 12) svg += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 - ha / 2 + 3).toFixed(1) + '" text-anchor="middle" font-size="8.5" font-weight="700" fill="#fff">' + cf(a) + '</text>'; if (he >= 12) svg += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 - ha - he / 2 + 3).toFixed(1) + '" text-anchor="middle" font-size="8.5" font-weight="700" fill="#4a3b00">' + cf(e) + '</text>'; }
      if ((a + e) > 0 && i % lab === 0) svg += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 - ha - he - 3).toFixed(1) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="#1F3864">' + cf(a + e) + '</text>';
      if (i % every === 0) svg += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9.5" fill="#555">' + esc(bLabel(b.k)) + '</text>';
      svg += '<rect class="hit" x="' + (L0 + i * step).toFixed(1) + '" y="' + T0 + '" width="' + step.toFixed(1) + '" height="' + (H - B0 - T0) + '"' + ta(bkTip(b)) + '/></g>';
    });
    if (avg > 0 && act.length > 1) { var ya = H - B0 - avg * sc; svg += '<line x1="' + L0 + '" x2="' + W + '" y1="' + ya.toFixed(1) + '" y2="' + ya.toFixed(1) + '" stroke="#1F3864" stroke-width="1" stroke-dasharray="5 3" opacity=".6" pointer-events="none"/><text x="' + (W - 2) + '" y="' + (ya - 3).toFixed(1) + '" text-anchor="end" font-size="9" fill="#1F3864" pointer-events="none">promedio ' + cf(avg) + '</text>'; }
    return svg + '</svg>';
  }
  function stLines(bk) {
    var u = ST_U[S.st.measure], W = 360, H = 200, L0 = 40, B0 = 24, T0 = 18, n = bk.length || 1, tv = function (b) { return mval(b.a) + mval(b.e); }, max = Math.max.apply(null, bk.map(tv).concat([1])), top = stNice(max), every = Math.ceil(n / 10), lab = n <= 14 ? 1 : Math.ceil(n / 14), stp = (W - L0 - 22) / Math.max(1, n - 1);
    var px = function (i) { return n === 1 ? L0 + (W - L0 - 12) / 2 : L0 + 8 + i * stp; }, py = function (v) { return T0 + (H - B0 - T0) * (1 - v / top); };
    var hasA = bk.some(function (b) { return mval(b.a) > 0; }), hasE = bk.some(function (b) { return mval(b.e) > 0; }), svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:760px;display:block;margin:auto">';
    [0, 0.5, 1].forEach(function (f) { var y = T0 + (H - B0 - T0) * (1 - f); svg += '<line x1="' + L0 + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#e3e3e3"/><text x="' + (L0 - 4) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#777">' + cf(top * f) + '</text>'; });
    var line = function (get, col, dash, w) { var pts = bk.map(function (b, i) { return px(i).toFixed(1) + ',' + py(get(b)).toFixed(1); }).join(' '); return '<polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="4 3"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>'; };
    if (hasA && hasE) { svg += line(function (b) { return mval(b.a); }, '#ed3237', false, 2) + line(function (b) { return mval(b.e); }, '#e0b400', false, 2) + line(tv, '#1F3864', true, 1.6); }
    else svg += line(tv, hasE && !hasA ? '#e0b400' : '#ed3237', false, 2.4);
    bk.forEach(function (b, i) {
      var t = tv(b), x = px(i);
      svg += '<circle cx="' + x.toFixed(1) + '" cy="' + py(t).toFixed(1) + '" r="3.2" fill="#1F3864" stroke="#fff" stroke-width="1"/>';
      if (t > 0 && i % lab === 0) svg += '<text x="' + x.toFixed(1) + '" y="' + (py(t) - 7).toFixed(1) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="#1F3864">' + cf(t) + '</text>';
      if (i % every === 0) svg += '<text x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9.5" fill="#555">' + esc(bLabel(b.k)) + '</text>';
      svg += '<rect class="hit" x="' + (x - Math.max(stp, 8) / 2).toFixed(1) + '" y="' + T0 + '" width="' + Math.max(stp, 8).toFixed(1) + '" height="' + (H - B0 - T0) + '"' + ta(bkTip(b)) + '/>';
    });
    return svg + '</svg>';
  }
  function rangeCtl(id, Rc, ov) {
    var open = S.st.open[id], pre = ov ? ov.preset : null,
      pill = '<button class="rpill" data-rp="' + id + '">📅 ' + esc(Rc.label) + (ov ? '' : ' · igual que arriba') + (open ? ' ▴' : ' ▾') + '</button>', panel = '';
    if (open) panel = '<div class="rpanel"><div class="stlab">Fechas de este gráfico</div><div style="display:flex;flex-wrap:wrap;margin-bottom:6px">' + [['7d', '7 días'], ['30d', '30 días'], ['mes', 'Este mes'], ['mesp', 'Mes pasado'], ['todo', 'Todo']].map(function (p) { return '<button class="chp' + (pre === p[0] ? ' on' : '') + '" data-cr="' + id + '|' + p[0] + '">' + p[1] + '</button>'; }).join('') + stMonths().map(function (m) { return '<button class="chp' + (pre === 'm:' + m ? ' on' : '') + '" data-cr="' + id + '|m:' + m + '">' + mLab(m) + '</button>'; }).join('') + '<button class="chp' + (!ov ? ' on' : '') + '" data-crs="' + id + '">Igual que arriba</button></div><div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap"><label class="muted" style="font-size:11px">Desde<br><input type="date" data-cf="' + id + '" value="' + Rc.from + '" style="font-size:15px;padding:6px"></label><label class="muted" style="font-size:11px">Hasta<br><input type="date" data-ctt="' + id + '" value="' + Rc.to + '" style="font-size:15px;padding:6px"></label></div></div>';
    return { pill: pill, panel: panel };
  }
  function stHead(title, id, C, extra, sub) { var r = rangeCtl(id, C.R, C.ov); return '<div class="sthead"><h3>' + title + '</h3>' + (extra || '') + r.pill + '</div>' + r.panel + (sub ? '<p class="muted" style="margin:0 0 8px;font-size:12px">' + sub + '</p>' : ''); }
  function segBtns(list, cur, attr) { return '<span class="seg">' + list.map(function (g) { return '<button class="' + (cur === g[0] ? 'on' : '') + '" ' + attr + '="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '</span>'; }
  function stTime(C, id) {
    var e = S.st, u = ST_U[e.measure], gl = { day: 'Día', week: 'Semana (lunes)', month: 'Mes' }[e.gran], ct = e.ctype || 'bar', bk = stBuckets(C.rows, C.R);
    var leg = ct === 'line' ? '<span style="color:#ed3237">● Ara</span><span style="color:#c99a00">● Éxito</span><span style="color:#1F3864">┅ Total</span>' : '<span><span class="cb Ara">Ara</span></span><span><span class="cb Éxito">Éxito</span></span><span class="muted">número arriba = total · línea punteada = promedio</span>';
    return stHead(ST_UL[e.measure] + ' en el tiempo', id, C, segBtns([['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']], e.gran, 'data-gr') + segBtns([['bar', '▮ Barras'], ['line', '〰 Línea']], ct, 'data-ct')) + (ct === 'line' ? stLines(bk) : stCols(bk)) + '<div class="row" style="gap:12px;font-size:12px;margin-top:4px;justify-content:center;flex-wrap:wrap">' + leg + '<span class="muted">' + gl + ' · ' + u + ' · pasa el mouse o toca una barra</span></div>';
  }
  function stCompare(items, nowL, prevL) {
    var u = ST_U[S.st.measure], W = 400, LX = 150, BW = 112, rh = 44, max = Math.max.apply(null, items.map(function (i) { return Math.max(i.a, i.b); }).concat([1])), svg = '<svg viewBox="0 0 ' + W + ' ' + (items.length * rh + 6) + '" width="100%" style="max-width:700px;display:block;margin:auto">';
    items.forEach(function (i, k) {
      var y = k * rh + 4, wa = i.a > 0 ? Math.max(3, i.a / max * BW) : 0, wb = i.b > 0 ? Math.max(3, i.b / max * BW) : 0, d = i.b ? Math.round((i.a - i.b) / i.b * 100) : null;
      svg += '<text x="0" y="' + (y + 18) + '" font-size="11" font-weight="600" fill="#333">' + esc(stTrunc(i.l, 22)) + '</text>' +
        '<rect x="' + LX + '" y="' + y + '" width="' + wa.toFixed(1) + '" height="16" rx="3" fill="#1F3864"/><text x="' + (LX + wa + 5).toFixed(1) + '" y="' + (y + 12) + '" font-size="10.5" font-weight="700" fill="#1F3864">' + mf(i.a) + (d == null ? '' : '<tspan fill="' + (d >= 0 ? '#1a7f37' : '#c62828') + '"> ' + (d >= 0 ? '▲' : '▼') + Math.abs(d) + '%</tspan>') + '</text>' +
        '<rect x="' + LX + '" y="' + (y + 20) + '" width="' + wb.toFixed(1) + '" height="16" rx="3" fill="#b9bfd0"/><text x="' + (LX + wb + 5).toFixed(1) + '" y="' + (y + 32) + '" font-size="10.5" fill="#666">' + mf(i.b) + '</text>' +
        '<rect class="hit" x="0" y="' + (k * rh) + '" width="' + W + '" height="' + rh + '"' + ta(tHead(esc(i.l)) + tl(esc(nowL), mf(i.a) + (S.st.measure === 'kg' ? '' : ' ' + u)) + tl(esc(prevL), mf(i.b) + (S.st.measure === 'kg' ? '' : ' ' + u)) + tl('Cambio', d == null ? 'sin base' : (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%') + tl('Diferencia', (i.a - i.b >= 0 ? '+' : '') + mf(i.a - i.b))) + '/>';
    });
    return svg + '</svg><div class="row" style="gap:14px;font-size:12px;margin-top:4px;justify-content:center"><span><span style="display:inline-block;width:12px;height:12px;background:#1F3864;border-radius:3px"></span> ' + esc(nowL) + '</span><span><span style="display:inline-block;width:12px;height:12px;background:#b9bfd0;border-radius:3px"></span> ' + esc(prevL) + '</span></div>';
  }
  function wk(kg) { kg = +kg || 0; return Math.abs(kg) >= 1000 ? (kg / 1000).toFixed(2).replace('.', ',') + ' t' : fmt(Math.round(kg)) + ' kg'; }
  function mf(v) { return S.st.measure === 'kg' ? wk(v) : fmt(Math.round(+v || 0)); }
  function ml() { return S.st.measure === 'kg' ? 'Peso' : ST_U[S.st.measure]; }
  function tonTxt(kg) { return (kg / 1000).toFixed(2).replace('.', ',') + ' t'; }
  function prodX(p) { var a = []; if (p.kg) a.push((p.kgq === 'es' ? '≈ ' : '') + wk(p.kg) + (p.kg >= 1000 ? ' (' + fmt(Math.round(p.kg)) + ' kg)' : '')); var q = packTxt(p) || (p.qty ? fmt(p.qty) + ' ' + (p.word || 'und') : ''); if (q) a.push(q); return a.join(' · '); }
  function packTxt(p) {
    var a = [];
    if (p.frozen) a.push(fmt(p.bags) + ' bolsas congeladas');
    else { if (p.cx) a.push(fmt(p.cx) + ' ' + p.cxw); if (p.chain === 'Ara' && p.qty && p.word && p.word !== 'kilos') a.push(fmt(p.qty) + ' ' + p.word); }
    return a.join(' · ');
  }
  function prodTip(p, tm) { return tHead(esc(p.name)) + tl('Cadena', esc(p.chain)) + tl('Kilos', (p.kgq === 'es' ? '≈ ' : '') + fmt(Math.round(p.kg))) + tl('Toneladas', tonTxt(p.kg)) + (packTxt(p) ? tl('Empaque', esc(packTxt(p))) : '') + tl('Órdenes', Object.keys(p.o).length) + (tm ? tl('Parte de lo medido', Math.round(mval(p) / tm * 100) + '%') : ''); }

  function renderStats() {
    var el = $('#p-stats');
    if (!S.unlocked) { renderLocked('#p-stats', renderStats, 'Estadísticas privadas', 'Solo personas autorizadas. Escribe la clave para ver las estadísticas.'); return; }
    stStyle();
    var e = S.st; e.cr = e.cr || {}; e.open = e.open || {}; e.tab = e.tab || 'res'; S.stTips = [];
    var all = histDetail();
    if (!all.length) { el.innerHTML = '<div class="card"><h2>Estadísticas</h2><p class="muted">Cuando haya pedidos cargados aparecen aquí.</p></div>'; return; }
    var R = stRange(), rowsM = stRows(R.from, R.to), A = stAgg(rowsM); if (e.measure === 'bag') e.measure = 'kg';
    var B = stAgg(stRows(R.pfrom, R.pto)), meas = e.measure, u = ST_U[meas], G = { R: R, rows: rowsM, A: A, B: B };
    var ctx = function (id) { var ov = e.cr[id]; if (!ov) return G; var Rc = stRange(ov), rr = stRows(Rc.from, Rc.to); return { R: Rc, rows: rr, A: stAgg(rr), B: stAgg(stRows(Rc.pfrom, Rc.pto)), ov: ov }; };
    var chains = uniq(all.map(function (d) { return d.chain; })).sort(), cities = uniq(all.map(function (d) { return d.city; })).sort(function (a, b) { return a.localeCompare(b, 'es', { sensitivity: 'base' }); });
    var PAL = ['#1F3864', '#ed3237', '#f2a900', '#2e8b57', '#6a5acd', '#e07b39', '#2a9d8f', '#8d6e63'], cityCol = function (c, i) { return CITY_COL[L.norm(c).replace(/ /g, '')] || PAL[i % PAL.length]; };
    var tabs = [['res', '📊 Resumen'], ['tiempo', '📈 En el tiempo'], ['prod', '🥔 Productos'], ['dest', '📍 Destinos'], ['comp', '🆚 Comparativo']];
    var h = '<div class="stcard"><div class="stlab">Período</div><div style="display:flex;flex-wrap:wrap">' + ST_PRE.map(function (p) { return '<button class="chp' + (R.pre === p[0] ? ' on' : '') + '" data-pre="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<div class="stlab" style="margin-top:8px">Escoger un mes</div><div style="display:flex;flex-wrap:wrap">' + stMonths().map(function (m) { return '<button class="chp' + (R.pre === 'm:' + m ? ' on' : '') + '" data-pre="m:' + m + '">' + mLab(m) + '</button>'; }).join('') + '</div>' +
      '<div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:6px"><label class="muted" style="font-size:11px">Desde<br><input type="date" id="stFrom" value="' + R.from + '" style="font-size:16px;padding:7px"></label><label class="muted" style="font-size:11px">Hasta<br><input type="date" id="stTo" value="' + R.to + '" style="font-size:16px;padding:7px"></label>' +
      '<label class="muted" style="font-size:11px">Cadena<br><select id="stCh" style="font-size:16px;padding:7px">' + opts(chains, e.chain, 'Todas') + '</select></label><label class="muted" style="font-size:11px">Destino<br><select id="stCi" style="font-size:16px;padding:7px">' + opts(cities, e.city, 'Todos') + '</select></label></div>' +
      '<div class="row" style="gap:14px;align-items:flex-end;flex-wrap:wrap;margin-top:10px"><div><div class="stlab">Medir en</div>' + segBtns(['kg', 'cx', 'ord'].map(function (m) { return [m, ST_UL[m]]; }), meas, 'data-ms') + '</div><span style="flex:1"></span><button class="btn" id="stDl">⬇ Excel</button></div></div>' +
      '<div style="overflow-x:auto;margin:6px 0">' + segBtns(tabs, e.tab, 'data-tab') + '</div>';
    if (!A.ords) { el.innerHTML = h + '<div class="stcard"><p class="muted">No hay pedidos con entrega entre ' + esc(R.label) + (e.chain || e.city ? ' con esos filtros' : '') + '. Prueba otro rango o toca «Todo».</p></div>'; stBind(el, R, A); return; }
    var dl = function (a, b) { if (!b) return ''; var p = Math.round((a - b) / b * 100); return '<span style="font-size:12px;font-weight:700;color:' + (p >= 0 ? '#1a7f37' : '#c62828') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%</span> <span class="muted" style="font-size:11px">vs ' + esc(R.plabel) + '</span>'; };
    var kpi = function (m, val, lab, prev) { return '<div class="kpi" data-ms="' + m + '" style="cursor:pointer;' + (meas === m ? 'outline:3px solid var(--gold)' : '') + '"><b>' + val + '</b><span>' + lab + '</span>' + (prev ? '<div>' + prev + '</div>' : '') + '</div>'; };
    var tab = e.tab;
    if (tab === 'res') {
      h += '<div class="hero">' + kpi('ord', fmt(A.ords), 'órdenes', B.ords ? dl(A.ords, B.ords) : '') + kpi('kg', wk(A.kg) + '', 'total en kilos', (A.T.es ? '<span class="muted" style="font-size:11px">' + Math.round(A.T.es / (A.kg || 1) * 100) + '% estimado por el peso del nombre</span> ' : '') + (B.kg ? dl(A.kg, B.kg) : '')) + kpi('cx', fmt(A.cx), 'CX (Ara)', '') + (A.bags ? '<div class="kpi"><b>' + fmt(A.bags) + '</b><span>bolsas congeladas (mora/fresa)</span>' + (B.bags ? '<div>' + dl(A.bags, B.bags) + '</div>' : '') + '</div>' : '') + (A.cos ? '<div class="kpi"><b>' + fmt(A.cos) + '</b><span>de ellas, CX de papa sin lavar</span></div>' : '') + '<div class="kpi"><b>' + A.prods.length + '</b><span>productos distintos</span></div></div>';
      var byDay = {}; rowsM.forEach(function (d) { var i = dIso(d.date); byDay[i] = (byDay[i] || 0) + (d.kg || (d.frozen ? (d.qty || 0) * 0.5 : 0)); });
      var pkD = Object.keys(byDay).sort(function (a, b) { return byDay[b] - byDay[a]; })[0], cK = Object.keys(A.cities).sort(function (a, b) { return A.cities[b].kg - A.cities[a].kg; }), tp = A.prods.slice().sort(function (a, b) { return b.kg - a.kg; })[0], ins = [];
      if (tp) ins.push('🏆 <b>Producto con más kilos:</b> ' + esc(tp.name) + ' — ' + wk(tp.kg) + ' (' + Math.round(tp.kg / (A.kg || 1) * 100) + '% del total)' + (tp.frozen ? ', ' + fmt(tp.bags) + ' bolsas congeladas' : ''));
      if (cK[0]) ins.push('📍 <b>Destino con más volumen:</b> ' + esc(cK[0]) + ' — ' + wk(A.cities[cK[0]].kg) + ' (' + Math.round(A.cities[cK[0]].kg / (A.kg || 1) * 100) + '%)' + (cK.length > 1 ? '; le sigue ' + esc(cK[1]) : ''));
      if (pkD) ins.push('📈 <b>Día de más volumen:</b> ' + shortD(pkD) + ' — ' + wk(byDay[pkD]) + '');
      ins.push('⚖️ <b>Promedio por orden:</b> ' + wk(A.kg / (A.ords || 1)) + ' · Ara ' + Math.round(A.AR.kg / (A.kg || 1) * 100) + '% / Éxito ' + Math.round(A.EX.kg / (A.kg || 1) * 100) + '%');
      if (B.kg) ins.push('🆚 <b>Frente a ' + esc(R.plabel) + ':</b> ' + (A.kg >= B.kg ? '▲ ' : '▼ ') + Math.abs(Math.round((A.kg - B.kg) / B.kg * 100)) + '% en kilos');
      h += '<div class="stcard"><h3 style="margin:0 0 6px;color:#1F3864">Lo más destacado · ' + esc(R.label) + '</h3><div style="font-size:13.5px;line-height:1.7">' + ins.join('<br>') + '</div></div>';
      var ordIdx = {}; histOrders().forEach(function (o) { ordIdx[(o.chain || 'Ara') + '|' + o.oc] = o; });
      var okN = 0, badO = [], noN = 0; Object.keys(A.T.o).forEach(function (k) { var o = ordIdx[k]; if (!o) return; if (o.totalOk === true) okN++; else if (o.totalOk === false || o.unread > 0) badO.push(o); else noN++; });
      var exKg = A.kg - A.T.es;
      h += '<div class="stcard" style="border-left:5px solid ' + (badO.length || A.miss.length ? '#f2a900' : '#2e8b57') + '"><h3 style="margin:0 0 6px;color:#1F3864">Qué tan confiables son estos kilos</h3><div style="font-size:13.5px;line-height:1.55">' +
        '✅ <b>' + wk(exKg) + ' exactos</b> (vienen en kilos en el documento, o son la mora/fresa de 500 g)<br>' + (A.T.es ? '≈ <b>' + wk(A.T.es) + ' estimados</b> con el peso que dice el nombre del producto (ej. «X 500 G»)<br>' : '') +
        (A.miss.length ? '⚠️ <b>' + A.miss.length + ' producto(s) sin peso conocido</b>, no suman kilos: ' + A.miss.slice(0, 8).map(function (m) { return esc(stTrunc(m.name, 26)) + ' (' + fmt(m.qty) + ' ' + esc(m.word || 'und') + ')'; }).join('; ') + (A.miss.length > 8 ? '…' : '') + '<br>' : '') +
        '🔎 Lectura de los PDF: <b>' + okN + '</b> órdenes con el total de dinero igual al del PDF' + (badO.length ? ', <b style="color:#c62828">' + badO.length + ' no coinciden</b> (' + badO.map(function (o) { return esc(o.oc); }).join(', ') + ')' : '') + (noN ? ', ' + noN + ' sin total para comparar (Éxito)' : '') + '.</div></div>';
      var Ca = ctx('a');
      h += '<div class="stcard">' + stHead('Ara y Éxito · ' + ST_UL[meas].toLowerCase(), 'a', Ca) + stDonut([{ l: 'Ara', v: mval(Ca.A.AR), c: '#ed3237', tip: tHead('Ara') + tl(ml(), mf(mval(Ca.A.AR))) + tl('Kilos', wk(Ca.A.AR.kg)) + tl('Órdenes', Object.keys(Ca.A.AR.o).length) }, { l: 'Éxito', v: mval(Ca.A.EX), c: '#ffd200', tip: tHead('Éxito') + tl(ml(), mf(mval(Ca.A.EX))) + tl('Kilos', wk(Ca.A.EX.kg)) + tl('Órdenes', Object.keys(Ca.A.EX.o).length) }], '', '') + '</div>';
    }
    if (tab === 'tiempo') {
      var Ct = ctx('t'), bkT = stBuckets(Ct.rows, Ct.R);
      h += '<div class="stcard">' + stTime(Ct, 't') + '</div>';
      h += '<details class="stcard"><summary style="cursor:pointer;font-weight:700;color:#1F3864">📋 Ver los números de cada ' + ({ day: 'día', week: 'semana', month: 'mes' }[e.gran]) + '</summary><div style="overflow-x:auto;margin-top:8px"><table style="border-collapse:collapse;width:100%;font-size:13.5px"><thead><tr><th style="text-align:left;padding:5px">Período</th><th style="text-align:right;padding:5px">Ara</th><th style="text-align:right;padding:5px">Éxito</th><th style="text-align:right;padding:5px">Total (' + u + ')</th><th style="text-align:right;padding:5px">Órdenes</th></tr></thead><tbody>' +
        bkT.filter(function (b) { return b.rows.length; }).map(function (b) { var no = {}; b.rows.forEach(function (d) { no[d.chain + d.oc] = 1; }); return '<tr style="border-top:1px solid var(--bd)"><td style="padding:5px">' + esc(bTitle(b.k)) + '</td><td style="padding:5px;text-align:right">' + mf(mval(b.a)) + '</td><td style="padding:5px;text-align:right">' + mf(mval(b.e)) + '</td><td style="padding:5px;text-align:right"><b>' + mf(mval(b.a) + mval(b.e)) + '</b></td><td style="padding:5px;text-align:right">' + Object.keys(no).length + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
    }
    if (tab === 'prod') {
      var Cp = ctx('p'), tmP = mval(Cp.A.T) || 1, low = e.pord === 'low', pos = Cp.A.prods.filter(function (p) { return mval(p) > 0; }), top;
      if (low) top = pos.slice().sort(function (a, b) { return mval(a) - mval(b) || a.kg - b.kg; }).slice(0, 10);
      else { top = pos.slice(0, 10); pos.filter(function (p) { return p.frozen && top.indexOf(p) < 0; }).forEach(function (p) { top.pop(); top.push(p); }); }
      h += '<div class="stcard">' + stHead(low ? 'Los 10 productos menos vendidos' : 'Los productos más vendidos', 'p', Cp, segBtns([['top', '▲ Más vendidos'], ['low', '▼ 10 menos vendidos']], low ? 'low' : 'top', 'data-po'), (low ? 'De menor a mayor' : 'Ordenados') + ' por ' + (meas === 'ord' ? 'órdenes' : meas === 'cx' ? 'CX' : 'kilos') + '. Debajo de cada barra: kilos, toneladas y la cantidad pedida.') + stHBars(top.map(function (p) { return { l: p.name, v: mval(p), c: p.chain === 'Éxito' ? '#f2c200' : '#ed3237', es: p.kgq === 'es', x: prodX(p), t: p.chain, tip: prodTip(p, tmP) }; })) + '<div class="row" style="gap:12px;font-size:12px;margin-top:4px;justify-content:center"><span><span class="cb Ara">Ara</span></span><span><span class="cb Éxito">Éxito</span></span></div></div>';
      var Cx = ctx('x'), AX = Cx.A, pk = e.prod && AX.P[e.prod] ? e.prod : (AX.prods[0] ? AX.prods[0].chain + '|' + L.norm(AX.prods[0].name) : '');
      if (pk) {
        var pr = Cx.rows.filter(function (d) { return d.chain + '|' + L.norm(d.name) === pk; }), PA = stAgg(pr), p0 = AX.P[pk], pb = Cx.B.P[pk], tm = mval(AX.T) || 1, share = Math.round(mval(p0) / tm * 100), nO = Object.keys(p0.o).length, pcl = Object.keys(PA.cities).sort(function (a, b) { return mval(PA.cities[b]) - mval(PA.cities[a]); });
        var pdel = pb && mval(pb) ? Math.round((mval(p0) - mval(pb)) / mval(pb) * 100) : null, rank = AX.prods.indexOf(p0) + 1, cc = p0.chain === 'Éxito' ? '#f2c200' : '#ed3237', rx = rangeCtl('x', Cx.R, Cx.ov);
        var big = function (v, l, c) { return '<div style="flex:1 1 110px;background:#f6f8fc;border-radius:12px;padding:10px 12px;border-top:3px solid ' + (c || '#1F3864') + '"><div style="font-size:22px;font-weight:800;color:#1F3864;line-height:1.1">' + v + '</div><div class="muted" style="font-size:11.5px;margin-top:2px">' + l + '</div></div>'; };
        h += '<div class="stcard" id="stProdCard" style="padding:0;overflow:hidden"><div style="background:linear-gradient(135deg,#1F3864,#2c4f8f);color:#fff;padding:12px 14px"><div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:180px"><div style="font-size:11px;letter-spacing:.08em;opacity:.8">🔎 ANÁLISIS DE PRODUCTO</div><div style="font-size:19px;font-weight:800;margin-top:2px">' + esc(p0.name) + '</div><div style="font-size:12.5px;margin-top:3px;opacity:.9"><span class="cb ' + esc(p0.chain) + '">' + esc(p0.chain) + '</span> · puesto #' + rank + ' de ' + AX.prods.length + '</div></div>' + rx.pill.replace('class="rpill"', 'class="rpill" style="background:#fff"') + '</div></div><div style="padding:12px 14px">' + rx.panel +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">' + AX.prods.slice(0, 6).map(function (p) { var k = p.chain + '|' + L.norm(p.name); return '<button class="chp' + (k === pk ? ' on' : '') + '" data-pp="' + esc(k) + '">' + esc(stTrunc(p.name, 20)) + '</button>'; }).join('') + '</div>' +
          '<input id="stProdQ" placeholder="Buscar otro producto…" style="width:100%;font-size:16px;padding:8px;margin-bottom:6px;box-sizing:border-box"><select id="stProd" style="width:100%;font-size:16px;padding:8px;margin-bottom:12px">' +
          AX.prods.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }); }).map(function (p) { var k = p.chain + '|' + L.norm(p.name); return '<option value="' + esc(k) + '"' + (k === pk ? ' selected' : '') + '>' + esc(p.chain + ' · ' + p.name) + '</option>'; }).join('') + '</select>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px">' + big((p0.kgq === 'es' ? '≈ ' : '') + wk(PA.kg) + '', 'kilos en el rango', cc) + (p0.frozen ? big(fmt(p0.bags), 'bolsas congeladas (500 g)', '#2a9d8f') : '') + (p0.cx ? big(fmt(p0.cx), p0.cxw, '#6a5acd') : '') + big(nO, 'órdenes') + big(share + '%', 'de lo medido (' + u + ')') + big(pdel == null ? '–' : '<span style="color:' + (pdel >= 0 ? '#1a7f37' : '#c62828') + '">' + (pdel >= 0 ? '▲ ' : '▼ ') + Math.abs(pdel) + '%</span>', 'vs ' + esc(Cx.R.plabel)) + '</div>' +
          '<h4 style="margin:14px 0 4px;color:#1F3864">A qué ciudades va</h4>' + stHBars(pcl.map(function (c, i) { var m = PA.cities[c]; return { l: c, v: mval(m), c: cityCol(c, i), x: Object.keys(m.o).length + ' ord.', t: '', tip: tHead(esc(c)) + tl(esc(p0.name.slice(0, 20)), '') + tl(ml(), mf(mval(m))) + tl('Kilos', wk(m.kg)) + tl('Órdenes', Object.keys(m.o).length) }; })) +
          '<h4 style="margin:14px 0 4px;color:#1F3864">Cuándo se pidió</h4>' + (e.ctype === 'line' ? stLines(stBuckets(pr, Cx.R)) : stCols(stBuckets(pr, Cx.R))) + '</div></div>';
      }
          h += '<details class="card"><summary style="cursor:pointer;font-weight:700">📋 Ver el detalle en tabla (' + A.prods.length + ' productos)</summary><div style="overflow-x:auto;margin-top:8px"><table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr><th style="text-align:left;padding:6px">#</th><th style="text-align:left;padding:6px">Producto</th><th style="padding:6px;text-align:right">Peso</th><th style="padding:6px;text-align:right">Empaque</th><th style="padding:6px;text-align:right">Órdenes</th><th style="padding:6px;text-align:right">vs anterior</th></tr></thead><tbody>';
      A.prods.forEach(function (p, i) {
        var b = B.P[p.chain + '|' + L.norm(p.name)], d = b && mval(b) ? Math.round((mval(p) - mval(b)) / mval(b) * 100) : null;
        h += '<tr style="border-top:1px solid var(--bd)"><td style="padding:6px" class="muted">' + (i + 1) + '</td><td style="padding:6px"><span class="cb ' + esc(p.chain) + '" style="margin-right:6px">' + esc(p.chain) + '</span>' + esc(p.name) + '</td>' +
          '<td style="padding:6px;text-align:right;white-space:nowrap"><b>' + (p.kg ? (p.kgq === 'es' ? '≈ ' : '') + wk(p.kg) : '–') + '</b>' + (!p.kg && p.qty ? ' <span class="muted">(' + fmt(p.qty) + ' ' + esc(p.word || '') + ')</span>' : '') + '</td>' +
          '<td style="padding:6px;text-align:right;white-space:nowrap">' + (packTxt(p) || '–') + '</td><td style="padding:6px;text-align:right">' + Object.keys(p.o).length + '</td>' +
          '<td style="padding:6px;text-align:right;white-space:nowrap;font-weight:700;color:' + (d == null ? '#999' : d >= 0 ? '#1a7f37' : '#c62828') + '">' + (d == null ? '–' : (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%') + '</td></tr>';
      });
      h += '</tbody></table></div></details><p class="muted" style="font-size:12px">Las cifras salen de los pedidos guardados, por fecha de entrega. «vs» compara con el mismo número de días justo antes (o el mes anterior). Los kg de productos en unidades son aproximados.</p>';

    }
    if (tab === 'dest') {
      var Cc = ctx('c'), AC = Cc.A, allCi = e.city ? [e.city] : cities, cl = allCi.slice().sort(function (a, b) { return (AC.cities[b] ? mval(AC.cities[b]) : 0) - (AC.cities[a] ? mval(AC.cities[a]) : 0) || a.localeCompare(b, 'es', { sensitivity: 'base' }); }), tmC = mval(AC.T) || 1;
      var cTip = function (c) { var m = AC.cities[c]; if (!m) return tHead(esc(c)) + '<div style="opacity:.8">Sin pedidos en estas fechas</div>'; var cp = AC.prods.filter(function () { return true; }), rowsC = Cc.rows.filter(function (d) { return d.city === c; }), PC = stAgg(rowsC), tp = PC.prods.filter(function (p) { return mval(p) > 0; }).slice(0, 4); return tHead(esc(c)) + tl(ml(), mf(mval(m))) + tl('Kilos', wk(m.kg)) + tl('Parte del total', Math.round(mval(m) / tmC * 100) + '%') + tl('Órdenes', Object.keys(m.o).length) + (tp.length ? '<div style="margin-top:5px;opacity:.7;font-size:10.5px;letter-spacing:.06em">LO QUE MÁS RECIBE</div>' + tp.map(function (p) { return tl(esc(stTrunc(p.name, 22)), mf(mval(p))); }).join('') : ''); };
      h += '<div class="stcard">' + stHead('Por destino (todas las ciudades)', 'c', Cc, '', 'Incluye todos los destinos con pedidos; los que no tienen en estas fechas salen en 0.') + stDonut(cl.map(function (c, i) { return { l: c, v: AC.cities[c] ? mval(AC.cities[c]) : 0, c: cityCol(c, i), tip: cTip(c) }; }), '', '') +
        '<div style="height:8px"></div>' + stHBars(cl.map(function (c, i) { var m = AC.cities[c]; return { l: c, v: m ? mval(m) : 0, c: cityCol(c, i), x: m ? Object.keys(m.o).length + ' ord.' : 'sin pedidos', t: '', tip: cTip(c) }; })) + '</div>';
      var dcs = e.dcity && cl.indexOf(e.dcity) >= 0 ? e.dcity : '', Cd = ctx('d'), rowsD = Cd.rows.filter(function (d) { return !dcs || d.city === dcs; }), AD = stAgg(rowsD), posD = AD.prods.filter(function (p) { return mval(p) > 0; }), topD = posD.slice(0, 8), restD = posD.slice(8).reduce(function (a, p) { return a + mval(p); }, 0), totD = posD.reduce(function (a, p) { return a + mval(p); }, 0) || 1, PALD = ['#1F3864', '#ed3237', '#f2a900', '#2e8b57', '#6a5acd', '#e07b39', '#2a9d8f', '#8d6e63'];
      h += '<div class="stcard">' + stHead('Productos más vendidos' + (dcs ? ' en ' + esc(dcs) : ' · todas las ciudades'), 'd', Cd, '', 'Escoge una ciudad. El círculo muestra qué parte es cada producto (' + u + ').') + '<div style="display:flex;flex-wrap:wrap;margin-bottom:6px"><button class="chp' + (!dcs ? ' on' : '') + '" data-dc="">Todas</button>' + cl.map(function (c) { return '<button class="chp' + (dcs === c ? ' on' : '') + '" data-dc="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
        (posD.length ? stDonut(topD.map(function (p, i) { return { l: p.name, v: mval(p), c: PALD[i % 8], tip: prodTip(p, totD) }; }).concat(restD > 0 ? [{ l: 'Otros', v: restD, c: '#bbb' }] : []), '', '') + '<div style="height:8px"></div>' + stHBars(topD.map(function (p, i) { return { l: p.name, v: mval(p), c: PALD[i % 8], es: p.kgq === 'es', x: prodX(p), t: p.chain, tip: prodTip(p, totD) }; })) : '<p class="muted">Sin pedidos para esta ciudad en estas fechas.</p>') + '</div>';
      var Ch = ctx('h'), AH = Ch.A, cityOrd = Object.keys(AH.cities).sort(function (a, b) { return mval(AH.cities[b]) - mval(AH.cities[a]); }), hm = {};
      Ch.rows.forEach(function (d) { var k = d.chain + '|' + L.norm(d.name), r = hm[k] = hm[k] || {}; mkAdd(r[d.city] = r[d.city] || mk(), d); });
      h += '<div class="stcard">' + stHead('¿Qué se vende en cada ciudad?', 'h', Ch, '', 'Los 12 productos principales por ciudad (' + u + '). Más oscuro = va más a esa ciudad. Toca un producto para ver su detalle.') + '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:13px;width:100%"><thead><tr><th style="text-align:left;padding:4px 6px">Producto</th>' + cityOrd.map(function (c) { return '<th style="padding:4px 6px;white-space:nowrap">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
      AH.prods.slice(0, 12).forEach(function (p) {
        var k = p.chain + '|' + L.norm(p.name), r = hm[k] || {}, g = function (c) { return r[c] ? mval(r[c]) : 0; }, mx = Math.max.apply(null, cityOrd.map(g).concat([1]));
        h += '<tr><td style="padding:4px 6px;white-space:nowrap"><a href="#" data-pp="' + esc(k) + '" style="color:inherit;text-decoration:underline dotted"><span class="cb ' + esc(p.chain) + '" style="margin-right:4px">' + esc(p.chain) + '</span>' + esc(stTrunc(p.name, 24)) + '</a></td>' + cityOrd.map(function (c) {
          var v = g(c), a = v ? 0.12 + 0.78 * v / mx : 0;
          return '<td' + (v ? ta(tHead(esc(c)) + tl(esc(stTrunc(p.name, 22)), '') + tl(ml(), mf(v)) + tl('Kilos', wk(r[c].kg)) + tl('Órdenes', Object.keys(r[c].o).length)) : '') + ' style="padding:6px;text-align:center;border:2px solid #fff;border-radius:6px;background:' + (v ? 'rgba(31,56,100,' + a.toFixed(2) + ')' : '#f3f3f3') + ';color:' + (a > 0.5 ? '#fff' : '#1F3864') + ';font-weight:600;white-space:nowrap">' + (v ? mf(v) : '') + '</td>';
        }).join('') + '</tr>';
      });
      h += '</tbody></table></div></div>';
    }
    if (tab === 'comp') {
      var MS = stMonths(), mA = e.mA && MS.indexOf(e.mA) >= 0 ? e.mA : MS[MS.length - 1], mB = e.mB && MS.indexOf(e.mB) >= 0 ? e.mB : (MS.length > 1 ? MS[MS.length - 2] : MS[0]);
      var ra = monRange(mA), rb = monRange(mB), XA = stAgg(stRows(ra[0], ra[1])), XB = stAgg(stRows(rb[0], rb[1])), nA = mLab(mA), nB = mLab(mB);
      var msel = function (id, cur) { return '<select id="' + id + '" style="font-size:16px;padding:7px">' + MS.map(function (m) { return '<option value="' + m + '"' + (m === cur ? ' selected' : '') + '>' + mLab(m) + '</option>'; }).join('') + '</select>'; };
      var chg = function (a, b) { if (!b) return a ? '<span class="muted">nuevo</span>' : '—'; var p = Math.round((a - b) / b * 100); if (!p) return '<b style="color:#777">= 0%</b>'; return '<b style="color:' + (p >= 0 ? '#1a7f37' : '#c62828') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%</b>'; };
      var trow = function (l, a, b, kg) { var ff = kg ? wk : function (x) { return fmt(Math.round(x)); }; return '<tr><td style="padding:6px 4px">' + l + '</td><td style="text-align:right;font-weight:700;color:#1F3864">' + ff(a) + '</td><td style="text-align:right;color:#666">' + ff(b) + '</td><td style="text-align:right">' + chg(a, b) + '</td></tr>'; };
      var uni = function (oa, ob, n) { var ks = {}; Object.keys(oa).concat(Object.keys(ob)).forEach(function (k) { ks[k] = 1; }); return Object.keys(ks).map(function (k) { return { l: k, a: oa[k] ? mval(oa[k]) : 0, b: ob[k] ? mval(ob[k]) : 0 }; }).filter(function (i) { return i.a || i.b; }).sort(function (x, y) { return Math.max(y.a, y.b) - Math.max(x.a, x.b); }).slice(0, n); };
      h += '<div class="stcard"><h3 style="margin:0 0 6px">📅 Mes contra mes</h3><div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap"><label class="muted" style="font-size:11px">Mes principal<br>' + msel('stMA', mA) + '</label><label class="muted" style="font-size:11px">Compararlo con<br>' + msel('stMB', mB) + '</label><button class="chp" id="stMSwap">⇄ Intercambiar</button></div>' +
        (mA === mB ? '<p class="muted">Escoge dos meses distintos.</p>' : '<table class="cmpT" style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px"><thead><tr style="color:#666;font-size:11px"><th style="text-align:left">Medida</th><th style="text-align:right">' + esc(nA) + '</th><th style="text-align:right">' + esc(nB) + '</th><th style="text-align:right">Cambio</th></tr></thead><tbody>' +
        trow('Órdenes', XA.ords, XB.ords) + trow('Kilos', XA.kg, XB.kg, 1) + trow('CX (Ara)', XA.cx, XB.cx) + (XA.bags || XB.bags ? trow('Bolsas congeladas', XA.bags, XB.bags) : '') + trow('Productos distintos', XA.prods.length, XB.prods.length) + trow('Destinos', Object.keys(XA.cities).length, Object.keys(XB.cities).length) + '</tbody></table>' +
        '<h4 style="margin:14px 0 4px">Por cadena · ' + ST_UL[meas].toLowerCase() + '</h4>' + stCompare([{ l: 'Ara', a: mval(XA.AR), b: mval(XB.AR) }, { l: 'Éxito', a: mval(XA.EX), b: mval(XB.EX) }], nA, nB) +
        '<h4 style="margin:14px 0 4px">Por destino · ' + ST_UL[meas].toLowerCase() + '</h4>' + stCompare(uni(XA.cities, XB.cities, 12), nA, nB) +
        '<h4 style="margin:14px 0 4px">Productos principales · ' + ST_UL[meas].toLowerCase() + '</h4>' + (function () { var pa = {}, pb = {}, nm = {}; Object.keys(XA.P).forEach(function (k) { pa[k] = XA.P[k]; nm[k] = XA.P[k].name; }); Object.keys(XB.P).forEach(function (k) { pb[k] = XB.P[k]; nm[k] = nm[k] || XB.P[k].name; }); return stCompare(uni(pa, pb, 10).map(function (i) { return { l: nm[i.l], a: i.a, b: i.b }; }), nA, nB); })() +
        '<p class="muted" style="font-size:12px">Por fecha de entrega, con los filtros de cadena y destino de arriba. La medida (kilos, CX, órdenes) se cambia arriba en «Medir en».</p>') + '</div>';
      var Ck = ctx('k'), AK = Ck.A, BK = Ck.B, cmpKeys = (e.cmp && e.cmp.length ? e.cmp.filter(function (k) { return k !== '-'; }) : AK.prods.filter(function (p) { return mval(p) > 0; }).slice(0, 6).map(function (p) { return p.chain + '|' + L.norm(p.name); })).filter(function (k) { return AK.P[k] || BK.P[k]; });
      var nameOf = function (k) { var p = AK.P[k] || BK.P[k]; return p ? p.name : k; }, pool = {}; Object.keys(AK.P).concat(Object.keys(BK.P)).forEach(function (k) { pool[k] = 1; });
      var addOpts = Object.keys(pool).filter(function (k) { return cmpKeys.indexOf(k) < 0; }).sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b), 'es', { sensitivity: 'base' }); });
      h += '<div class="stcard">' + stHead('Frente al período anterior', 'k', Ck, '', esc(Ck.R.label) + ' contra ' + esc(Ck.R.plabel) + ' · ' + ST_UL[meas].toLowerCase()) + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">' +
        cmpKeys.map(function (k) { return '<span style="display:inline-flex;align-items:center;gap:4px;background:#eef2fa;border-radius:99px;padding:4px 4px 4px 10px;font-size:12px">' + esc(stTrunc(nameOf(k), 24)) + '<button data-cx="' + esc(k) + '" style="border:0;background:#cfd8ee;border-radius:99px;width:22px;height:22px;cursor:pointer">✕</button></span>'; }).join('') + '</div>' +
        '<div class="row" style="gap:6px;margin-bottom:8px"><select id="stCmpAdd" style="flex:1;font-size:15px;padding:7px;min-width:0"><option value="">+ Agregar producto…</option>' + addOpts.map(function (k) { return '<option value="' + esc(k) + '">' + esc((AK.P[k] || BK.P[k]).chain + ' · ' + nameOf(k)) + '</option>'; }).join('') + '</select><button class="chp" id="stCmpReset">Primeros 6</button></div>';
      if (cmpKeys.length) h += stCompare(cmpKeys.map(function (k) { var a = AK.P[k], b = BK.P[k]; return { l: nameOf(k), a: a ? mval(a) : 0, b: b ? mval(b) : 0 }; }), Ck.R.label, Ck.R.plabel);
      else h += '<p class="muted">Elige productos para comparar.</p>';
      if (!BK.ords) h += '<p class="muted" style="font-size:12px">No hay pedidos en el período anterior; ese lado sale en 0.</p>';
      h += '</div>';
    }
    h += '<p class="muted" style="font-size:12px">Las cifras salen de los pedidos guardados, por fecha de entrega. «vs» compara con el mismo número de días justo antes (o el mes anterior). Los kg marcados con ≈ son estimados por el peso del nombre.</p>';
    el.innerHTML = h; stBind(el, R, A);
  }
  function stBind(el, R, A) {
    var go = function () { renderStats(); }, st = S.st;
    el.querySelectorAll('[data-pre]').forEach(function (b) { b.onclick = function () { st.preset = b.dataset.pre; go(); }; });
    var f = $('#stFrom'), t = $('#stTo'), cust = function () { if (f.value && t.value) { st.preset = 'custom'; st.from = f.value; st.to = t.value; go(); } };
    if (f) f.onchange = cust; if (t) t.onchange = cust;
    el.querySelectorAll('[data-ms]').forEach(function (b) { b.onclick = function () { st.measure = b.dataset.ms; go(); }; });
    el.querySelectorAll('[data-po]').forEach(function (b) { b.onclick = function () { st.pord = b.dataset.po; go(); }; });
    el.querySelectorAll('[data-dc]').forEach(function (b) { b.onclick = function () { st.dcity = b.dataset.dc; go(); }; });
    el.querySelectorAll('[data-gr]').forEach(function (b) { b.onclick = function () { st.gran = b.dataset.gr; go(); }; });
    el.querySelectorAll('[data-ct]').forEach(function (b) { b.onclick = function () { st.ctype = b.dataset.ct; go(); }; });
    el.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { st.tab = b.dataset.tab; go(); }; });
    el.querySelectorAll('[data-rp]').forEach(function (b) { b.onclick = function () { st.open[b.dataset.rp] = !st.open[b.dataset.rp]; go(); }; });
    el.querySelectorAll('[data-cr]').forEach(function (b) { b.onclick = function () { var p = b.dataset.cr.split('|'); st.cr[p[0]] = { preset: p[1] }; go(); }; });
    el.querySelectorAll('[data-crs]').forEach(function (b) { b.onclick = function () { delete st.cr[b.dataset.crs]; go(); }; });
    el.querySelectorAll('[data-cf]').forEach(function (i) { i.onchange = function () { var id = i.dataset.cf, a = el.querySelector('[data-cf="' + id + '"]').value, z = el.querySelector('[data-ctt="' + id + '"]').value; if (a && z) { st.cr[id] = { preset: 'custom', from: a, to: z }; go(); } }; });
    el.querySelectorAll('[data-ctt]').forEach(function (i) { i.onchange = function () { var id = i.dataset.ctt, a = el.querySelector('[data-cf="' + id + '"]').value, z = el.querySelector('[data-ctt="' + id + '"]').value; if (a && z) { st.cr[id] = { preset: 'custom', from: a, to: z }; go(); } }; });
    var ma = $('#stMA'), mb = $('#stMB'), msw = $('#stMSwap');
    if (ma) ma.onchange = function () { st.mA = this.value; go(); }; if (mb) mb.onchange = function () { st.mB = this.value; go(); };
    if (msw) msw.onclick = function () { var a = ma.value; st.mA = mb.value; st.mB = a; go(); };
    var c1 = $('#stCh'); if (c1) c1.onchange = function () { st.chain = this.value; go(); };
    var c2 = $('#stCi'); if (c2) c2.onchange = function () { st.city = this.value; go(); };
    el.querySelectorAll('[data-pp]').forEach(function (a) { a.onclick = function (ev) { ev.preventDefault(); st.prod = a.dataset.pp; if (st.tab !== 'prod') st.tab = 'prod'; go(); var x = $('#stProdCard'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    var sp = $('#stProd'); if (sp) sp.onchange = function () { st.prod = this.value; go(); };
    var sq = $('#stProdQ'); if (sq && sp) sq.oninput = function () { var q = L.norm(this.value); Array.prototype.forEach.call(sp.options, function (o) { o.hidden = !!q && L.norm(o.textContent).indexOf(q) < 0; }); var f1 = Array.prototype.find.call(sp.options, function (o) { return !o.hidden; }); if (q && f1) sp.value = f1.value; };
    var curCmp = function () { var k0 = ((st.cr.k ? stAgg(stRows(stRange(st.cr.k).from, stRange(st.cr.k).to)) : A)); return st.cmp && st.cmp.length ? st.cmp.filter(function (k) { return k !== '-'; }) : k0.prods.filter(function (p) { return mval(p) > 0; }).slice(0, 6).map(function (p) { return p.chain + '|' + L.norm(p.name); }); };
    el.querySelectorAll('[data-cx]').forEach(function (b) { b.onclick = function () { st.cmp = curCmp().filter(function (k) { return k !== b.dataset.cx; }); if (!st.cmp.length) st.cmp = ['-']; go(); }; });
    var ca = $('#stCmpAdd'); if (ca) ca.onchange = function () { if (this.value) { var c = curCmp(); c.push(this.value); st.cmp = c; go(); } };
    var cr = $('#stCmpReset'); if (cr) cr.onclick = function () { st.cmp = null; go(); };
    var dl = $('#stDl'); if (dl) dl.onclick = function () { stXlsx(R, A); };
    // ventana de detalle al pasar el mouse (o tocar en el celular)
    var tip = document.getElementById('stTip'), show = function (ev) {
      var t0 = ev.target.closest ? ev.target.closest('[data-tip]') : null;
      if (!t0 || !tip) { if (tip) tip.style.display = 'none'; return; }
      tip.innerHTML = S.stTips[+t0.getAttribute('data-tip')] || ''; tip.style.display = 'block';
      var w = tip.offsetWidth, h2 = tip.offsetHeight, x = ev.clientX + 14, y = ev.clientY + 14;
      if (x + w > window.innerWidth - 8) x = Math.max(8, ev.clientX - w - 14); if (y + h2 > window.innerHeight - 8) y = Math.max(8, ev.clientY - h2 - 14);
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    };
    el.onmouseover = show; el.onmousemove = show; el.onmouseleave = function () { if (tip) tip.style.display = 'none'; }; el.onclick = function (ev) { if (ev.target.closest && ev.target.closest('[data-tip]')) show(ev); else if (tip) tip.style.display = 'none'; };
  }
  async function stXlsx(R, A) {
    if (!S.dl) { toast('La descarga no está disponible en esta vista.'); return; }
    try {
      toast('Armando el Excel…');
      if (!window.ExcelJS) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js');
      var wb = new window.ExcelJS.Workbook(), fl = function (c) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c } }; };
      var sheet = function (name, head, rows, w) {
        var ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
        head.forEach(function (x, i) { var c = ws.getCell(1, i + 1); c.value = x; c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fl('1F3864'); c.alignment = { horizontal: 'center' }; ws.getColumn(i + 1).width = w[i] || 14; });
        rows.forEach(function (r, i) { r.forEach(function (v, j) { var c = ws.getCell(i + 2, j + 1); c.value = v; c.font = { name: 'Arial' }; if (typeof v === 'number') { c.numFmt = '#,##0.##'; c.alignment = { horizontal: 'center' }; } }); });
        var t = rows.length + 2; ws.getCell(t, 1).value = 'TOTAL'; ws.getCell(t, 1).font = { name: 'Arial', bold: true };
        return ws;
      };
      var rp = A.prods.map(function (p) { return [p.name, p.chain, Math.round(p.qty * 100) / 100, p.chain === 'Éxito' || p.word === 'kilos' ? 'kg' : (p.word || 'unid.'), Math.round(p.kg * 10) / 10, p.cx || 0, p.cxw, Object.keys(p.o).length, p.kgq === 'es' ? 'estimado' : p.kgq === 'no' ? 'sin peso' : 'exacto']; });
      var w1 = sheet('Productos', ['PRODUCTO', 'CADENA', 'CANTIDAD', 'UNIDAD', 'KG', 'CANAST./COSTALES', 'TIPO', 'ÓRDENES', 'KG ES'], rp, [42, 10, 12, 12, 12, 18, 12, 10, 12]);
      w1.getCell(rp.length + 2, 5).value = { formula: 'SUM(E2:E' + (rp.length + 1) + ')', result: A.kg }; w1.getCell(rp.length + 2, 5).font = { name: 'Arial', bold: true };
      var cr = Object.keys(A.cities).sort(function (a, b) { return A.cities[b].kg - A.cities[a].kg; }).map(function (c) { return [c, Math.round(A.cities[c].kg * 10) / 10]; });
      var w2 = sheet('Ciudades', ['CIUDAD', 'KG'], cr, [26, 14]); w2.getCell(cr.length + 2, 2).value = { formula: 'SUM(B2:B' + (cr.length + 1) + ')', result: A.kg }; w2.getCell(cr.length + 2, 2).font = { name: 'Arial', bold: true };
      var bk = stBuckets(stRows(R.from, R.to), R).filter(function (b) { return b.a.kg + b.e.kg > 0; }), dr = bk.map(function (b) { return [bTitle(b.k), Math.round(b.a.kg * 10) / 10, Math.round(b.e.kg * 10) / 10, Math.round((b.a.kg + b.e.kg) * 10) / 10]; });
      var w3 = sheet('Tiempo', ['PERÍODO', 'ARA KG', 'ÉXITO KG', 'TOTAL KG'], dr, [24, 14, 14, 14]); w3.getCell(dr.length + 2, 4).value = { formula: 'SUM(D2:D' + (dr.length + 1) + ')', result: A.kg }; w3.getCell(dr.length + 2, 4).font = { name: 'Arial', bold: true };
      var buf = await wb.xlsx.writeBuffer(), fn = 'Estadisticas ' + R.from + ' a ' + R.to + (S.st.chain ? ' ' + S.st.chain : '') + '.xlsx';
      await S.dl.save({ filename: fn, data: new Uint8Array(buf) });
      toast('Archivo listo: ' + fn);
    } catch (er) { if (!er || er.code !== 'declined') toast('No se pudo armar el Excel: ' + (er && er.message || er)); }
  }


  function renderHoy() {
    var el = $('#p-hoy'), all = histDetail();
    if (!all.length) { el.innerHTML = syncBanner() + '<div class="card"><h2>Todavía no hay pedidos</h2><p class="muted">Cuando llegue un pedido a la carpeta de Drive aparece aquí solo.</p></div>'; var s0 = $('#syncNow'); if (s0) s0.onclick = function () { driveSync(true); }; return; }
    var dates = uniq(all.map(hdate)).sort(function (a, b) { return dkey(b) - dkey(a); });
    var consV = S.hView === 'cons';
    if (!S.hoyDate || (dates.indexOf(S.hoyDate) < 0 && !(consV && S.hoyDate === '*'))) S.hoyDate = defaultDay(dates);
    var base = all.filter(function (d) { return S.hoyDate === '*' || hdate(d) === S.hoyDate; });
    var chainsDay = uniq(base.map(function (d) { return d.chain; })).sort(), cc = {}, bod = S.mode === 'bodega';
    base.forEach(function (d) { cc[d.chain] = (cc[d.chain] || 0) + 1; });
    if (bod || consV) { if (chainsDay.indexOf(S.bChain) < 0) S.bChain = chainsDay[0]; base = base.filter(function (d) { return d.chain === S.bChain; }); }
    if (!bod && !consV && S.oChain && chainsDay.indexOf(S.oChain) < 0) S.oChain = '';
    if (!bod && !consV && S.oChain) base = base.filter(function (d) { return d.chain === S.oChain; });
    var baseAll = base, q = L.norm(S.hq || '');
    var qs = (S.hq || '').split(',').map(function (x) { return L.norm(x).trim(); }).filter(Boolean);
    if (qs.length) base = base.filter(function (d) { var tx = L.norm([d.name, d.ara, d.sku, d.oc, d.city, d.chain].join(' ')); return qs.some(function (w) { return tx.indexOf(w) >= 0; }); });
    var cities = uniq(base.map(function (d) { return d.city; })).sort(function (a, b) { return a.localeCompare(b, 'es', { sensitivity: 'base' }); }), tot = O.stats(base), nOrd = {};
    base.forEach(function (d) { nOrd[d.chain + d.oc + d.city] = 1; });
    var cnt = histOrders().length, h = syncBanner();
    if (S.prevCnt != null && cnt > S.prevCnt && S.sync.state !== 'run') h += '<div class="banner ok">🆕 Llegaron <b>' + (cnt - S.prevCnt) + '</b> orden(es) nueva(s) desde la última vez que abriste la app.</div>';
    var ped = S.dateMode === 'ped';
    h += '<div class="hoyTop">' + calHtml(!bod && !consV && S.oChain ? all.filter(function (d) { return d.chain === S.oChain; }) : all, consV) +
      '<div class="card" style="padding:12px 14px"><div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:' + (ped ? '4' : '10') + 'px"><span class="muted" style="font-size:12px">Calendario por</span><div class="seg" style="margin:0"><button data-dm="ent"' + (ped ? '' : ' class="on"') + '>Fecha de entrega</button><button data-dm="ped"' + (ped ? ' class="on"' : '') + '>Fecha de pedido</button></div></div>' +
      (ped ? '<p class="muted" style="margin:0 0 10px;font-size:12px">Por el día en que se hizo el pedido. Si una orden no trae esa fecha, sale en su día de entrega.</p>' : '') +
      '<input id="hq" type="search" value="' + esc(S.hq || '') + '" placeholder="🔍 Buscar producto, orden o ciudad… (varios: tomate, papa)" style="width:100%;font-size:17px;padding:10px;box-sizing:border-box;margin-bottom:10px">' +
      '<div class="row" style="gap:10px"><button class="btn' + (consV ? ' sec' : '') + '" style="flex:1" data-hv="dest">📍 Por destino</button><button class="btn' + (consV ? '' : ' sec') + '" style="flex:1" data-hv="cons">📊 Consolidado del día</button></div></div></div>';
    if (!bod && !consV && chainsDay.length > 1) h += '<div class="row" style="gap:8px;margin:0 0 12px;align-items:center;flex-wrap:wrap"><span class="muted">Ver:</span>' + [['', 'Todos']].concat(chainsDay.map(function (c) { return [c, (c === 'Ara' ? '🔴 ' : '🟡 ') + c + ' (' + cc[c] + ')']; })).map(function (p) { return '<button class="btn' + ((S.oChain || '') === p[0] ? '' : ' sec') + ' sm" data-oc="' + esc(p[0]) + '">' + p[1] + '</button>'; }).join('') + '</div>';
    if (bod || consV) h += '<div class="row" style="gap:10px;margin:0 0 12px">' + chainsDay.map(function (c) { var on = c === S.bChain; return '<button class="btn' + (on ? '' : ' sec') + '" style="flex:1;font-size:18px;padding:14px" data-ch="' + esc(c) + '">' + (c === 'Ara' ? '🔴 ' : '🟡 ') + esc(c) + ' <small>(' + cc[c] + ' prod.)</small></button>'; }).join('') + '</div>';
    var unk = histOrders().filter(function (o) { return o.chain === 'Ara' && o.totalOk == null && o.declared != null; }).length;
    if (q && !base.length) h += '<div class="card"><p class="muted">Nada coincide con “' + esc(S.hq) + '” en este día.</p></div>';
    h += '<p class="muted" style="margin:0 0 10px">' + (q ? 'Resultado de la búsqueda: ' : '') + cities.length + ' destinos · ' + Object.keys(nOrd).length + ' órdenes · ' + base.length + ' productos</p>';
    var waQt = qs.length && base.length ? waSearch(base, (S.hq || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).join(', ')) : '';
    if (waQt) h += '<div class="card" style="padding:12px 14px"><div class="row" style="justify-content:space-between;gap:8px"><b>💬 Mensaje para WhatsApp</b><span class="muted" style="font-size:12px">por ciudad y al final el total</span></div><textarea id="waQ" readonly rows="9" style="width:100%;box-sizing:border-box;margin:8px 0;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace">' + esc(waQt) + '</textarea><div class="row" style="gap:8px"><a class="btn" id="waQb" target="_blank" rel="noopener" href="' + waLink(waQt) + '">💬 Enviar por WhatsApp</a><button class="btn sec" id="waQc">📋 Copiar mensaje</button></div></div>';
    if (consV) {
      h += '<div class="row" style="gap:8px;margin:0 0 10px;flex-wrap:wrap"><a class="btn sec" id="cWa" target="_blank" rel="noopener">💬 WhatsApp del consolidado</a><button class="btn" id="cDl">Descargar consolidado (Excel)</button><button class="btn sec" id="hAll">Descargar todo el día (una hoja por ciudad)</button></div>' + consHtml(base, cities);
      cities = [];
    }
    var cubAll = O.cubic(base);
    if (cities.length > 1 && cubAll.tot.cx) h += '<details class="card cubday" style="padding:10px 14px;margin:0 0 12px"><summary><b>🚚 Carga del día · Ara</b> <span class="muted">' + n1(cubAll.tot.cx) + ' cajas · ' + n1(cubAll.tot.est1, 1) + ' estibas · cubicaje ' + n1(cubAll.tot.cub, 1) + '</span></summary>' + cubHtml(cubAll.tot, true) + '<table class="cubtb"><tr><th>Destino</th><th>Cajas</th><th>Estibas</th><th>Cubicaje</th><th>Peso</th></tr>' + Object.keys(cubAll.by).sort().map(function (k) { var t = cubAll.by[k]; return '<tr><td>' + esc(k) + '</td><td>' + n1(t.cx) + '</td><td>' + n1(t.est1, 1) + '</td><td>' + n1(t.cub, 1) + '</td><td>' + wk(t.total) + '</td></tr>'; }).join('') + '</table></details>';
    h += '<div class="ccards">';
    cities.forEach(function (c) {
      var rows = base.filter(function (d) { return d.city === c; }), st = O.stats(rows), key = (S.dateMode === 'ped' ? 'P' : '') + S.hoyDate + '|' + c + (bod ? '|' + S.bChain : ''), sv = S.hist.status[key] || 'nuevo', kg = 0, ch = {};
      rows.forEach(function (d) { kg += d.kg; (ch[d.chain] = ch[d.chain] || {})[d.oc] = 1; });
      var col = CITY_COL[L.norm(c).replace(/ /g, '')] || '#BFBFBF';
      var isOpen = S.openList === c || q;
      h += '<div class="card ccard' + (isOpen ? ' open' : '') + '" data-card="' + esc(c) + '" style="margin:0;padding:12px 14px;border-top:6px solid ' + col + '"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">' + esc(c) + '</h3><button class="btn sec sm" data-st="' + esc(key) + '">' + STAT_T[sv] + '</button></div>' +
        '<div style="margin:6px 0;line-height:1.5">' + Object.keys(ch).map(function (k) { return '<span class="cb ' + esc(k) + '">' + esc(k) + '</span> <span class="muted" style="font-size:12px">' + Object.keys(ch[k]).map(function (o) { return srcLink(k, o, c); }).join(' · ') + '</span>'; }).join('<br>') + '</div>' +
        progHtml(c, rows) + cubHtml(cubAll.by[c]) +
        '<div class="row" style="gap:8px;margin:0 0 8px;flex-wrap:wrap"><button class="btn' + (isOpen ? '' : ' sec') + ' sm" data-ls="' + esc(c) + '">' + (isOpen ? '▴ Cerrar lista' : '☑ Abrir lista') + '</button><a class="btn sec sm" target="_blank" rel="noopener" href="' + waLink(waCity(c, (qs.length ? base : baseAll).filter(function (d) { return d.city === c; }))) + '">💬 WhatsApp</a></div>' +
        (isOpen ? checkList(c, rows) : '') +
        '<div class="row" style="justify-content:space-between;align-items:center;gap:8px"><button class="btn sm" data-dl="' + esc(c) + '">Descargar Excel</button>' + (kg ? '<span class="muted" style="font-size:12px;white-space:nowrap">' + wk(kg) + '</span>' : '') + '</div></div>';
    });
    h += '</div>';
    var bad = histOrders().filter(function (o) { return o.unread > 0 || o.totalOk === false || (o.poDate && o.date && dkey(o.date) < dkey(o.poDate)); });
    if (bad.length) h += '<div class="banner" style="background:#fff3cd;border-color:#e0a800">⚠️ <b>' + bad.length + ' orden(es) por revisar</b> (total distinto al del PDF, líneas sin leer o fecha de entrega anterior al pedido): ' + '<ul style="margin:6px 0 0;padding-left:18px">' + bad.map(function (o) { return '<li>' + esc(o.chain + ' ' + o.oc + ' ' + o.city + (o.poDate && o.date && dkey(o.date) < dkey(o.poDate) ? ' (entrega ' + o.date + ')' : '')) + ' — ' + ordLinks(o) + '</li>'; }).join('') + '</ul></div>';
    el.innerHTML = h;
    var wc = $('#waQc'); if (wc) wc.onclick = function () { var ta = $('#waQ'); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (x) {} if (!ok && navigator.clipboard) navigator.clipboard.writeText(ta.value).then(function () { toast('Mensaje copiado'); }, function () {}); else toast(ok ? 'Mensaje copiado' : 'Selecciona el texto y cópialo'); };
    var sn = $('#syncNow'); if (sn) sn.onclick = function () { driveSync(true); };
    $('#hq').oninput = function () { var p = this.selectionStart; S.hq = this.value; renderHoy(); var n = $('#hq'); n.focus(); try { n.setSelectionRange(p, p); } catch (x) {} };
    el.querySelectorAll('[data-day]').forEach(function (b) { b.onclick = function () { S.hoyDate = b.dataset.day; S.openList = ''; renderHoy(); }; });
    el.querySelectorAll('[data-cm]').forEach(function (b) { b.onclick = function () { var p = calYM(), d = new Date(p[0], p[1] - 1 + (+b.dataset.cm), 1); S.calM = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); renderHoy(); }; });
    var ca = $('#calAll'); if (ca) ca.onclick = function () { S.hoyDate = '*'; renderHoy(); };
    el.querySelectorAll('[data-oc]').forEach(function (b) { b.onclick = function () { S.oChain = b.dataset.oc; S.openList = ''; renderHoy(); }; });
    el.querySelectorAll('[data-dm]').forEach(function (b) { b.onclick = function () { if (S.dateMode === b.dataset.dm) return; S.dateMode = b.dataset.dm; S.hoyDate = ''; S.openList = ''; renderHoy(); }; });
    var ctg = $('#calTg'); if (ctg) ctg.onclick = function () { S.calOpen = S.calOpen === false; renderHoy(); };
    el.querySelectorAll('[data-ch]').forEach(function (b) { b.onclick = function () { S.bChain = b.dataset.ch; S.openList = ''; renderHoy(); }; });
    el.querySelectorAll('[data-ls]').forEach(function (b) { b.onclick = function () { S.openList = S.openList === b.dataset.ls ? '' : b.dataset.ls; renderHoy(); }; });
    el.querySelectorAll('[data-pks]').forEach(function (b) { b.onchange = function () { b.dataset.pks.split('\u00a6').forEach(function (k) { if (b.checked) S.hist.picked[k] = (S.user && S.user.name) || 1; else delete S.hist.picked[k]; }); saveHist(); var lb = b.closest('label'); if (lb) lb.classList.toggle('done', b.checked); updList(b.dataset.c); }; });
    el.querySelectorAll('[data-pf]').forEach(function (b) { b.onclick = function () { S.pendOnly = b.dataset.pf === 'pend'; var box = b.closest('.ckl'); box.classList.toggle('pend', S.pendOnly); b.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    el.querySelectorAll('[data-lq]').forEach(function (inp) { inp.oninput = function () { var w = L.norm(inp.value).trim(), box = inp.closest('.ckl'), any = 0; box.querySelectorAll('label.ck').forEach(function (l) { var ok = !w || l.dataset.nm.indexOf(w) >= 0; l.style.display = ok ? '' : 'none'; if (ok) any++; }); box.querySelectorAll('details.grp').forEach(function (g) { var vis = [].some.call(g.querySelectorAll('label.ck'), function (l) { return l.style.display !== 'none'; }); g.style.display = vis ? '' : 'none'; if (w && vis) g.open = true; }); box.querySelector('.ckno').style.display = any ? 'none' : ''; }; });
    el.querySelectorAll('[data-hv]').forEach(function (b) { b.onclick = function () { S.hView = b.dataset.hv; if (S.hView === 'dest' && S.hoyDate === '*') S.hoyDate = ''; S.openList = ''; renderHoy(); }; });
    var cw = $('#cWa'); if (cw) { cw.href = waLink(consWa(base)); $('#cDl').onclick = function () { dlCons(baseAll.filter(function (d) { return d.chain === S.bChain; }), 'Consolidado ' + S.bChain + ' ' + (S.hoyDate === '*' ? 'todos los dias' : S.hoyDate) + '.xlsx'); }; }
    el.querySelectorAll('[data-ck]').forEach(function (b) { b.onchange = function () { if (b.checked) S.hist.picked[b.dataset.ck] = (S.user && S.user.name) || 1; else delete S.hist.picked[b.dataset.ck]; saveHist(); var tr = b.closest('tr'); tr.style.opacity = b.checked ? '.45' : ''; var n = el.querySelectorAll('[data-ck]'), d = 0; n.forEach(function (x) { if (x.checked) d++; }); $('#consCnt').textContent = d + ' / ' + n.length + ' productos sacados'; }; });
    var ha = $('#hAll'); if (ha) ha.onclick = function () { dlOla(baseAll, false, 'Pedidos OLA ' + dayTxt() + '.xlsx', { merge: true }); };
    el.querySelectorAll('[data-dl]').forEach(function (b) { b.onclick = function () { var c = b.dataset.dl; dlOla(baseAll.filter(function (d) { return d.city === c; }), false, 'Pedido ' + c + ' ' + S.hoyDate.replace(/\//g, '-') + '.xlsx', { merge: true }); }; });
    el.querySelectorAll('[data-st]').forEach(function (b) { b.onclick = function () { var k = b.dataset.st, cur = S.hist.status[k] || 'nuevo'; S.hist.status[k] = STAT[(STAT.indexOf(cur) + 1) % 3]; saveHist(); renderHoy(); }; });
  }

  // ---- pantalla "Exportar Excel": elegir día, destino, cadena y tipo de archivo
  S.ex = S.ex || { date: '', chain: '', kind: 'dest', prices: false, sel: {} };
  function expRows() {
    var e = S.ex;
    return histDetail().filter(function (d) { return (!e.date || d.date === e.date) && (!e.city || d.city === e.city) && (!e.chain || d.chain === e.chain); });
  }
  function renderExp() {
    var el = $('#p-exp'), all = histDetail(), e = S.ex;
    if (!all.length) { el.innerHTML = '<div class="card"><h2>Exportar Excel</h2><p class="muted">Cuando haya pedidos cargados podrás elegir aquí qué Excel bajar.</p></div>'; return; }
    var dates = uniq(all.map(dateOf)).sort(function (a, b) { return dkey(b) - dkey(a); });
    if (e.date && dates.indexOf(e.date) < 0) e.date = '';
    var base = all.filter(function (d) { return (!e.date || dateOf(d) === e.date) && (!e.chain || d.chain === e.chain); });
    var cities = uniq(all.filter(function (d) { return !e.date || dateOf(d) === e.date; }).map(function (d) { return d.city; })).sort();
    var chains = uniq(all.filter(function (d) { return !e.date || dateOf(d) === e.date; }).map(function (d) { return d.chain; }));
    e.sel = e.sel || {};
    cities.forEach(function (c) { if (e.sel[(e.date || '*') + '|' + c] === undefined) e.sel[(e.date || '*') + '|' + c] = true; });
    var pick = cities.filter(function (c) { return e.sel[(e.date || '*') + '|' + c]; });
    var rows = base.filter(function (d) { return pick.indexOf(d.city) >= 0; }), ords = {};
    rows.forEach(function (d) { ords[d.chain + d.city + d.oc] = 1; });
    var rb = function (v, t, sub) { return '<label style="display:block;margin:0 0 6px;padding:8px 12px;border:1px solid var(--bd);border-radius:10px;cursor:pointer;' + (e.kind === v ? 'border-color:#c8102e;box-shadow:0 0 0 2px #c8102e33' : '') + '"><input type="radio" name="xk" value="' + v + '"' + (e.kind === v ? ' checked' : '') + '> <b>' + t + '</b> <span class="muted">· ' + sub + '</span></label>'; };
    el.innerHTML = '<div class="card"><h2>Exportar Excel</h2>' +
      '<div class="row" style="gap:14px;flex-wrap:wrap;margin:6px 0 12px">' +
      '<label class="muted">Día<br><select id="xd">' + opts(dates, e.date, 'Todos los días') + '</select></label>' +
      '<label class="muted">Cadena<br><select id="xh">' + opts(chains, e.chain, 'Ara + Éxito') + '</select></label></div>' +
      '<div style="margin:4px 0"><b>Destinos</b> <a href="#" id="xall" class="muted">todos</a> · <a href="#" id="xnone" class="muted">ninguno</a></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;margin-bottom:12px">' +
      cities.map(function (c, i) { var n = base.filter(function (d) { return d.city === c; }).length, col = CITY_COL[L.norm(c).replace(/ /g, '')] || '#BFBFBF';
        return '<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--bd);border-left:6px solid ' + col + ';border-radius:8px;cursor:pointer"><input type="checkbox" data-xc="' + i + '"' + (e.sel[(e.date || '*') + '|' + c] ? ' checked' : '') + '> <b>' + esc(c) + '</b> <span class="muted" style="font-size:12px">' + n + ' prod.</span></label>'; }).join('') + '</div>' +
      '<label style="display:block;margin:0 0 10px"><input type="checkbox" id="xcons"' + (e.consol !== false ? ' checked' : '') + '> Incluir hoja <b>Consolidado</b> (todos los destinos elegidos en una tabla)</label>' +
      '<div style="margin:4px 0"><b>Cómo armar las hojas de destino</b></div>' +
      rb('dest', 'Una hoja por destino', 'junta Ara y Éxito; en observación va la OC de cada línea') +
      rb('ord', 'Una hoja por orden', 'una hoja por cada OC') +
      (S.unlocked ? '<label class="muted" style="display:block;margin-top:6px"><input type="checkbox" id="xp"' + (e.prices ? ' checked' : '') + '> Incluir precios y valores (solo Cuentas)</label>' : '') +
      '<div class="row" style="margin-top:12px;justify-content:space-between;align-items:center"><span class="muted">' + pick.length + ' destino(s) · ' + Object.keys(ords).length + ' orden(es) · ' + rows.length + ' línea(s)</span><button class="btn" id="xgo"' + (rows.length ? '' : ' disabled') + '>Descargar Excel</button></div></div>';
    $('#xd').onchange = function () { e.date = this.value; e.chain = ''; renderExp(); };
    $('#xh').onchange = function () { e.chain = this.value; renderExp(); };
    el.querySelectorAll('[data-xc]').forEach(function (b) { b.onchange = function () { e.sel[(e.date || '*') + '|' + cities[+b.dataset.xc]] = b.checked; renderExp(); }; });
    $('#xall').onclick = function (ev) { ev.preventDefault(); cities.forEach(function (c) { e.sel[(e.date || '*') + '|' + c] = true; }); renderExp(); };
    $('#xnone').onclick = function (ev) { ev.preventDefault(); cities.forEach(function (c) { e.sel[(e.date || '*') + '|' + c] = false; }); renderExp(); };
    $('#xcons').onchange = function () { e.consol = this.checked; };
    document.querySelectorAll('input[name=xk]').forEach(function (r) { r.onchange = function () { e.kind = this.value; renderExp(); }; });
    if ($('#xp')) $('#xp').onchange = function () { e.prices = this.checked; };
    $('#xgo').onclick = function () {
      var nm = 'Pedidos OLA ' + (e.date ? 'entrega ' + e.date : 'todos los dias') + (pick.length === 1 ? ' ' + pick[0] : pick.length < cities.length ? ' ' + pick.length + ' destinos' : '') + (e.chain ? ' ' + e.chain : '') + (e.prices && S.unlocked ? ' con precios' : '') + '.xlsx';
      dlOla(rows, !!(e.prices && S.unlocked), nm.replace(/[\\\/:*?"<>|]/g, '-'), { merge: e.kind !== 'ord', noConsol: e.consol === false });
    };
  }
  function dlTblOla() { dlOla(tblRows(), false, 'Pedidos OLA' + (S.tf.chain ? ' ' + S.tf.chain : '') + (S.tf.date ? ' ' + S.tf.date : '') + '.xlsx'); }
  function dlTbl() {
    var rows = tblRows(), A = [['Cadena', 'Entrega', 'Pedido', 'OC', 'Ciudad', 'Código', 'Producto', 'Presentación', 'Cajas', 'Und por caja', 'Cantidad', 'Unidad', 'Peso aprox. (kg)']];
    rows.forEach(function (d, i) { A.push([d.chain, d.date, d.recv, d.oc, d.city, d.sku, d.ara || d.name, d.pres, d.cx || '', d.emb || '', d.qty, d.word, d.kg || '']); });
    var n = rows.length + 1;
    A.push(['TOTAL', '', '', '', '', '', '', '', { t: 'n', f: 'SUBTOTAL(109,I2:I' + n + ')' }, '', '', '', { t: 'n', f: 'SUBTOTAL(109,M2:M' + n + ')' }]);
    var ws = XLSX.utils.aoa_to_sheet(A); ws['!cols'] = [{ wch: 8 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 12 }, { wch: 34 }, { wch: 22 }, { wch: 8 }, { wch: 11 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
    ws['!autofilter'] = { ref: 'A1:M' + n };
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Pedidos'); wb.Workbook = { CalcPr: { fullCalcOnLoad: true } };
    saveXlsx(wb, 'Pedidos' + (S.tf.chain ? ' ' + S.tf.chain : '') + '.xlsx');
  }

  // ---------------------------------------------------------------- hoja para pedir
  function copyStr(txt, okMsg) {
    var ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    var done = false; try { done = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (!done && navigator.clipboard) { navigator.clipboard.writeText(txt).then(function () { toast(okMsg); }, function () { toast('No se pudo copiar'); }); } else toast(done ? okMsg : 'No se pudo copiar');
  }
  function renderWork() {
    var el = $('#p-work');
    if (!S.files.length) { el.innerHTML = '<div class="card"><p class="muted">Carga un pedido en el paso 1 y aquí aparece todo listo para pedir.</p></div>'; return; }
    var d = curData(), cons = d.cons, groups = d.groups, dt = orderDateText(), h = '';
    var tcx = 0, nprod = cons.rows.length; cons.rows.forEach(function (r) { tcx += r.cx; });
    var un = groups.filter(function (g) { return g.name === 'SIN ASIGNAR'; })[0], ng = groups.length - (un ? 1 : 0);
    var bad = S.files.filter(function (f) { return f.totalOk === false; });
    h += '<div class="hero"><div class="kpi"><b>' + esc(dt || '—') + '</b><span>fecha para el proveedor</span></div><div class="kpi"><b>' + S.files.length + '</b><span>órdenes (' + esc(cons.cities.join(', ')) + ')</span></div><div class="kpi"><b>' + nprod + '</b><span>productos distintos</span></div><div class="kpi"><b>' + fmt(tcx) + '</b><span>cajas en total</span></div><div class="kpi"><b>' + ng + '</b><span>proveedores</span></div></div>';
    S.files.forEach(function (f) { if (f.totalOk === true) return; });
    if (bad.length) h += '<div class="banner bad"><b>Revisar:</b> el total de ' + bad.map(function (f) { return esc(f.city + ' ' + f.oc); }).join(', ') + ' no coincide con el PDF. Puede que falte alguna línea.</div>';
    else if (S.files.some(function (f) { return f.totalOk === true; })) h += '<div class="banner ok">Control: la suma de cada PDF coincide con su total declarado.</div>';
    if (un) h += '<div class="banner bad"><b>' + un.rows.length + ' productos (' + fmt(un.cx) + ' cajas) sin proveedor.</b> Están al final de esta hoja; asigna proveedor en <a href="#" data-go="cons">Consolidado</a> para incluirlos.</div>';

    var sum = L.daySummary(S.files, groups, dt);
    h += '<div class="card"><div class="row" style="justify-content:space-between"><h2>Resumen del día</h2><button class="btn sm" data-wcopy="sum">Copiar resumen</button></div><div class="sum" id="sum">' + esc(sum) + '</div></div>';

    var doneN = groups.filter(function (g) { return S.done[g.name]; }).length, totN = groups.length - (un ? 1 : 0);
    h += '<div class="row" style="margin:6px 0 10px"><h2 style="margin:0;font-size:17px">Qué pedir a cada proveedor</h2><span class="chip">' + doneN + ' de ' + totN + ' pedidos hechos</span><span class="muted">Marca el proveedor cuando ya hiciste su pedido.</span></div>';
    groups.forEach(function (g, gi) {
      var isUn = g.name === 'SIN ASIGNAR', done = !!S.done[g.name];
      h += '<div class="sup' + (isUn ? ' un' : '') + (done ? ' done' : '') + '"><div class="hd"><div class="row">' +
        (isUn ? '' : '<input type="checkbox" data-done="' + esc(g.name) + '"' + (done ? ' checked' : '') + ' title="Pedido hecho">') +
        '<h3>' + esc(g.name) + '</h3><span class="chip' + (isUn ? ' bad' : '') + '">' + g.rows.length + ' productos</span></div><div class="big">' + fmt(g.cx) + ' cajas</div></div>';
      h += '<div class="tablewrap" style="max-height:none;border:0;border-radius:0"><table><thead><tr><th>Producto</th><th>Caja</th><th class="n">Cajas</th><th class="n">Cantidad</th><th>Por ciudad</th></tr></thead><tbody>';
      g.rows.forEach(function (r) {
        h += '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.caja) + '</td><td class="q">' + fmt(r.cx) + '</td><td class="n">' + fmt(r.qty) + ' ' + esc(r.unit) + '</td><td>' +
          cons.cities.filter(function (c) { return r.by[c] && r.by[c].cx; }).map(function (c) { return '<span class="pill">' + esc(L.cityShort(c)) + ' ' + fmt(r.by[c].cx) + '</span>'; }).join('') + '</td></tr>';
      });
      h += '</tbody></table></div>';
      if (!isUn) h += '<div class="ft"><button class="btn sm" data-wa="' + gi + '">Copiar mensaje de WhatsApp</button><button class="btn sec sm" data-dlp="' + esc(g.name) + '">Descargar Excel</button><span class="muted">El mensaje queda corto, una línea por producto.</span></div>';
      h += '</div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-done]').forEach(function (c) { c.onchange = function () { S.done[c.dataset.done] = c.checked; renderWork(); }; });
    el.querySelectorAll('[data-wa]').forEach(function (b) { b.onclick = function () { copyStr(L.waText(groups[+b.dataset.wa], cons.cities, dt), 'Mensaje copiado'); }; });
    el.querySelectorAll('[data-dlp]').forEach(function (b) { b.onclick = function () { dlProvider(b.dataset.dlp); }; });
    var wc = el.querySelector('[data-wcopy]'); if (wc) wc.onclick = function () { copyStr(sum, 'Resumen copiado'); };
  }

  // ---------------------------------------------------------------- lectura de archivos
  function readBuf(file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(file); }); }

  function pdfLib() {
    var lib = window.pdfjsLib;
    if (!lib) throw new Error('pdfjs');
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return lib;
  }
  function withTimeout(p, ms, msg) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error(msg)); }, ms); })]);
  }
  async function pdfDoc(buf) { return withTimeout(pdfLib().getDocument({ data: new Uint8Array(buf.slice(0)) }).promise, 30000, 'pdf_timeout'); }
  async function pdfText(doc) {
    var text = '';
    for (var p = 1; p <= doc.numPages; p++) {
      var tc = await (await doc.getPage(p)).getTextContent();
      text += L.textFromItems(tc.items.map(function (i) { return { str: i.str, x: i.transform[4], y: i.transform[5] }; })) + '\n';
    }
    return text;
  }
  async function pdfImages(doc) {
    var out = [];
    for (var p = 1; p <= Math.min(doc.numPages, 6); p++) {
      var page = await doc.getPage(p), vp = page.getViewport({ scale: 1.6 });
      var cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      out.push(await new Promise(function (r) { cv.toBlob(r, 'image/png'); }));
    }
    return out;
  }

  var AI_PROMPT = 'Eres un asistente de logística. Extrae el pedido de compra de un supermercado a partir del contenido que sigue. ' +
    'Responde SOLO con un JSON de la forma {"ciudad":string|null,"orden_compra":string|null,"fecha_entrega":string|null,' +
    '"lineas":[{"codigo":string|null,"producto":string,"unidad":"KG"|"UD"|null,"caja":string|null,"und_por_caja":number|null,"cajas":number|null,"cantidad":number|null}]}. ' +
    'Reglas: "cajas" es el número de cajas o bultos pedidos; "cantidad" es la cantidad en la unidad de venta (kilos o unidades); ' +
    '"und_por_caja" es cuántas unidades o kilos trae cada caja. Ignora precios, totales, resúmenes de empaque y cualquier fila que no sea un producto. ' +
    'Si un dato no aparece usa null. No inventes productos.';
  async function aiExtract(text, images) {
    if (!S.sample) throw { code: 'no_ai', message: 'La lectura con IA no está disponible en esta vista.' };
    var opt = { modelTier: 'default' };
    if (images && images.length) {
      if (!S.images) throw { code: 'no_images', message: 'Esta vista no permite enviar imágenes a la IA.' };
      opt.images = images;
    }
    var obj = await S.sample.json(AI_PROMPT + (text ? '\n\nCONTENIDO:\n' + text : '\n\nLas imágenes adjuntas son el pedido.'), opt);
    return L.fromAI(obj);
  }
  function aiErr(e) {
    var m = { not_granted: 'No diste permiso para usar la IA.', rate_limited: 'Demasiadas lecturas seguidas; espera un momento.', no_ai: e && e.message, no_images: e && e.message, invalid_json: 'La IA no devolvió un formato válido; intenta de nuevo.' };
    return m[e && e.code] || ('No se pudo leer con IA' + (e && e.code ? ' (' + e.code + ')' : '') + '.');
  }

  function addPO(po, name, source) {
    if (!po.lines.length) { toast('No se encontraron productos en ' + name); return; }
    // evita duplicar la misma orden de compra
    if (po.oc && S.files.some(function (f) { return f.oc === po.oc && f.city === po.city && f.source === source; })) { lastStatus = lastStatus || 'dup'; return; }
    if (!po.poDate) { var fm = /^(\d{4})-(\d{2})-(\d{2})/.exec(name); if (fm) po.poDate = fm[3] + '.' + fm[2] + '.' + fm[1]; }
    po.id = ++uid; po.driveId = curFileId; po.mailUrl = curMail; po.name = name; po.source = source; po.open = false;
    S.files.push(po);
  }

  var lastStatus = '', curFileId = '', curMail = '';
  async function processFile(file) {
    lastStatus = '';
    var name = file.name, ext = (name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'pdf') {
        var buf = await readBuf(file), doc = await pdfDoc(buf);
        var po = L.parsePdfText(await pdfText(doc));
        if (po) { addPO(po, name, 'PDF'); return; }
        var imgs = await pdfImages(doc);
        addPO(await aiExtract('', imgs), name, 'PDF + IA');
      } else if (/^(xlsx|xls|csv|xlsm|xlsb|ods|tsv)$/.test(ext)) {
        var wb = XLSX.read(await readBuf(file), { type: 'array' });
        for (var i = 0; i < wb.SheetNames.length; i++) {
          var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, raw: true, defval: '' });
          if (!rows.length) continue;
          var ex = L.parseExito(rows);
          if (ex) {
            if (!ex.length) { lastStatus = 'empty'; }
            ex.forEach(function (p) { addPO(p, name + ' · orden ' + p.oc, 'Excel Éxito'); });
            continue;
          }
          var d = L.parseDirect(rows), label = name + (wb.SheetNames.length > 1 ? ' [' + wb.SheetNames[i] + ']' : '');
          if (d) addPO(d, label, 'Excel'); else addPO(await aiExtract(L.sheetToText(rows), null), label, 'Excel + IA');
        }
      } else if (ext === 'txt') {
        await processText(await file.text(), name);
      } else if (/^(png|jpe?g|webp|gif)$/.test(ext)) {
        addPO(await aiExtract('', [file]), name, 'Imagen + IA');
      } else {
        toast('Formato no admitido: ' + name + '. Usa PDF, Excel, texto o imagen.');
      }
    } catch (e) {
      var msg = e && e.message === 'pdfjs' ? 'No se pudo cargar el lector de PDF.' : e && e.message === 'pdf_timeout' ? 'El PDF tardó demasiado en abrirse. Prueba pegando su texto.' : aiErr(e);
      toast(name + ': ' + msg);
    }
  }
  async function processFiles(list) {
    S.busy++; renderAll();
    for (var i = 0; i < list.length; i++) await processFile(list[i]);
    S.busy--; syncHist();
    if (S.files.length) { toast('Listo: ' + S.files.length + ' pedido(s) leído(s) y guardado(s) en Cuentas'); setTab('tbl'); } else renderAll();
  }
  async function processText(text, label) {
    S.busy++; renderAll();
    try {
      var po = L.parsePdfText(text);
      if (po) addPO(po, label, 'Texto'); else addPO(await aiExtract(text.slice(0, 200000), null), label, 'Texto + IA');
    } catch (e) { toast(aiErr(e)); }
    S.busy--; syncHist(); if (S.files.length) setTab('tbl'); else renderAll();
  }

  // ---------------------------------------------------------------- Gmail
  function pick(o, names) { for (var i = 0; i < names.length; i++) if (o && o[names[i]] != null) return o[names[i]]; return undefined; }
  function b64ToFile(b64, name) {
    var s = String(b64).replace(/-/g, '+').replace(/_/g, '/'), bin = atob(s), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new File([u], name);
  }
  async function gmailSearch() {
    S.gmail.msg = 'Buscando…'; renderLoad();
    try {
      var r = await S.mcp.callTool('Gmail', 'search_threads', { query: S.gmail.q, pageSize: 10, view: 'THREAD_VIEW_MINIMAL' });
      var p = r.payload; var th = (p && p.threads) || (Array.isArray(p) ? p : []);
      S.gmail.threads = th.map(function (t) {
        var m = (t.messages && t.messages[0]) || {};
        return { id: t.id, subject: pick(m, ['subject']) || pick(t, ['subject', 'snippet']) || '(sin asunto)', from: pick(m, ['sender']) || '', date: pick(m, ['date']) || '' };
      });
      S.gmail.msg = th.length ? '' : 'No hay correos con esa búsqueda.';
    } catch (e) { S.gmail.msg = gmailErr(e); }
    renderLoad();
  }
  function gmailErr(e) {
    var c = e && e.code;
    if (c === 'server_not_connected') return 'Gmail no está conectado en tu cuenta de Claude (Ajustes → Conectores).';
    if (c === 'needs_reauth') return 'Vuelve a conectar Gmail en Ajustes → Conectores.';
    if (c === 'approval_required' || c === 'not_in_manifest' || c === 'consent_required') return 'Necesitas permitir que esta página lea Gmail.';
    return 'No se pudo leer Gmail' + (c ? ' (' + c + ')' : '') + '.';
  }
  async function gmailRead(id) {
    S.gmail.open[id] = { loading: true }; renderLoad();
    try {
      var r = await S.mcp.callTool('Gmail', 'get_thread', { threadId: id, messageFormat: 'PLAIN_TEXT' });
      var msgs = (r.payload && r.payload.messages) || [], atts = [], body = [];
      msgs.forEach(function (m) {
        var b = pick(m, ['plaintext_body', 'plaintextBody', 'body']); if (b) body.push(String(b));
        (m.attachments || []).forEach(function (a) { atts.push(a); });
      });
      S.gmail.open[id] = { body: body.join('\n\n---\n\n'), atts: atts };
      var got = 0;
      for (var i = 0; i < atts.length; i++) {
        var a = atts[i], nm = pick(a, ['filename', 'fileName', 'name']) || ('adjunto' + i), data = pick(a, ['data', 'content', 'base64', 'contentBase64']);
        if (data && /\.(pdf|xlsx|xls|csv)$/i.test(nm)) { try { await processFile(b64ToFile(data, nm)); got++; } catch (e) {} }
      }
      S.gmail.open[id].got = got;
    } catch (e) { S.gmail.open[id] = { err: gmailErr(e) }; }
    renderAll();
  }

  // ---------------------------------------------------------------- Excel / descargas
  function sheetName(n, used) {
    var s = String(n).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 28) || 'Hoja', k = s, i = 2;
    while (used[k]) k = s.slice(0, 26) + ' ' + (i++);
    used[k] = 1; return k;
  }
  function addSheet(wb, used, name, aoa, firstColW) {
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var cols = aoa[3] ? aoa[3].length : 8, w = [{ wch: firstColW || 34 }];
    for (var i = 1; i < cols; i++) w.push({ wch: i < 5 ? 11 : 14 });
    ws['!cols'] = w;
    XLSX.utils.book_append_sheet(wb, ws, sheetName(name, used));
  }
  async function saveXlsx(wb, filename) {
    if (!S.dl) { toast('La descarga no está disponible en esta vista.'); return; }
    try {
      var data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      await S.dl.save({ filename: filename, data: data });
      toast('Archivo listo: ' + filename);
    } catch (e) { if (!e || e.code !== 'declined') toast('No se pudo guardar el archivo' + (e && e.code ? ' (' + e.code + ')' : '') + '.'); }
  }
  function curData() {
    var cons = L.consolidate(S.files, S.cat);
    return { cons: cons, groups: L.groupByProv(cons, S.cat) };
  }
  function orderDateText() {
    if (S.orderDate) return S.orderDate;
    var f = S.files.filter(function (x) { return /\d{2}\.\d{2}\.\d{4}/.test(x.date); })[0];
    return f ? L.addDays(f.date, -1) : (S.files[0] && S.files[0].date) || '';
  }
  function dlProvider(name) {
    var d = curData(), g = d.groups.filter(function (x) { return x.name === name; })[0]; if (!g) return;
    var wb = XLSX.utils.book_new(), used = {};
    addSheet(wb, used, g.name, L.aoaProvider(g, d.cons.cities, orderDateText()));
    saveXlsx(wb, 'Pedido ' + g.name + '.xlsx');
  }
  function dlAll() {
    var d = curData(), wb = XLSX.utils.book_new(), used = {}, dt = orderDateText();
    addSheet(wb, used, 'Consolidado', L.aoaConsolidated(d.cons, S.cat, dt), 34);
    d.groups.forEach(function (g) { addSheet(wb, used, g.name, L.aoaProvider(g, d.cons.cities, dt)); });
    saveXlsx(wb, 'Pedidos por proveedor.xlsx');
  }
  function copyText(id) {
    var ta = $('#' + id); if (!ta) return;
    var d = ta.closest('details'); if (d) d.open = true;
    ta.focus(); ta.select();
    try { navigator.clipboard.writeText(ta.value).then(function () { toast('Correo copiado'); }, function () { toast('Selecciona el texto y cópialo (Ctrl+C)'); }); }
    catch (e) { toast('Selecciona el texto y cópialo (Ctrl+C)'); }
  }

  // ---------------------------------------------------------------- vistas

  // ---------------------------------------------------------------- recibos (facturas escaneadas de lo que la cadena recibió)
  S.rec = S.rec || {}; S.recPend = S.recPend || []; S.recOpen = S.recOpen || {};
  var REC_PROMPT = 'Eres un asistente de logística. La imagen es un "Comprobante Entrega de Mercancía" de un supermercado (Jerónimo Martins / Ara), escaneado o fotografiado; puede estar girado 90°, torcido o con sombras: léelo en la orientación correcta. ' +
    'Responde SOLO con un JSON de la forma {"oc":string|null,"entrega":string|null,"guia":string|null,"matricula":string|null,"fecha_reserva":string|null,"local_descarga":string|null,"destino":string|null,' +
    '"lineas":[{"codigo":string|null,"producto":string,"umd":string|null,"ct_adm":number|null,"ct_rec":number|null,"dif_ct":number|null,"ct_adm2":number|null,"ct_rec2":number|null,"dif_ct2":number|null,"unidad2":string|null}],' +
    '"envases":[{"codigo":string|null,"producto":string,"cantidad":number|null,"unidad":string|null}],"totales":{"ct_adm":number|null,"ct_rec":number|null,"ct_adm2":number|null,"ct_rec2":number|null},"nota_manuscrita":string|null}. ' +
    'Reglas: "oc" es el número tras "OC:". "ct_adm" y "ct_rec" son cantidades en la unidad "umd" (normalmente CX); "ct_adm2" y "ct_rec2" son las cantidades en kilos o unidades ("unidad2": KG o UN). Las diferencias llevan su signo (negativo si falta). ' +
    'Pon en "lineas" solo los productos; los envases y accesorios de transporte (canastillas, pallets) van en "envases". Lee los números exactamente como están, sin inventar; si no se lee algo usa null.';
  function normCode(c) { return String(c == null ? '' : c).replace(/\D/g, '').replace(/^0+/, ''); }
  function nz(v) { v = +v; return isFinite(v) ? v : 0; }
  function recId(d) { return String([d.oc, d.entrega, d.guia, d.matricula].map(function (x) { return String(x == null ? '' : x).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); }).join('_')); }
  function recNormalize(o) {
    o = o || {}; var d = { oc: String(o.oc == null ? '' : o.oc).replace(/\D/g, ''), entrega: String(o.entrega == null ? '' : o.entrega).trim(), guia: String(o.guia == null ? '' : o.guia).trim(), matricula: String(o.matricula == null ? '' : o.matricula).trim().toUpperCase(), fecha: o.fecha_reserva || '', local: o.local_descarga || '', destino: o.destino || '', nota: o.nota_manuscrita || '', tot: o.totales || {}, lines: [], env: [] };
    (o.lineas || []).forEach(function (l) { if (!l || !l.producto) return; d.lines.push({ code: String(l.codigo == null ? '' : l.codigo).trim(), name: String(l.producto).trim(), umd: l.umd || 'CX', adm: nz(l.ct_adm), rec: nz(l.ct_rec), adm2: nz(l.ct_adm2), rec2: nz(l.ct_rec2), u2: l.unidad2 || '' }); });
    (o.envases || []).forEach(function (l) { if (l && l.producto) d.env.push({ code: String(l.codigo || ''), name: String(l.producto).trim(), qty: nz(l.cantidad), unit: l.unidad || 'UN' }); });
    return d;
  }
  // control de la lectura: las líneas deben sumar los totales del documento
  function recCheck(d) {
    var t = { adm: 0, rec: 0, adm2: 0, rec2: 0 }, msgs = [];
    d.lines.forEach(function (l) { t.adm += l.adm; t.rec += l.rec; t.adm2 += l.adm2; t.rec2 += l.rec2; });
    var T = d.tot || {}, cmp = function (k, tk, lab) { if (T[k] != null && T[k] !== '' && Math.abs(nz(T[k]) - t[tk]) > 0.5) msgs.push(lab + ': las líneas suman ' + fmt(t[tk]) + ' y el documento dice ' + fmt(nz(T[k]))); };
    cmp('ct_adm', 'adm', 'Ct.Adm'); cmp('ct_rec', 'rec', 'Ct.Rec'); cmp('ct_adm2', 'adm2', 'Ct.Adm2'); cmp('ct_rec2', 'rec2', 'Ct.Rec2');
    if (!d.oc) msgs.push('No se leyó el número de OC');
    if (!d.lines.length) msgs.push('No se leyó ninguna línea');
    var bad = {}; d.lines.forEach(function (l, i) { if (l.rec > l.adm + 0.0001 || l.rec2 > l.adm2 + 0.0001) { bad[i] = 1; msgs.push('Línea «' + l.name + '»: lo recibido supera lo admitido'); } });
    return { ok: !msgs.length, msgs: msgs, bad: bad, t: t };
  }
  function recImages(file) {
    var name = (file.name || '').toLowerCase();
    if (/\.pdf$/.test(name) || file.type === 'application/pdf') {
      return readBuf(file).then(function (buf) { return pdfDoc(buf); }).then(async function (doc) {
        var out = [];
        for (var p = 1; p <= Math.min(doc.numPages, 3); p++) {
          var page = await doc.getPage(p), vp = page.getViewport({ scale: 2.4 }), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; out.push(await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', 0.92); }));
        }
        return out;
      });
    }
    return createImageBitmap(file).then(function (bm) {
      var k = Math.min(1, 2400 / Math.max(bm.width, bm.height)), cv = document.createElement('canvas'); cv.width = Math.round(bm.width * k); cv.height = Math.round(bm.height * k);
      cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height); return new Promise(function (r) { cv.toBlob(function (b) { r([b]); }, 'image/jpeg', 0.92); });
    });
  }
  async function recRead(file) {
    if (!S.sample) throw { code: 'no_ai', message: 'La lectura con IA no está disponible en esta vista.' };
    if (!S.images) throw { code: 'no_images', message: 'Esta vista no permite enviar imágenes a la IA.' };
    var imgs = await recImages(file), obj = await S.sample.json(REC_PROMPT, { modelTier: 'default', images: imgs });
    return { d: recNormalize(obj), thumb: URL.createObjectURL(imgs[0]) };
  }
  async function recAdd(files) {
    for (var i = 0; i < files.length; i++) {
      var p = { pid: 'p' + Date.now() + '_' + i, fileName: files[i].name || 'imagen', status: 'reading' }; S.recPend.unshift(p); renderRec();
      try { var r = await recRead(files[i]); p.d = r.d; p.thumb = r.thumb; p.status = 'ready'; } catch (e) { p.status = 'error'; p.err = aiErr(e); }
      renderRec();
    }
  }
  function recSave(rec) {
    S.rec[rec.id] = rec; try { localStorage.setItem('rec_v1', JSON.stringify(S.rec)); } catch (e) {}
    if (S.recCol) S.recCol.doc(rec.id).set(JSON.parse(JSON.stringify(rec))).catch(function () { toast('No se pudo guardar en la nube; quedó en este navegador'); });
  }
  // une lo recibido (todas las entregas de una OC) con lo pedido
  function recJoin(oc) {
    var ord = histOrders().filter(function (o) { return o.oc === oc; })[0], P = {}, order = [];
    var key = function (code, name) { var c = normCode(code); return c ? 'c' + c : 'n' + L.norm(name); };
    if (ord) ord.lines.forEach(function (l) { var k = key(l.sku, l.name), p = P[k] = P[k] || { name: l.name, ped: 0, pedCx: 0, rec: 0, recCx: 0, entregas: 0, nk: 'n' + L.norm(l.name), u: l.unit }; p.ped += nz(l.qty); p.pedCx += nz(l.cx); order.push(k); });
    var byName = {}; Object.keys(P).forEach(function (k) { byName[P[k].nk] = k; });
    var recs = Object.keys(S.rec).map(function (k) { return S.rec[k]; }).filter(function (r) { return r.oc === oc; }).sort(function (a, b) { return String(a.entrega).localeCompare(String(b.entrega), 'es', { numeric: true }) || String(a.at).localeCompare(String(b.at)); }), extra = {};
    recs.forEach(function (r) { r.lines.forEach(function (l) { var k = key(l.code, l.name); if (!P[k]) { var k2 = byName['n' + L.norm(l.name)]; if (k2) k = k2; } var p = P[k]; if (!p) { p = extra[k] = extra[k] || { name: l.name, ped: 0, pedCx: 0, rec: 0, recCx: 0, entregas: 0, extra: 1 }; } p.rec += l.rec2; p.recCx += l.rec; p.entregas++; if (l.adm2 && !p.extra && Math.abs(l.adm2 - p.ped) > 0.5 && p.admMis == null) p.admMis = l.adm2; }); });
    var rows = Object.keys(P).map(function (k) { return P[k]; }).concat(Object.keys(extra).map(function (k) { return extra[k]; }));
    var ped = 0, got = 0, anyRec = 0; rows.forEach(function (p) { if (!p.extra) { ped += p.ped; got += Math.min(p.rec, p.ped); } if (p.rec > 0) anyRec = 1; });
    var state = !recs.length ? 'sin' : (ord && ped && got >= ped - 0.5) ? 'completa' : anyRec ? 'parcial' : 'sin';
    return { oc: oc, ord: ord, rows: rows, recs: recs, state: state, ped: ped, got: got };
  }
  function renderRec() {
    var el = $('#p-rec'); if (!el) return; if (!S.user) { el.innerHTML = ''; return; }
    var h = '<div class="card"><h2>🧾 Recibos de la cadena</h2><p class="muted" style="margin:0 0 8px">Sube la foto o el PDF de cada comprobante de entrega (uno por carro). La app lo lee, tú confirmas contra el original y se suma al pedido.</p>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="rcUp">📷 Subir comprobantes</button><input type="file" id="rcFile" accept="image/*,application/pdf" multiple hidden></div>' + ((S.sample && S.images) ? '' : '<p class="muted" style="color:var(--badtx)">La lectura con IA no está disponible en esta vista.</p>') + '</div>';
    S.recPend.forEach(function (p, pi) {
      if (p.status === 'reading') { h += '<div class="card"><b>' + esc(p.fileName) + '</b> · leyendo… (puede tardar unos segundos)</div>'; return; }
      if (p.status === 'error') { h += '<div class="card" style="border-left:5px solid #c62828"><b>' + esc(p.fileName) + '</b><p>' + esc(p.err) + '</p><button class="btn sec sm" data-rpx="' + pi + '">Quitar</button></div>'; return; }
      var d = p.d, ck = recCheck(d), id = recId(d), dup = !!S.rec[id];
      h += '<div class="card" style="border-left:5px solid ' + (ck.ok ? '#2e8b57' : '#f2a900') + '"><h3 style="margin:0 0 6px">Por confirmar · OC ' + esc(d.oc || '¿?') + ' · entrega ' + esc(d.entrega || '–') + ' · ' + esc(d.matricula || 'sin placa') + '</h3>' +
        '<div class="row" style="gap:12px;align-items:flex-start;flex-wrap:wrap"><a href="' + esc(p.thumb) + '" target="_blank" rel="noopener"><img src="' + esc(p.thumb) + '" alt="original" style="width:150px;border:1px solid var(--bd);border-radius:8px"><br><small>Ver original</small></a><div style="flex:1;min-width:260px">' +
        '<div class="muted" style="font-size:12px;margin-bottom:6px">' + esc(d.local || '') + (d.destino ? ' · ' + esc(d.destino) : '') + (d.nota ? ' · nota a mano: ' + esc(d.nota) : '') + '</div>' +
        (ck.ok ? '<div style="color:#1a7f37;font-weight:700;margin-bottom:6px">✅ Las líneas suman los totales del documento</div>' : '<div style="color:#9a6700;margin-bottom:6px">⚠️ ' + ck.msgs.map(esc).join('<br>⚠️ ') + '</div>') +
        (dup ? '<div style="color:#9a6700;margin-bottom:6px">Esta entrega ya estaba guardada; al confirmar se reemplaza, no se suma dos veces.</div>' : '') + '</div></div>' +
        '<div class="tablewrap" style="max-height:340px;margin-top:8px"><table><thead><tr><th>Producto</th><th class="n">CX rec.</th><th class="n">Admitido</th><th class="n">Recibido</th></tr></thead><tbody>' +
        d.lines.map(function (l, li) { return '<tr' + (ck.bad[li] ? ' style="background:#fff3cd"' : '') + '><td>' + esc(l.name) + '</td><td class="n"><input type="number" step="any" min="0" data-rpl="' + pi + '|' + li + '|rec" value="' + l.rec + '" style="width:56px;font-size:15px;text-align:right"></td><td class="n">' + fmt(l.adm2) + ' ' + esc(l.u2) + '</td><td class="n"><input type="number" step="any" min="0" data-rpl="' + pi + '|' + li + '|rec2" value="' + l.rec2 + '" style="width:72px;font-size:15px;text-align:right"></td></tr>'; }).join('') +
        '</tbody><tfoot><tr style="font-weight:700"><td>Suma</td><td class="n">' + fmt(ck.t.rec) + '</td><td class="n">' + fmt(ck.t.adm2) + '</td><td class="n">' + fmt(ck.t.rec2) + '</td></tr></tfoot></table></div>' +
        (d.env.length ? '<p class="muted" style="font-size:12px;margin:6px 0">Envases: ' + d.env.map(function (e) { return esc(e.name) + ' ' + fmt(e.qty) + ' ' + esc(e.unit); }).join(' · ') + '</p>' : '') +
        '<div class="row" style="gap:8px;margin-top:8px"><button class="btn" data-rpc="' + pi + '">✔ Confirmar y guardar</button><button class="btn sec" data-rpx="' + pi + '">Descartar</button></div></div>';
    });
    var ocs = {}; Object.keys(S.rec).forEach(function (k) { ocs[S.rec[k].oc] = 1; });
    var list = Object.keys(ocs).map(function (oc) { return recJoin(oc); }).sort(function (a, b) { var da = a.ord ? dkey(a.ord.date) : 0, db = b.ord ? dkey(b.ord.date) : 0; return db - da; });
    if (list.length) {
      var nC = list.filter(function (x) { return x.state === 'completa'; }).length, nP = list.filter(function (x) { return x.state === 'parcial'; }).length;
      h += '<div class="card"><h3 style="margin:0 0 8px">Recibido por OC</h3><div class="hero" style="margin-bottom:8px"><div class="kpi"><b>' + list.length + '</b><span>OC con recibos</span></div><div class="kpi"><b>' + nC + '</b><span>completas</span></div><div class="kpi"><b>' + nP + '</b><span>parciales (faltan carros)</span></div></div>';
      list.forEach(function (x) {
        var chip = x.state === 'completa' ? '<span class="chip">Completa</span>' : x.state === 'parcial' ? '<span class="chip warn">Parcial</span>' : '<span class="chip bad">Sin recibir</span>', open = !!S.recOpen[x.oc], pc = x.ped ? Math.round(x.got / x.ped * 100) : null;
        h += '<div style="border-top:1px solid var(--bd);padding:8px 0"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><b>OC ' + esc(x.oc) + '</b> ' + chip + ' <span class="muted">' + (x.ord ? esc(x.ord.city) + ' · entrega ' + esc(x.ord.date) : 'esta OC no está en los pedidos guardados') + ' · ' + x.recs.length + ' entrega(s)' + (pc != null ? ' · ' + pc + '% de lo pedido' : '') + '</span></div><button class="btn sec sm" data-rpo="' + esc(x.oc) + '">' + (open ? 'Ocultar' : 'Ver detalle') + '</button></div>';
        if (open) {
          h += '<p class="muted" style="font-size:12px;margin:6px 0">Entregas: ' + x.recs.map(function (r) { return esc('#' + (r.entrega || '–') + ' · ' + (r.matricula || 'sin placa')) + ' <button class="btn sec sm" style="padding:2px 8px" data-rpd="' + esc(r.id) + '">Quitar</button>'; }).join(' · ') + '</p>' +
            '<div class="tablewrap" style="max-height:360px"><table><thead><tr><th>Producto</th><th class="n">Pedido</th><th class="n">Recibido</th><th class="n">Falta</th></tr></thead><tbody>' +
            x.rows.map(function (p) { var f = p.extra ? 0 : p.ped - p.rec; return '<tr' + (p.extra ? ' style="background:#fff3cd"' : '') + '><td>' + esc(p.name) + (p.extra ? ' <span class="chip warn">no estaba en el pedido</span>' : '') + (p.admMis != null ? ' <span class="chip warn" title="El documento admitía ' + fmt(p.admMis) + '">cantidad distinta al pedido</span>' : '') + '</td><td class="n">' + (p.extra ? '–' : fmt(p.ped)) + '</td><td class="n">' + fmt(p.rec) + '</td><td class="n"><b style="color:' + (f > 0.5 ? '#c62828' : '#1a7f37') + '">' + (p.extra ? '–' : f > 0.5 ? fmt(f) : '0') + '</b></td></tr>'; }).join('') + '</tbody></table></div>';
        }
        h += '</div>';
      });
      h += '</div>';
    } else h += '<div class="card"><p class="muted">Todavía no hay comprobantes guardados.</p></div>';
    el.innerHTML = h;
    $('#rcUp').onclick = function () { $('#rcFile').click(); };
    $('#rcFile').onchange = function () { var fs = Array.prototype.slice.call(this.files || []); this.value = ''; if (fs.length) recAdd(fs); };
    el.querySelectorAll('[data-rpx]').forEach(function (b) { b.onclick = function () { S.recPend.splice(+b.dataset.rpx, 1); renderRec(); }; });
    el.querySelectorAll('[data-rpl]').forEach(function (i) { i.onchange = function () { var a = i.dataset.rpl.split('|'), l = S.recPend[+a[0]].d.lines[+a[1]]; l[a[2]] = nz(i.value); renderRec(); }; });
    el.querySelectorAll('[data-rpc]').forEach(function (b) { b.onclick = function () {
      var p = S.recPend[+b.dataset.rpc], d = p.d, ck = recCheck(d), id = recId(d);
      if (!d.oc) { toast('Falta el número de OC'); return; }
      if (!ck.ok && !confirm('La lectura tiene avisos:\n- ' + ck.msgs.join('\n- ') + '\n\n¿Ya la comparaste con el original y quieres guardarla así?')) return;
      if (S.rec[id] && !confirm('Esta entrega ya estaba guardada. ¿Reemplazarla? (no se suma dos veces)')) return;
      recSave({ id: id, oc: d.oc, entrega: d.entrega, guia: d.guia, matricula: d.matricula, fecha: d.fecha, local: d.local, destino: d.destino, nota: d.nota, lines: d.lines, env: d.env, tot: d.tot, by: (S.user && S.user.name) || '', at: new Date().toISOString(), file: p.fileName });
      S.recPend.splice(+b.dataset.rpc, 1); S.recOpen[d.oc] = true; renderRec(); toast('Recibo guardado');
    }; });
    el.querySelectorAll('[data-rpo]').forEach(function (b) { b.onclick = function () { S.recOpen[b.dataset.rpo] = !S.recOpen[b.dataset.rpo]; renderRec(); }; });
    el.querySelectorAll('[data-rpd]').forEach(function (b) { b.onclick = function () { if (!confirm('¿Quitar esta entrega?')) return; delete S.rec[b.dataset.rpd]; try { localStorage.setItem('rec_v1', JSON.stringify(S.rec)); } catch (e) {} if (S.recCol) S.recCol.doc(b.dataset.rpd).delete().catch(function () {}); renderRec(); }; });
  }

  // ---------------------------------------------------------------- despacho: pedido → alistado → despachado → recibido
  function dispKey(o) { return (o.chain || '') + '|' + (o.oc || o.name || ''); }
  function fdt(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function renderDes() {
    var el = $('#p-des'); if (!el) return; if (!S.user) { el.innerHTML = ''; return; }
    var ords = histOrders(), det = histDetail(), disp = S.hist.disp = S.hist.disp || {};
    var dates = []; ords.forEach(function (o) { if (dates.indexOf(o.date) < 0) dates.push(o.date); });
    dates.sort(function (a, b) { return dkey(a) - dkey(b); });
    if (S.desDate == null || (S.desDate !== '*' && dates.indexOf(S.desDate) < 0)) S.desDate = dates.length ? defaultDay(dates) : '*';
    if (!S.desF) S.desF = 'pend';
    var by = {}; det.forEach(function (d) { var k = d.chain + '|' + d.oc + '|' + d.city; (by[k] = by[k] || []).push(d); });
    var list = ords.filter(function (o) { return S.desDate === '*' || o.date === S.desDate; }).map(function (o) {
      var rows = by[(o.chain || '') + '|' + o.oc + '|' + o.city] || [], tot = rows.length, pk = 0, cx = 0, kg = 0;
      rows.forEach(function (d) { if (S.hist.picked[d.date + '|' + d.city + '|' + d.chain + d.oc + '|' + d.name]) pk++; cx += d.cx || 0; kg += d.kg || 0; });
      var k = dispKey(o), dp = disp[k], rj = recJoin(o.oc);
      return { o: o, k: k, tot: tot, pk: pk, cx: cx, kg: kg, dp: dp, rec: rj.state, st: rj.state === 'completa' ? 3 : dp ? 2 : 1 };
    });
    var nP = list.filter(function (x) { return !x.dp; }).length, nD = list.filter(function (x) { return x.dp; }).length, nR = list.filter(function (x) { return x.rec === 'completa'; }).length;
    var shown = list.filter(function (x) { return S.desF === 'all' || (S.desF === 'pend' ? !x.dp : !!x.dp); });
    var h = '<div class="hero"><div class="kpi"><b>' + nP + '</b><span>Por despachar</span></div><div class="kpi"><b>' + nD + '</b><span>Despachados</span></div><div class="kpi"><b>' + nR + '</b><span>Recibidos completos</span></div></div>' +
      '<div class="card"><div class="row"><label class="muted">Fecha de entrega<br><select id="desD"><option value="*"' + (S.desDate === '*' ? ' selected' : '') + '>Todas las fechas</option>' + dates.map(function (d) { return '<option' + (d === S.desDate ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') + '</select></label>' +
      '<div class="seg" style="margin:0;align-self:flex-end"><button data-df="pend"' + (S.desF === 'pend' ? ' class="on"' : '') + '>Por despachar</button><button data-df="done"' + (S.desF === 'done' ? ' class="on"' : '') + '>Despachados</button><button data-df="all"' + (S.desF === 'all' ? ' class="on"' : '') + '>Todos</button></div></div></div>';
    if (!shown.length) h += '<div class="card"><p class="muted" style="margin:0">' + (list.length ? 'No hay órdenes en este filtro. Cambia a «Todos» para ver las de esta fecha.' : 'No hay órdenes para esta fecha.') + '</p></div>';
    shown.forEach(function (x) {
      var o = x.o, dp = x.dp, col = x.st === 3 ? '#2f9a52' : x.st === 2 ? '#e0a82e' : '#d4443f';
      var tot = o.chain === 'Éxito' ? wk(x.kg) : fmt(x.cx) + ' CX' + (x.kg ? ' · ≈ ' + wk(x.kg) : '');
      var rt = x.rec === 'completa' ? ['okp', '✓ Completo'] : x.rec === 'parcial' ? ['wnp', 'Parcial'] : ['', 'Sin recibo aún'];
      h += '<div class="sup" style="border-left-color:' + col + '"><div class="hd"><div><h3>' + esc(o.city) + ' <span class="cb ' + esc(o.chain || '') + '">' + esc(o.chain || '') + '</span></h3><span class="muted">OC ' + esc(o.oc) + ' · entrega ' + esc(o.date) + '</span></div><div class="big">' + tot + '</div></div>' +
        '<div class="pipe"><div class="okp"><b>1 · Pedido</b>✓ Recibido del correo</div>' +
        '<div class="' + (x.tot && x.pk >= x.tot ? 'okp' : x.pk ? 'wnp' : '') + '"><b>Alistado</b>' + x.pk + ' de ' + x.tot + ' productos</div>' +
        '<div class="' + (dp ? 'okp' : '') + '"><b>2 · Despacho</b>' + (dp ? '✓ ' + esc(dp.by || '') + ' · ' + fdt(dp.at) + ' <button class="btn sec sm" data-dsu="' + esc(x.k) + '" style="margin-top:4px">Deshacer</button>' : '<button class="btn sm" data-dsp="' + esc(x.k) + '" data-miss="' + (x.tot - x.pk) + '">Marcar despachado</button>') + '</div>' +
        '<div class="' + rt[0] + '"><b>3 · Recibido</b>' + rt[1] + '</div></div></div>';
    });
    el.innerHTML = h;
    var sd = $('#desD'); if (sd) sd.onchange = function () { S.desDate = sd.value; renderDes(); };
    el.querySelectorAll('[data-df]').forEach(function (b) { b.onclick = function () { S.desF = b.dataset.df; renderDes(); }; });
    el.querySelectorAll('[data-dsp]').forEach(function (b) { b.onclick = function () {
      var miss = +b.dataset.miss; if (miss > 0 && !confirm('Faltan ' + miss + ' productos por alistar. ¿Despachar igual?')) return;
      S.hist.disp[b.dataset.dsp] = { by: (S.user && S.user.name) || '', at: new Date().toISOString() }; saveHist(); renderDes();
    }; });
    el.querySelectorAll('[data-dsu]').forEach(function (b) { b.onclick = function () { if (!confirm('¿Quitar la marca de despachado?')) return; delete S.hist.disp[b.dataset.dsu]; saveHist(); renderDes(); }; });
  }

  // ---------------------------------------------------------------- ingreso y roles
  var ROLES = { bodega: 'Bodega', secretaria: 'Secretaria', admin: 'Administrador' };
  var ROLE_TABS = { bodega: ['hoy', 'des'], secretaria: ['hoy', 'tbl', 'des', 'rec', 'load', 'exp'], admin: ['hoy', 'tbl', 'des', 'rec', 'stats', 'load', 'ledger', 'exp', 'users'] };
  // ojito para ver/ocultar lo que se escribe en un campo de clave
  function addEye(inp) {
    if (!inp || inp.dataset.eye) return; inp.dataset.eye = 1;
    var w = document.createElement('span'), b = document.createElement('button'), cs = inp.style.cssText;
    w.style.cssText = 'position:relative;display:' + (/width:\s*100%/.test(cs) || inp.id === 'lgP' || inp.id === 'pw' ? 'block' : 'inline-block');
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp); inp.style.paddingRight = '40px'; if (w.style.display === 'block') inp.style.width = '100%'; inp.style.boxSizing = 'border-box';
    b.type = 'button'; b.textContent = '👁'; b.title = 'Mostrar u ocultar'; b.setAttribute('aria-label', 'Mostrar u ocultar');
    b.style.cssText = 'position:absolute;right:4px;top:50%;transform:translateY(-50%);border:0;background:none;font-size:18px;cursor:pointer;padding:4px 8px;opacity:.6;line-height:1';
    b.onclick = function (e) { e.preventDefault(); var show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.style.opacity = show ? '1' : '.6'; b.textContent = show ? '🙈' : '👁'; inp.focus(); };
    w.appendChild(b);
  }
  function uHash(name, pin) { return sha('ola|' + String(name).trim().toLowerCase() + '|' + pin); }
  function userKey(name) { return String(name).trim().toLowerCase().replace(/\s+/g, ' '); }
  function saveSess(u) { try { if (u) localStorage.setItem('ola_sess', JSON.stringify(u)); else localStorage.removeItem('ola_sess'); } catch (e) {} }
  function sessValid(u) {
    if (!u) return false;
    if (u.master) return u.t === PASS_HASH;
    var r = (S.hist.users || {})[userKey(u.name)]; return !!r && r.h === u.t && r.r === u.role;
  }
  function checkSession() { if (S.user && !sessValid(S.user) && (S.dbReady || !S.histRef)) logout(); }
  function logout() { S.user = null; navSync(); S.unlocked = false; saveSess(null); document.body.classList.remove('bodega'); renderLogin(); }
  function applyRole(u) {
    S.user = u; S.mode = u.role === 'bodega' ? 'bodega' : 'oficina'; S.unlocked = u.role === 'admin';
    document.body.classList.toggle('bodega', u.role === 'bodega');
    var ok = ROLE_TABS[u.role] || ['hoy'];
    ['hoy', 'tbl', 'des', 'exp', 'rec', 'stats', 'load', 'ledger', 'users'].forEach(function (k) { var b = $('#nav [data-t=' + k + ']'); if (b) b.hidden = ok.indexOf(k) < 0; });
    if (S.demo) {
      $('#userbar').innerHTML = '<span class="chip warn" style="margin-right:8px">DEMO · datos de ejemplo</span><label class="muted" style="font-size:13px">Ver como: <select id="demoRole" style="padding:4px 8px">' + Object.keys(ROLES).map(function (r) { return '<option value="' + r + '"' + (r === u.role ? ' selected' : '') + '>' + ROLES[r] + '</option>'; }).join('') + '</select></label>';
      $('#demoRole').onchange = function () { applyRole({ name: 'Visitante', role: this.value }); };
    } else {
      $('#userbar').innerHTML = '<span class="muted" style="font-size:13px;margin-right:8px">👤 <b>' + esc(u.name) + '</b> · ' + ROLES[u.role] + '</span><button class="btn sec sm" id="outBtn">Salir</button>';
      $('#outBtn').onclick = logout;
    }
    var lg = $('#login'); if (lg) lg.remove();
    if (ok.indexOf(S.tab) < 0) setTab('hoy'); else { renderAll(); navSync(); }
  }
  function renderLogin() {
    var lg = $('#login'); if (lg) lg.remove();
    lg = document.createElement('div'); lg.id = 'login';
    lg.style.cssText = 'position:fixed;inset:0;z-index:50;background:#f4f6f3;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
    lg.innerHTML = '<div class="card lock" style="margin:0;width:100%;max-width:380px"><img src="logo.png" alt="OLA SAS" style="height:54px;margin-bottom:6px"><h2 style="margin:6px 0">Pedidos y Cuentas</h2><p class="muted" style="margin:0 0 6px">Escribe tu nombre y tu PIN para entrar.</p><input id="lgN" placeholder="Nombre" autocomplete="username" style="font-size:16px"><input type="password" id="lgP" placeholder="PIN o clave" autocomplete="current-password" inputmode="text"><div id="lgE" class="muted" style="color:var(--badtx);min-height:18px"></div><button class="btn" id="lgGo" style="width:100%">Entrar</button></div>';
    document.body.appendChild(lg);
    var go = async function () {
      var n = $('#lgN').value.trim(), p = $('#lgP').value; if (!n || !p) { $('#lgE').textContent = 'Escribe tu nombre y tu PIN'; return; }
      var ph = await sha(p), u = (S.hist.users || {})[userKey(n)];
      if (u && (await uHash(n, p)) === u.h) { var s0 = { name: u.n, role: u.r, t: u.h }; saveSess(s0); applyRole(s0); return; }
      if (ph === PASS_HASH || ('x:' + p) === PASS_HASH) { var s1 = { name: u ? u.n : (n || 'Administrador'), role: 'admin', master: 1, t: PASS_HASH }; saveSess(s1); applyRole(s1); return; }
      $('#lgE').textContent = (!S.dbReady && S.histRef) ? 'Sincronizando usuarios… intenta de nuevo en un momento' : 'Nombre o PIN incorrecto'; $('#lgP').value = '';
    };
    addEye($('#lgP')); $('#lgGo').onclick = go; $('#lgP').onkeydown = function (e) { if (e.key === 'Enter') go(); }; $('#lgN').onkeydown = function (e) { if (e.key === 'Enter') $('#lgP').focus(); }; $('#lgN').focus();
  }
  function initAuth() {
    var u = null; try { u = JSON.parse(localStorage.getItem('ola_sess') || 'null'); } catch (e) {}
    if (u && sessValid(u)) applyRole(u); else { if (u) saveSess(null); renderLogin(); }
  }
  function renderUsers() {
    var el = $('#p-users'); if (!S.user || S.user.role !== 'admin') { el.innerHTML = ''; return; }
    var us = S.hist.users = S.hist.users || {}, ks = Object.keys(us).sort();
    el.innerHTML = '<div class="card"><h2>👥 Usuarios</h2><p class="muted">Cada persona entra con su nombre y su PIN. <b>Bodega</b> solo ve Hoy y Despacho, sin precios; <b>Secretaria</b> ve pedidos y exporta Excel sin precios; <b>Administrador</b> ve todo (Estadísticas, Cuentas y Ganancia). Tu clave de siempre sigue entrando como administrador.</p>' +
      '<div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Rol</th><th></th></tr></thead><tbody>' + (ks.length ? ks.map(function (k) { var r = us[k]; return '<tr><td>' + esc(r.n) + '</td><td><select data-ur="' + esc(k) + '" style="font-size:15px;padding:5px">' + Object.keys(ROLES).map(function (x) { return '<option value="' + x + '"' + (r.r === x ? ' selected' : '') + '>' + ROLES[x] + '</option>'; }).join('') + '</select></td><td style="white-space:nowrap"><input type="password" placeholder="Nuevo PIN" data-upi="' + esc(k) + '" style="width:110px;font-size:15px;padding:5px"> <button class="btn sec sm" data-upp="' + esc(k) + '">Cambiar PIN</button> <button class="btn sec sm" data-udel="' + esc(k) + '">Quitar</button></td></tr>'; }).join('') : '<tr><td colspan="3" class="muted">Todavía no hay usuarios. Crea el primero abajo.</td></tr>') + '</tbody></table></div></div>' +
      '<div class="card"><h3 style="margin:0 0 8px">💾 Respaldo</h3><p class="muted" style="margin:0 0 8px">Descarga una copia de todo (pedidos, historial, costos, usuarios). Hazlo seguido, por ejemplo cada semana. Con «Restaurar» se junta un respaldo con lo que hay, sin borrar nada.</p><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="bkDl">⬇ Descargar respaldo</button><button class="btn sec" id="bkUp">⬆ Restaurar respaldo</button><input type="file" id="bkFile" accept=".json,application/json" hidden></div><div id="bkMsg" class="muted" style="min-height:18px;margin-top:6px"></div></div>' +
      '<div class="card"><h3 style="margin:0 0 8px">Agregar usuario</h3><div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end"><label class="muted" style="font-size:11px">Nombre<br><input id="unN" style="font-size:16px;padding:7px"></label><label class="muted" style="font-size:11px">Rol<br><select id="unR" style="font-size:16px;padding:7px">' + Object.keys(ROLES).map(function (x) { return '<option value="' + x + '">' + ROLES[x] + '</option>'; }).join('') + '</select></label><label class="muted" style="font-size:11px">PIN (mínimo 4)<br><input id="unP" type="password" style="font-size:16px;padding:7px"></label><button class="btn" id="unAdd">Crear</button></div><div id="unE" class="muted" style="color:var(--badtx);min-height:18px;margin-top:6px"></div></div>';
    $('#bkDl').onclick = async function () {
      try {
        var d = new Date(), nm = 'Respaldo OLA ' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.json', txt = JSON.stringify({ app: 'ola-pedidos', version: 1, fecha: d.toISOString(), hist: S.hist }, null, 1), data = new TextEncoder().encode(txt);
        if (S.dl) await S.dl.save({ filename: nm, data: data }); else { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = nm; a.click(); }
        $('#bkMsg').textContent = 'Respaldo descargado: ' + Object.keys(S.hist.orders).length + ' órdenes.';
      } catch (e) { $('#bkMsg').textContent = 'No se pudo descargar el respaldo.'; }
    };
    $('#bkUp').onclick = function () { $('#bkFile').click(); };
    $('#bkFile').onchange = function () {
      var f = this.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () {
        try {
          var j = JSON.parse(r.result); if (!j || j.app !== 'ola-pedidos' || !j.hist) throw new Error('x');
          var inc = normHist(j.hist), n0 = Object.keys(S.hist.orders).length;
          if (!confirm('Se juntarán ' + Object.keys(inc.orders).length + ' órdenes del respaldo con las ' + n0 + ' actuales. No se borra nada. ¿Seguir?')) return;
          Object.keys(inc.orders).forEach(function (k) { if (!S.hist.orders[k]) S.hist.orders[k] = inc.orders[k]; });
          ['seen', 'boxes', 'costs'].forEach(function (c) { S.hist[c] = S.hist[c] || {}; Object.keys(inc[c] || {}).forEach(function (k) { if (S.hist[c][k] == null) S.hist[c][k] = inc[c][k]; }); });
          S.hist.users = S.hist.users || {}; Object.keys(inc.users || {}).forEach(function (k) { if (!S.hist.users[k]) S.hist.users[k] = inc.users[k]; });
          S.hist.orders = dedupOrders(S.hist.orders).orders; saveHist(); renderUsers();
          $('#bkMsg').textContent = 'Listo: ahora hay ' + Object.keys(S.hist.orders).length + ' órdenes.';
        } catch (e) { $('#bkMsg').textContent = 'Ese archivo no es un respaldo válido.'; }
      }; r.readAsText(f);
    };
    addEye($('#unP')); el.querySelectorAll('[data-upi]').forEach(addEye);
    $('#unAdd').onclick = async function () {
      var n = $('#unN').value.trim(), p = $('#unP').value, r = $('#unR').value;
      if (!n) { $('#unE').textContent = 'Escribe el nombre'; return; } if (p.length < 4) { $('#unE').textContent = 'El PIN debe tener mínimo 4 caracteres'; return; } if (us[userKey(n)]) { $('#unE').textContent = 'Ya existe ese nombre'; return; }
      us[userKey(n)] = { n: n, r: r, h: await uHash(n, p) }; saveHist(); renderUsers();
    };
    el.querySelectorAll('[data-ur]').forEach(function (i) { i.onchange = function () { us[i.dataset.ur].r = this.value; saveHist(); }; });
    el.querySelectorAll('[data-upp]').forEach(function (b) { b.onclick = async function () { var k = b.dataset.upp, v = el.querySelector('[data-upi="' + k + '"]').value; if (v.length < 4) { toast('El PIN debe tener mínimo 4 caracteres'); return; } us[k].h = await uHash(us[k].n, v); saveHist(); toast('PIN cambiado'); renderUsers(); }; });
    el.querySelectorAll('[data-udel]').forEach(function (b) { b.onclick = function () { if (confirm('¿Quitar a ' + us[b.dataset.udel].n + '?')) { delete us[b.dataset.udel]; saveHist(); renderUsers(); } }; });
  }
  function setTab(t) {
    S.tab = t;
    if (S.user && (ROLE_TABS[S.user.role] || []).indexOf(t) < 0 && ['work', 'cons', 'orders', 'cat'].indexOf(t) < 0) t = 'hoy';
    S.tab = t;
    ['hoy', 'load', 'tbl', 'exp', 'stats', 'work', 'cons', 'orders', 'ledger', 'cat', 'users', 'rec', 'des'].forEach(function (k) {
      $('#p-' + k).classList.toggle('on', k === t);
    });
    document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); });
    var g0 = navGroupOf(t); if (g0) S.gLast[g0.g] = t;
    renderAll(); navSync();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  // ---- navegación por fases: panel lateral (computador) y barra inferior (celular)
  var NAVG = [
    { g: 'ped', n: 'Pedidos', ic: '📥', t: ['hoy', 'tbl', 'load'] },
    { g: 'des', n: 'Despacho', ic: '🚚', t: ['des'] },
    { g: 'rcb', n: 'Recibido', ic: '🧾', t: ['rec'] },
    { g: 'dat', n: 'Datos', ic: '📊', t: ['stats', 'ledger'] },
    { g: 'mas', n: 'Más', ic: '⋯', t: ['exp', 'users'] }
  ];
  var NAV_LAB = { hoy: '🏠 Hoy', tbl: '📋 Detalle', load: '＋ Agregar a mano', des: 'Despacho', rec: 'Recibido', stats: '📈 Estadísticas', ledger: '🔒 Cuentas', exp: '📥 Exportar Excel', users: '👥 Usuarios' };
  S.gLast = {};
  function navGroupOf(t) { for (var i = 0; i < NAVG.length; i++) if (NAVG[i].t.indexOf(t) >= 0) return NAVG[i]; return null; }
  function navOk() { return S.user ? (ROLE_TABS[S.user.role] || ['hoy']) : []; }
  function navSync() {
    var bb = $('#bbar'), sn = $('#subnav'); if (!bb || !sn) return;
    var ok = navOk(), isOk = function (t) { return ok.indexOf(t) >= 0; }, cur = navGroupOf(S.tab);
    bb.innerHTML = NAVG.map(function (g) {
      if (!g.t.some(isOk)) return ''; var on = cur && cur.g === g.g;
      return '<button type="button" data-g="' + g.g + '" class="' + (on ? 'on' : '') + '"' + (on ? ' aria-current="page"' : '') + '><span class="ic">' + g.ic + '</span>' + g.n + '</button>';
    }).join('');
    var vis = cur ? cur.t.filter(isOk) : [];
    sn.innerHTML = vis.length > 1 ? vis.map(function (t) { return '<button type="button" data-t="' + t + '" class="' + (t === S.tab ? 'on' : '') + '">' + NAV_LAB[t] + '</button>'; }).join('') : '';
    document.querySelectorAll('#nav .ng').forEach(function (h) { var g = NAVG.filter(function (x) { return x.g === h.dataset.gh; })[0]; h.hidden = !g || !g.t.some(isOk); });
  }
  function totals(f) {
    var cx = 0, q = 0, w = 0; f.lines.forEach(function (l) { cx += l.cx; q += l.qty; if (l.warn) w++; });
    return { cx: cx, q: q, w: w };
  }

  function renderLoad() {
    var h = '<div class="steps"><div class="step"><i>1</i><div><b>Sube el pedido</b><span>PDF, Excel o foto, como llegue al correo.</span></div></div><div class="step"><i>2</i><div><b>Se lee solo</b><span>Queda ordenado en una tabla tipo Excel.</span></div></div><div class="step"><i>3</i><div><b>Se guarda con fecha</b><span>Filtra, suma y descarga cuando quieras.</span></div></div></div>';
    h += '<div class="card"><div class="drop" id="drop"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1f6b43" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></svg><b>Arrastra aquí los pedidos (PDF, Excel o foto)</b>' +
      '<span class="muted">o haz clic para elegirlos. Puedes cargar varios a la vez, uno por ciudad.</span>' +
      '<input type="file" id="fi" multiple accept=".pdf,.xlsx,.xls,.xlsb,.xlsm,.ods,.csv,.tsv,.txt,.png,.jpg,.jpeg,.webp,.gif" hidden></div>' +
      (S.busy ? '<p class="muted"><span class="spin"></span>Leyendo archivos…</p>' : '') + '</div>';

    h += '<div class="card"><h2>Pedidos cargados</h2>';
    if (!S.files.length) h += '<p class="muted">Todavía no hay pedidos. Los PDF de Ara/Jerónimo Martins se leen directamente; otros formatos se leen con IA.</p>';
    S.files.forEach(function (f) {
      var t = totals(f);
      h += '<div class="card fcard" style="margin:8px 0"><div><div class="nm">' + esc(f.name) + ' <span class="chip' + (/IA/.test(f.source) ? ' ai' : '') + '">' + esc(f.source) + '</span>' +
        (f.unread ? ' <span class="chip bad">' + f.unread + ' línea(s) del PDF sin leer — revisa</span>' : '') + (f.totalOk === true ? ' <span class="chip">Total del PDF coincide</span>' : f.totalOk === false ? ' <span class="chip bad">El total no coincide con el PDF</span>' : '') +
        (t.w ? ' <span class="chip warn">' + t.w + ' líneas por revisar</span>' : '') + '</div>' +
        '<div class="muted">OC ' + esc(f.oc || '—') + ' · entrega ' + esc(f.date || '—') + ' · ' + f.lines.length + ' productos · ' + fmt(t.cx) + ' cajas · ' + fmt(t.q) + ' unidades</div></div>' +
        '<div class="row"><label class="muted">Ciudad <input data-city="' + f.id + '" value="' + esc(f.city) + '" style="width:130px"></label>' +
        '<button class="btn sec sm" data-open="' + f.id + '">' + (f.open ? 'Ocultar' : 'Ver líneas') + '</button>' +
        '<button class="btn sec sm" data-del="' + f.id + '">Quitar</button></div>';
      if (f.open) {
        h += '<div style="flex-basis:100%" class="tablewrap"><table><thead><tr><th>Código</th><th>Producto</th><th>Und</th><th class="n">Und/caja</th><th class="n">Cajas</th><th class="n">Cantidad</th></tr></thead><tbody>';
        f.lines.forEach(function (l) { h += '<tr' + (l.warn ? ' class="wn"' : '') + '><td>' + esc(l.sku || l.code) + '</td><td>' + esc(l.name) + '</td><td>' + esc(l.unit) + '</td><td class="n">' + fmt(l.emb) + '</td><td class="n">' + fmt(l.cx) + '</td><td class="n">' + fmt(l.qty) + '</td></tr>'; });
        h += '</tbody></table></div>';
      }
      h += '</div>';
    });
    if (S.files.length) h += '<div class="row"><button class="btn" data-go="tbl">Ver la tabla de pedidos →</button></div>';
    h += '</div>';

    h += '<div class="card"><h2>Pegar texto del pedido</h2><p class="muted">Si copiaste el contenido de un PDF o de un correo, pégalo aquí.</p>' +
      '<textarea id="paste" placeholder="Pega aquí el texto del pedido…"></textarea><div class="row" style="margin-top:8px"><button class="btn sec" id="pasteGo">Leer texto</button></div></div>';

    h += '<div class="card"><h2>Traer desde Gmail</h2><p class="muted">Busca los correos de pedidos. Lee el texto del correo; los adjuntos que Gmail no entregue a esta página hay que descargarlos y arrastrarlos arriba.</p>';
    if (!S.mcp) h += '<p class="muted">Esta vista no permite conectar con Gmail.</p>';
    else {
      h += '<div class="row"><input id="gq" value="' + esc(S.gmail.q) + '" style="flex:1;min-width:240px"><button class="btn sec" id="gGo">Buscar</button></div>';
      if (S.gmail.msg) h += '<p class="muted">' + esc(S.gmail.msg) + '</p>';
      S.gmail.threads.forEach(function (t) {
        var o = S.gmail.open[t.id];
        h += '<div style="border-top:1px solid var(--bd);padding:8px 0"><div class="row" style="justify-content:space-between"><div><b>' + esc(t.subject) + '</b><div class="muted">' + esc(t.from) + ' · ' + esc(t.date) + '</div></div>' +
          '<button class="btn sec sm" data-gread="' + esc(t.id) + '">Leer correo</button></div>';
        if (o && o.loading) h += '<p class="muted"><span class="spin"></span>Leyendo…</p>';
        if (o && o.err) h += '<p class="muted">' + esc(o.err) + '</p>';
        if (o && o.atts) {
          var names = o.atts.map(function (a) { return pick(a, ['filename', 'fileName', 'name']) || 'adjunto'; });
          h += '<p class="muted">Adjuntos: ' + (names.length ? esc(names.join(', ')) : 'ninguno') + (o.got ? ' · ' + o.got + ' leído(s) automáticamente' : (names.length ? ' · descárgalos de Gmail y arrástralos arriba' : '')) + '</p>';
          if (o.body) h += '<button class="btn sec sm" data-gbody="' + esc(t.id) + '">Interpretar el texto del correo</button>';
        }
        h += '</div>';
      });
    }
    h += '</div>';
    $('#p-load').innerHTML = h;
    bindLoad();
  }
  function bindLoad() {
    var drop = $('#drop'), fi = $('#fi');
    if (!drop) return;
    drop.onclick = function () { fi.click(); };
    fi.onchange = function () { processFiles(Array.prototype.slice.call(fi.files)); fi.value = ''; };
    ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { processFiles(Array.prototype.slice.call(e.dataTransfer.files)); });
    var pg = $('#pasteGo'); if (pg) pg.onclick = function () { var v = $('#paste').value.trim(); if (v) { processText(v, 'Texto pegado'); $('#paste').value = ''; } };
    var gg = $('#gGo'); if (gg) gg.onclick = function () { S.gmail.q = $('#gq').value; gmailSearch(); };
  }

  function provList() {
    var set = {}; Object.keys(S.cat.provs).forEach(function (k) { set[k] = 1; });
    Object.keys(S.cat.map).forEach(function (k) { if (S.cat.map[k].p) set[S.cat.map[k].p] = 1; });
    return Object.keys(set).sort();
  }
  function renderCons() {
    var d = curData(), cons = d.cons, cat = S.cat, h = '';
    if (!S.files.length) { $('#p-cons').innerHTML = '<p class="muted">Carga pedidos primero.</p>'; return; }
    var un = cons.rows.filter(function (r) { return !L.provOf(r, cat); }), unCx = 0, totCx = 0;
    cons.rows.forEach(function (r) { totCx += r.cx; }); un.forEach(function (r) { unCx += r.cx; });
    h += un.length ? '<div class="banner bad"><b>' + un.length + ' productos sin proveedor</b> (' + fmt(unCx) + ' de ' + fmt(totCx) + ' cajas, ' + Math.round(unCx / totCx * 100) + ' %). Asígnalos en la columna Proveedor; quedan guardados para los próximos pedidos.</div>'
      : '<div class="banner ok">Todos los productos tienen proveedor.</div>';
    if (S.dbMsg) h += '<div class="banner">' + esc(S.dbMsg) + '</div>';
    h += '<div class="row" style="margin-bottom:10px"><label><input type="checkbox" id="onlyUn" ' + (S.onlyUn ? 'checked' : '') + '> Mostrar solo los que no tienen proveedor</label>' +
      '<button class="btn sec sm" id="dlCons">Descargar consolidado (Excel)</button><button class="btn" data-go="orders">Continuar a las órdenes →</button></div>';
    h += '<datalist id="dlProv">' + provList().map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') + '</datalist>';
    h += '<datalist id="dlNames">' + Object.keys(cat.map).filter(function (k) { return cat.map[k].n; }).map(function (k) { return '<option value="' + esc(cat.map[k].n) + '">'; }).join('') + '</datalist>';
    h += '<div class="tablewrap"><table><thead><tr><th rowspan="2">Producto</th><th rowspan="2">Und</th><th rowspan="2">Caja</th><th rowspan="2" class="n">Und/caja</th>';
    cons.cities.forEach(function (c) { h += '<th class="c2 n">' + esc(c) + '</th>'; });
    h += '<th class="n">Total</th><th class="n">Total</th><th rowspan="2">Proveedor</th></tr><tr>';
    cons.cities.forEach(function () { h += '<th class="c2 n">CX</th>'; });
    h += '<th class="n">CX</th><th class="n">Cant.</th></tr></thead><tbody>';
    cons.rows.forEach(function (r, i) {
      var p = L.provOf(r, cat); if (S.onlyUn && p) return;
      var isName = true;
      h += '<tr class="' + (!p ? 'un' : '') + '"><td title="' + esc(r.ara && r.ara !== r.name ? 'Nombre en el pedido: ' + r.ara : '') + '">' + esc(r.name) + '</td><td>' + esc(r.unit) + '</td><td>' + esc(r.caja) + '</td><td class="n">' + fmt(r.emb) + '</td>';
      cons.cities.forEach(function (c) { var b = r.by[c]; h += '<td class="n">' + (b && b.cx ? fmt(b.cx) : '–') + '</td>'; });
      h += '<td class="n"><b>' + fmt(r.cx) + '</b></td><td class="n">' + fmt(r.qty) + '</td><td class="prov"><input list="dlProv" data-prov="' + esc(r.key) + '" data-i="' + i + '" value="' + esc(p) + '" placeholder="asignar…">' +
        (isName && !p ? ' <input list="dlNames" data-link="' + esc(r.key) + '" placeholder="es el mismo que…" style="width:150px">' : '') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    $('#p-cons').innerHTML = h;
    var ou = $('#onlyUn'); if (ou) ou.onchange = function () { S.onlyUn = ou.checked; renderCons(); };
    var dc = $('#dlCons'); if (dc) dc.onclick = function () {
      var wb = XLSX.utils.book_new(); addSheet(wb, {}, 'Consolidado', L.aoaConsolidated(cons, S.cat, orderDateText()), 34); saveXlsx(wb, 'Consolidado.xlsx');
    };
    document.querySelectorAll('[data-prov]').forEach(function (inp) {
      inp.onchange = function () {
        var row = cons.rows.filter(function (r) { return r.key === inp.dataset.prov; })[0];
        if (row) { setProv(row.key, row, inp.value); renderAll(); }
      };
    });
    document.querySelectorAll('[data-link]').forEach(function (inp) {
      inp.onchange = function () {
        var rowKey = inp.dataset.link, want = L.norm(inp.value), k = null;
        Object.keys(S.cat.map).forEach(function (x) { if (x !== rowKey && (L.norm(S.cat.map[x].n) === want || L.norm(S.cat.map[x].a) === want)) k = x; });
        if (!k) { toast('Elige un nombre de la lista'); return; }
        var target = S.cat.map[k];
        if (rowKey.indexOf('N:') === 0) {
          S.cat.alias[rowKey.slice(2)] = k;                     // nombre de Excel -> producto conocido
        } else {
          var row = cons.rows.filter(function (r) { return r.key === rowKey; })[0] || {};
          S.cat.map[rowKey] = { a: row.ara || '', n: target.n, c: target.c || row.caja || '', p: target.p || '' };
          if (k.indexOf('N:') === 0) delete S.cat.map[k];       // el código del pedido pasa a ser la identidad del producto
        }
        saveCat(); renderAll(); toast('Unido a ' + target.n);
      };
    });
  }

  function renderOrders() {
    var el = $('#p-orders');
    if (!S.files.length) { el.innerHTML = '<p class="muted">Carga pedidos primero.</p>'; return; }
    var d = curData(), cons = d.cons, groups = d.groups, dt = orderDateText(), h = '';
    var un = groups.filter(function (g) { return g.name === 'SIN ASIGNAR'; })[0];
    if (un) h += '<div class="banner bad"><b>' + un.rows.length + ' productos (' + fmt(un.cx) + ' cajas) siguen sin proveedor</b> y no están en ninguna orden. Asígnalos en el consolidado.</div>';
    h += '<div class="card row"><label>Fecha para el proveedor <input id="odate" value="' + esc(dt) + '" style="width:290px"></label>' +
      '<span class="muted">Por defecto, el día anterior a la entrega en el centro de distribución.</span>' +
      '<button class="btn" id="dlAll">Descargar todo (un libro con una hoja por proveedor)</button></div><div class="grid2">';
    groups.forEach(function (g, gi) {
      var isUn = g.name === 'SIN ASIGNAR', email = (S.cat.provs[g.name] || {}).email || '';
      h += '<div class="card"><div class="row" style="justify-content:space-between"><h2>' + esc(g.name) + '</h2><span class="chip' + (isUn ? ' bad' : '') + '">' + g.rows.length + ' productos · ' + fmt(g.cx) + ' cajas</span></div>';
      if (!isUn) h += '<div class="row" style="margin:6px 0"><label class="muted">Correo <input data-email="' + esc(g.name) + '" value="' + esc(email) + '" placeholder="proveedor@correo.com" style="width:230px"></label></div>';
      h += '<div class="tablewrap" style="max-height:260px"><table><thead><tr><th>Producto</th><th>Caja</th>';
      cons.cities.forEach(function (c) { h += '<th class="n">' + esc(c.slice(0, 5)) + '</th>'; });
      h += '<th class="n">Total CX</th><th class="n">Cant.</th></tr></thead><tbody>';
      g.rows.forEach(function (r) {
        h += '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.caja) + '</td>';
        cons.cities.forEach(function (c) { var b = r.by[c]; h += '<td class="n">' + (b && b.cx ? fmt(b.cx) : '–') + '</td>'; });
        h += '<td class="n"><b>' + fmt(r.cx) + '</b></td><td class="n">' + fmt(r.qty) + ' ' + esc(r.unit) + '</td></tr>';
      });
      h += '</tbody></table></div>';
      if (!isUn) {
        h += '<div class="row" style="margin-top:8px"><button class="btn sm" data-dlp="' + esc(g.name) + '">Descargar Excel</button><button class="btn sec sm" data-copy="mail' + gi + '">Copiar correo</button></div>' +
          '<details style="margin-top:8px"><summary>Ver texto del correo</summary><textarea class="mail" id="mail' + gi + '" readonly>' + esc(L.mailText(g, cons.cities, dt, email)) + '</textarea></details>';
      }
      h += '</div>';
    });
    h += '</div>';
    el.innerHTML = h;
    var od = $('#odate'); if (od) od.onchange = function () { S.orderDate = od.value; renderOrders(); };
    var da = $('#dlAll'); if (da) da.onclick = dlAll;
    el.querySelectorAll('[data-dlp]').forEach(function (b) { b.onclick = function () { dlProvider(b.dataset.dlp); }; });
    el.querySelectorAll('[data-copy]').forEach(function (b) { b.onclick = function () { copyText(b.dataset.copy); }; });
    el.querySelectorAll('[data-email]').forEach(function (i) {
      i.onchange = function () { var n = i.dataset.email; (S.cat.provs[n] = S.cat.provs[n] || {}).email = i.value.trim(); saveCat(); renderOrders(); };
    });
  }

  function renderCat() {
    var cat = S.cat, h = '', provs = provList(), codes = Object.keys(cat.map);
    h += '<div class="card"><h2>Proveedores</h2><p class="muted">El correo se usa para preparar el texto de cada orden.</p><div class="tablewrap" style="max-height:260px"><table><thead><tr><th>Proveedor</th><th>Correo</th><th class="n">Productos</th></tr></thead><tbody>';
    provs.forEach(function (p) {
      var n = codes.filter(function (k) { return cat.map[k].p === p; }).length;
      h += '<tr><td>' + esc(p) + '</td><td><input data-pe="' + esc(p) + '" value="' + esc((cat.provs[p] || {}).email || '') + '" style="width:260px"></td><td class="n">' + n + '</td></tr>';
    });
    if (!provs.length) h += '<tr><td colspan="3" class="muted">Aún no hay proveedores.</td></tr>';
    h += '</tbody></table></div></div>';
    h += '<div class="card"><h2>Productos conocidos (' + codes.length + ')</h2><p class="muted">Cada producto del pedido se reconoce por su código de artículo, aunque el nombre cambie. El proveedor asignado aquí se aplica a todos los pedidos futuros.</p>' +
      '<div class="row" style="margin:6px 0"><input id="cf" placeholder="Buscar producto…" value="' + esc(S.filter) + '" style="width:260px"></div>' +
      '<datalist id="dlProv2">' + provs.map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') + '</datalist>' +
      '<div class="tablewrap"><table><thead><tr><th>Código</th><th>Nombre en el pedido</th><th>Nombre interno</th><th>Caja</th><th>Proveedor</th></tr></thead><tbody>';
    var f = L.norm(S.filter);
    codes.sort(function (a, b) { return (cat.map[a].n || '') < (cat.map[b].n || '') ? -1 : 1; }).forEach(function (k) {
      var e = cat.map[k];
      if (f && L.norm((e.n || '') + ' ' + (e.a || '')).indexOf(f) < 0) return;
      h += '<tr><td>' + esc(k.indexOf('N:') === 0 ? '—' : k) + '</td><td>' + esc(e.a || '') + '</td><td>' + esc(e.n || '') + '</td><td>' + esc(e.c || '') + '</td><td class="prov"><input list="dlProv2" data-pk="' + esc(k) + '" value="' + esc(e.p || '') + '"></td></tr>';
    });
    if (!codes.length) h += '<tr><td colspan="5" class="muted">El catálogo se irá llenando a medida que asignes proveedores.</td></tr>';
    h += '</tbody></table></div></div>';
    $('#p-cat').innerHTML = h;
    var cf = $('#cf'); if (cf) cf.onchange = function () { S.filter = cf.value; renderCat(); };
    document.querySelectorAll('[data-pe]').forEach(function (i) { i.onchange = function () { (cat.provs[i.dataset.pe] = cat.provs[i.dataset.pe] || {}).email = i.value.trim(); saveCat(); }; });
    document.querySelectorAll('[data-pk]').forEach(function (i) { i.onchange = function () { var e = cat.map[i.dataset.pk]; e.p = i.value.trim().toUpperCase(); if (e.p && !cat.provs[e.p]) cat.provs[e.p] = { email: '' }; saveCat(); renderCat(); }; });
  }

  function renderAll() {
    var has = S.files.length > 0;
    $('#nav [data-t=work]').disabled = !has; $('#nav [data-t=cons]').disabled = !has; $('#nav [data-t=orders]').disabled = !has;
    if (S.tab === 'hoy') renderHoy(); else if (S.tab === 'load') renderLoad(); else if (S.tab === 'tbl') renderTbl(); else if (S.tab === 'work') renderWork(); else if (S.tab === 'cons') renderCons(); else if (S.tab === 'orders') renderOrders(); else if (S.tab === 'exp') renderExp(); else if (S.tab === 'stats') renderStats(); else if (S.tab === 'ledger') renderLedger(); else if (S.tab === 'users') renderUsers(); else if (S.tab === 'rec') renderRec(); else if (S.tab === 'des') renderDes(); else renderCat();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-open],[data-del],[data-gread],[data-gbody]'); if (!t) return;
    if (t.dataset.go) { e.preventDefault(); setTab(t.dataset.go); }
    else if (t.dataset.open) { var f = S.files.filter(function (x) { return x.id == t.dataset.open; })[0]; if (f) { f.open = !f.open; renderLoad(); } }
    else if (t.dataset.del) { S.files = S.files.filter(function (x) { return x.id != t.dataset.del; }); renderAll(); }
    else if (t.dataset.gread) gmailRead(t.dataset.gread);
    else if (t.dataset.gbody) { var o = S.gmail.open[t.dataset.gbody]; if (o && o.body) processText(o.body, 'Correo de Gmail'); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target; if (t.dataset && t.dataset.city) {
      var f = S.files.filter(function (x) { return x.id == t.dataset.city; })[0]; if (f) { f.city = L.cityLabel(t.value); syncHist(); renderAll(); }
    }
  });
  $('#nav').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) setTab(b.dataset.t); });
  $('#subnav').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && b.dataset.t) setTab(b.dataset.t); });
  $('#bbar').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !b.dataset.g) return;
    var g = NAVG.filter(function (x) { return x.g === b.dataset.g; })[0], ok = navOk(), vis = g.t.filter(function (t) { return ok.indexOf(t) >= 0; });
    var to = S.gLast[g.g] && vis.indexOf(S.gLast[g.g]) >= 0 ? S.gLast[g.g] : vis[0]; if (to) setTab(to);
  });

  // ---------------------------------------------------------------- arranque
  function loadLocal() { try { var s = localStorage.getItem('catalog_v1'); if (s) S.cat = normCat(JSON.parse(s)); } catch (e) {} try { var h = localStorage.getItem('hist_v1'); if (h) S.hist = normHist(JSON.parse(h)); } catch (e) {} }
  try { var pc = localStorage.getItem('ola_cnt'); if (pc != null) S.prevCnt = +pc; } catch (e) {}
  // modo demo (versión pública con datos de ejemplo): sin Claude, sin correo, sin base de datos
  function demoInit() {
    var D = window.OLA_DEMO_DATA || { hist: {}, cat: {} };
    S.hist = normHist(D.hist); S.cat = normCat(D.cat); S.rec = D.rec || {}; S.demo = true; S.dbReady = true;
    S.dl = { save: async function (r) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.data])); a.download = r.filename; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 1500); } };
    applyRole({ name: 'Visitante', role: 'admin' });
  }
  async function init() {
    renderAll();
    if (window.OLA_DEMO) { demoInit(); return; }
    if (!window.claude || !window.claude.use) { loadLocal(); renderAll(); return; }
    try { S.sample = await claude.use('sample'); if (S.sample && S.sample.limits) { var lim = await S.sample.limits().catch(function () { return null; }); S.images = !!(lim && lim.images); } } catch (e) {}
    try { S.dl = await claude.use('downloads'); } catch (e) {}
    try { S.mcp = await claude.use('mcp'); } catch (e) {}
    try { S.db = await claude.use('db'); } catch (e) {}
    try { var rc = localStorage.getItem('rec_v1'); if (rc) S.rec = JSON.parse(rc); } catch (e) {}
    if (S.db) { try { S.recCol = S.db.collection('receipts'); S.recCol.onSnapshot(function (snap) { var m = {}; snap.forEach(function (d) { var v = d.data(); if (v && v.id) m[v.id] = v; }); S.rec = m; try { localStorage.setItem('rec_v1', JSON.stringify(m)); } catch (e) {} if (S.tab === 'rec') renderRec(); }, function () { S.recCol = null; }); } catch (e) { S.recCol = null; } }
    if (S.db) {
      S.catRef = S.db.doc('catalog/main');
      var timer = setTimeout(function () { S.dbMsg = 'El catálogo compartido tarda en responder; se muestra la copia de este navegador.'; renderAll(); }, 10000);
      loadLocal();
      S.catRef.onSnapshot(function (snap) {
        clearTimeout(timer);
        if (snap.metadata && snap.metadata.hasPendingWrites) return;
        if (snap.exists) { S.cat = normCat(snap.data()); S.dbMsg = ''; }
        renderAll();
      }, function (err) { clearTimeout(timer); S.catRef = null; S.dbMsg = 'No se pudo abrir el catálogo compartido (' + (err && err.code) + '); se usa la copia de este navegador.'; renderAll(); });
    } else loadLocal();
    if (S.db) {
      S.histRef = S.db.doc('history/main');
      S.histRef.onSnapshot(function (snap) {
        if (snap.metadata && snap.metadata.hasPendingWrites) return;
        if (snap.exists) { var inc = normHist(snap.data()); Object.keys(S.hist.orders).forEach(function (k) { if (!inc.orders[k]) inc.orders[k] = S.hist.orders[k]; }); var dd = dedupOrders(inc.orders); inc.orders = dd.orders; if (dd.removed) setTimeout(function () { S.hist = inc; saveHist(); }, 0); Object.keys(S.hist.seen).forEach(function (k) { inc.seen[k] = true; }); Object.keys(S.hist.boxes || {}).forEach(function (k) { if (!inc.boxes[k]) inc.boxes[k] = S.hist.boxes[k]; }); Object.keys(S.hist.costs || {}).forEach(function (k) { if (inc.costs[k] == null) inc.costs[k] = S.hist.costs[k]; }); Object.keys(S.hist.users || {}).forEach(function (k) { if (!inc.users[k]) inc.users[k] = S.hist.users[k]; }); S.hist = inc; }
        S.dbReady = true; if (S.user) checkSession(); if (S.tab === 'ledger' || S.tab === 'tbl' || S.tab === 'users') renderAll();
      }, function () { S.histRef = null; });
    }
    initAuth(); renderAll();
    if (S.mcp) driveSync();
  }
  init();
})();
