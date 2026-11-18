(function (root) {
  'use strict';
  // Libro de Excel con el formato de OLA: una hoja "Consolidado" (producto x ciudad) y una hoja por orden.
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); }

  // Tipo de caja según el producto (tomado de los cuadros de OLA). Primera regla que coincide.
  var REF_RULES = [
    [/MAZORCA/, 'MEDIANA'], [/PAPA CRIOLLA MINI/, 'MEDIANA'], [/PAPA (PAREJA|PASTUSA|R12)/, 'COSTAL'],
    [/PAPA (SIN LAVAR|LAVADA|EXTRA)/, 'BULTO'], [/CEBOLLA ROJA X 500/, 'BULTOS'], [/CEBOLLA (BLANCA|ROJA MALLA)/, null],
    [/AGUACATE HASS/, 'MEDIANA'], [/LIMON TAHITI/, 'MEDIANA'], [/NARANJA/, 'MEDIANA'], [/PAPAYA/, 'MEDIANA'], [/PINA/, 'MEDIANA'],
    [/PLATANO/, 'MEDIANA'], [/SANDIA/, 'MEDIANA'], [/TOMATE CHONTO/, 'MEDIANA'], [/TOMATE DE ARBOL (EXTRA|PQT)/, 'MEDIANA'],
    [/ZANAHORIA (BOLSA|PAQUETE)/, 'MEDIANA']
  ];
  function refCx(name) {
    var n = norm(name);
    for (var i = 0; i < REF_RULES.length; i++) if (REF_RULES[i][0].test(n)) {
      if (REF_RULES[i][1]) return REF_RULES[i][1];
      return /BLANCA/.test(n) ? 'MEDIANA' : 'MINI';
    }
    return 'MINI';
  }
  // Catálogo de cajas de OLA (de sus cuadros): nombre normalizado -> [tipo de caja, embalaje]
  var BUILTIN = {};
  [['AGUACATE','MINI',5],['AGUACATE HASS X 500 G','MEDIANA',10],['AJI TOPITO','MINI',3],['ARANDANOS 125G','MINI',12],['BOROJO 190G','MINI',12],['CALABACIN','MINI',3],
   ['CEBOLLA BLANCA LIMPIA','MEDIANA',10],['CEBOLLA BLANCA SEMIPELADA','MEDIANA',12],['CEBOLLA ROJA MALLA X 750GR','MINI',6],['CEBOLLA ROJA MALLA X 750','MINI',6],['CEBOLLA ROJA X 500 GR','BULTOS',25],
   ['CIRUELA BOLSA X 250','MINI',6],['COCO X UNIDAD','MINI',6],['DURAZNO GRANEL','MINI',4],['GRANADILLA','MINI',3],['JENGIBRE X 150 GR','MINI',10],['LIMON COMUN MALLA X 500 G','MINI',8],
   ['LIMON GRANEL','MINI',6],['LIMON TAHITI 1KG MALLA','MEDIANA',10],['LULO','MINI',5],['MANDARINA','MINI',5],['MANDARINA MALLA X 5 UNI','MINI',6],['MANGO 500 GR','MINI',5],['MARACUYA','MINI',3.5],
   ['NARANJA DE JUGO MALLA X 2 KG','MEDIANA',6],['PAPA CRIOLLA','MINI',7],['PAPA CRIOLLA MINI 1000 GR','MEDIANA',8],['PAPA LAVADA X 500 G','BULTO',25],['PAPA PAREJA MALLA X 1 5 KG','COSTAL',12],
   ['PAPA PASTUSA PQT 2 5 KG','COSTAL',8],['PAPA R12 PQT 2 5 KG','COSTAL',8],['PAPA SIN LAVAR X 500 G','COSTAL',12],['PIMENTON ROJO X 500G','MINI',3.5],['PIMENTON VERDE','MINI',3.5],
   ['PINA ORO MIEL','MEDIANA',11],['PITAHAYA 500 GR','MINI',5],['REMOLACHA X 500 GR','MINI',6],['SANDIA BABY','MEDIANA',10],['TOMATE CHERRY X 250 GR','MINI',8],['TOMATE CHONTO 500 GR','MEDIANA',15],
   ['TOMATE CHONTO MALLA X 1000','MEDIANA',12],['TOMATE DE ARBOL','MINI',6],['TOMATE DE ARBOL PQT X 1KG','MEDIANA',10],['ZANAHORIA A GRANEL X 500 G','MINI',5],['ZANAHORIA BOLSA X 1000G','MEDIANA',12],
   ['ZANAHORIA Y REMOLACHA MIX','MINI',10],['PAPAYA X 500GR','MEDIANA',10]].forEach(function (x) { BUILTIN[norm(x[0])] = [x[1], x[2]]; });
  // busca la definición de caja de un producto: primero lo que OLA haya guardado, luego el catálogo base
  function lookup(name, boxes) {
    var k = norm(name), b = boxes && boxes[k];
    if (b && b.emb) return { ref: b.ref || refCx(name), emb: +b.emb, saved: true };
    if (BUILTIN[k]) return { ref: BUILTIN[k][0], emb: BUILTIN[k][1], saved: false };
    return null;
  }
  function capOf(ref) { return CAP[String(ref || 'MINI').split(' ')[0]] || 80; }
  var CAP = { MINI: 80, MEDIANA: 30, BULTO: 30, BULTOS: 25, COSTAL: 30 };   // cajas por estiba
  function presOf(name) {
    var n = norm(name);
    if (/MALLA/.test(n)) return 'MALLA';
    if (/BOLSA|PQT|PAQUETE|SOLEI|CONGELAD/.test(n)) return 'BOLSA';
    if (/UNIDAD|BANDEJA|COCO| UNI\b|ARANDANOS/.test(n)) return 'UNIDAD';
    return 'A GRANEL';
  }
  var GROUPS = ['PAPAS', 'CEBOLLAS', 'TOMATES', 'HORTALIZAS Y VERDURAS', 'FRUTAS', 'CONGELADOS', 'OTROS'];
  function groupOf(name) {
    var n = norm(name);
    if (/SOLEI|CONGELAD/.test(n)) return 'CONGELADOS';
    if (/\bPAPA\b/.test(n)) return 'PAPAS';
    if (/CEBOLLA/.test(n)) return 'CEBOLLAS';
    if (/TOMATE/.test(n)) return 'TOMATES';
    if (/ZANAHORIA|REMOLACHA|CALABACIN|PIMENTON|PEPINO|MAZORCA|CILANTRO|JENGIBRE|HABICHUELA|AJI|LECHUGA|AJO|APIO|BROCOLI|COLIFLOR|REPOLLO|ESPINACA|PEREJIL|ARVEJA|YUCA|PLATANO|HABA/.test(n)) return 'HORTALIZAS Y VERDURAS';
    if (/AGUACATE|ARANDANO|BOROJO|CIRUELA|COCO|DURAZNO|GRANADILLA|GUAYABA|LIMON|LULO|MANDARINA|MANGO|MARACUYA|NARANJA|PAPAYA|PINA|PITAHAYA|SANDIA|UVA|FRESA|MORA|MELON|KIWI|MANZANA|PERA|BANANO|CURUBA|FEIJOA|GUANABANA|ZAPOTE/.test(n)) return 'FRUTAS';
    return 'OTROS';
  }
  function gIdx(name) { return GROUPS.indexOf(groupOf(name)); }
  function unitOf(u) { return /KG|KILO/i.test(u) ? 'KG' : 'UD'; }

  var PAL = {
    BARRANQUILLA: ['FFF2CC', 'FFD966'], MONTERIA: ['E2EFDA', 'A9D08E'], VALLEDUPAR: ['FCE4D6', 'F4B183'],
    CARTAGENA: ['DDEBF7', '9DC3E6'], MEDELLIN: ['E4DFEC', 'B4A7D6'], CUCUTA: ['FBE0EE', 'F4A6CF'], BOGOTA: ['E7E6E6', 'B7B7B7']
  };
  function pal(city) { return PAL[norm(city).replace(/ /g, '')] || ['EDEDED', 'BFBFBF']; }
  function fill(hex) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } }; }
  var thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  var BOX = { top: thin, left: thin, bottom: thin, right: thin };
  var FONT = 'Arial';
  var NUM = '#,##0;-#,##0;"-"', MONEY = '$ #,##0;-$ #,##0;"-"';

  function col(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function sheetName(n, used) {
    var s = String(n).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 28) || 'Hoja', k = s, i = 2;
    while (used[k.toLowerCase()]) k = s.slice(0, 26) + ' ' + (i++);
    used[k.toLowerCase()] = 1; return k;
  }
  function cell(ws, r, c, v, st) {
    var x = ws.getCell(r, c); if (v !== undefined) x.value = v;
    x.font = Object.assign({ name: FONT, size: 10 }, st && st.font || {});
    if (st && st.fill) x.fill = fill(st.fill);
    if (st && st.border !== false) x.border = BOX;
    x.alignment = Object.assign({ vertical: 'middle' }, st && st.al || {});
    if (st && st.nf) {
      var nv = v && typeof v === 'object' ? v.result : v;
      x.numFmt = st.nf === NUM ? (typeof nv === 'number' && Math.abs(nv - Math.round(nv)) > 1e-9 ? '#,##0.0#' : '#,##0;-#,##0;"-"') : st.nf;
    }
    return x;
  }

  // rows: [{chain,date,oc,city,name,ara,sku,unit,cx,emb,qty,word,price,prov}]
  function groupOrders(rows, merge) {
    var ord = {}, keys = [];
    rows.forEach(function (d) {
      var k = merge ? [d.city, d.date].join('|') : [d.chain, d.city, d.oc, d.date].join('|');
      if (!ord[k]) { ord[k] = { chain: merge ? '' : d.chain, city: d.city, oc: merge ? '' : d.oc, date: d.date, lines: [], merged: !!merge, ocs: [], chains: [], recvs: [] }; keys.push(k); }
      if (d.recv && ord[k].recvs.indexOf(d.recv) < 0) ord[k].recvs.push(d.recv);
      if (ord[k].ocs.indexOf(d.oc) < 0) ord[k].ocs.push(d.oc); if (ord[k].chains.indexOf(d.chain) < 0) ord[k].chains.push(d.chain);
      var nm = d.ara || d.name, ref = d.ref || refCx(nm), cx = d.cx || 0, emb = d.emb || (cx ? d.qty / cx : 0);
      if (ref === 'MINI' && norm(d.city) === 'CUCUTA') ref = 'MINI IFCO';
      if (ref === 'BULTO' && emb >= 12 && /SIN LAVAR/.test(norm(nm))) ref = 'BULTO';
      ord[k].lines.push({ name: nm, cx: cx, qty: d.qty, emb: emb, unit: unitOf(d.unit || d.word || ''), word: d.word, ref: ref, pres: presOf(d.name + ' ' + (d.ara || '')), price: d.price || 0, prov: d.prov || '', sinCx: !cx, est: !!d.est, cap: d.cap || 0, obs: d.chain + ' ' + d.oc + (d.est ? ' (cajas calculadas)' : '') });
    });
    keys.forEach(function (k) { if (merge) ord[k].lines.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }); });
    return keys.map(function (k) { return ord[k]; }).sort(function (a, b) { return a.city < b.city ? -1 : a.city > b.city ? 1 : (a.chain < b.chain ? -1 : 1); });
  }

  function orderSheet(wb, used, o, opt) {
    var ws = wb.addWorksheet(sheetName(o.merged ? o.city + ' ' + String(o.date).slice(0, 5).replace('.', '-') : o.city + ' ' + (o.chain === 'Éxito' ? 'Exito' : o.chain) + ' ' + String(o.oc).slice(-4), used), { views: [{ state: 'frozen', ySplit: 2 }] });
    var P = pal(o.city), pr = !!opt.prices;
    var H = ['#', 'PRODUCTO', 'N CX', 'CANTIDAD'].concat(pr ? ['PRECIO', 'TOTAL'] : [], ['UNIDAD', 'PRESENTACION', 'EMBALAJE', 'REF CX', 'PEDIDO', 'ESTIBAS', 'ESTIBAS', 'DESPACHO', 'OBSERVACION']);
    var W = [5, 38, 9, 12].concat(pr ? [10, 15] : [], [9, 15, 11, 11, 9, 9, 9, 14, 24]);
    W.forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
    var n = H.length, c = {}; H.forEach(function (h, i) { if (!c[h]) c[h] = i + 1; });
    var cEst2 = n - 2, cEst1 = n - 3, cPed = n - 4, cRef = n - 5, cUn = c['UNIDAD'];
    // fila 1: fecha, OC, ciudad
    ws.mergeCells(1, 1, 1, 2); cell(ws, 1, 1, opt.dateText(o.date), { fill: P[0], font: { bold: true, size: 10 }, al: { horizontal: 'center', wrapText: true } });
    cell(ws, 1, 3, 'O.C', { fill: P[0], font: { bold: true }, al: { horizontal: 'center' } });
    ws.mergeCells(1, 4, 1, cUn - 1 + 0); cell(ws, 1, 4, o.merged ? o.chains.join(' + ') + ' · ' + o.ocs.join(', ') : String(o.oc) + ' · ' + o.chain, { fill: P[0], font: { bold: true, color: { argb: 'FF7F3F00' } }, al: { horizontal: 'center' } });
    ws.mergeCells(1, cUn, 1, n); cell(ws, 1, cUn, o.city.toUpperCase(), { fill: P[1], font: { bold: true, size: 16 }, al: { horizontal: 'center' } });
    ws.getRow(1).height = 32;
    H.forEach(function (h, i) { cell(ws, 2, i + 1, h, { fill: 'D9E1F2', font: { bold: true, color: { argb: 'FF1F3864' } }, al: { horizontal: 'center', wrapText: true } }); });
    ws.getRow(2).height = 20;
    var r = 3, first = 3, packs = { MEDIANA: 0, MINI: 0, A: 0, B: 0 }, cnt = 0;
    o.lines.sort(function (a, b) { return gIdx(a.name) - gIdx(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    var subCols = [c['N CX'], c['CANTIDAD']].concat(pr ? [c['TOTAL']] : []);
    var gStart = 0, gName = '';
    var closeGroup = function () {
      if (!gName) return;
      var g = o.lines.filter(function (l) { return groupOf(l.name) === gName; });
      for (var k0 = 1; k0 <= n; k0++) cell(ws, r, k0, '', { fill: 'EDEDED', font: { bold: true, size: 9 } });
      ws.mergeCells(r, 1, r, 2); cell(ws, r, 1, 'Subtotal ' + gName.toLowerCase(), { fill: 'EDEDED', font: { bold: true, size: 9 }, al: { horizontal: 'right' } });
      subCols.forEach(function (cc0) {
        var res = g.reduce(function (a, l) { return a + (cc0 === c['N CX'] ? l.cx : cc0 === c['CANTIDAD'] ? l.qty : l.qty * l.price); }, 0);
        cell(ws, r, cc0, { formula: 'SUBTOTAL(9,' + col(cc0) + gStart + ':' + col(cc0) + (r - 1) + ')', result: res }, { fill: 'EDEDED', font: { bold: true, size: 9 }, al: { horizontal: cc0 === c['N CX'] ? 'center' : 'right' }, nf: cc0 === c['TOTAL'] ? MONEY : NUM });
      });
      r++;
    };
    o.lines.forEach(function (l, i) {
      if (groupOf(l.name) !== gName) {
        closeGroup(); gName = groupOf(l.name);
        for (var k1 = 1; k1 <= n; k1++) cell(ws, r, k1, '', { fill: P[1], font: { bold: true } });
        ws.mergeCells(r, 1, r, n); cell(ws, r, 1, gName, { fill: P[1], font: { bold: true, size: 10 }, al: { horizontal: 'left' } });
        r++; gStart = r;
      }
      cnt++;
      var cap = l.cap || capOf(l.ref), bg = cnt % 2 ? null : 'F7F9FC';
      var st = function (al, nf, extra) { return { fill: bg, al: al || {}, nf: nf, font: extra }; };
      cell(ws, r, 1, cnt, st({ horizontal: 'center' }));
      cell(ws, r, 2, l.name, st());
      cell(ws, r, c['N CX'], l.sinCx ? '' : l.cx, st({ horizontal: 'center' }, NUM, { bold: true }));
      cell(ws, r, c['CANTIDAD'], l.qty, st({ horizontal: 'right' }, NUM));
      if (pr) {
        cell(ws, r, c['PRECIO'], l.price, st({ horizontal: 'right' }, MONEY));
        cell(ws, r, c['TOTAL'], { formula: col(c['CANTIDAD']) + r + '*' + col(c['PRECIO']) + r, result: l.qty * l.price }, st({ horizontal: 'right' }, MONEY));
      }
      cell(ws, r, cUn, l.unit, st({ horizontal: 'center' }));
      cell(ws, r, c['PRESENTACION'], l.pres, st({ horizontal: 'center' }));
      cell(ws, r, c['EMBALAJE'], l.sinCx ? '' : Math.round(l.emb * 100) / 100, st({ horizontal: 'center' }, NUM));
      cell(ws, r, cRef, l.sinCx ? '' : l.ref, st({ horizontal: 'center' }));
      cell(ws, r, cPed, l.sinCx ? '' : { formula: col(c['N CX']) + r, result: l.cx }, st({ horizontal: 'center' }, NUM));
      var est = l.sinCx ? 0 : l.cx / cap;
      cell(ws, r, cEst1, l.sinCx ? '' : { formula: 'ROUND(' + col(cPed) + r + '/' + cap + ',2)', result: Math.round(est * 100) / 100 }, st({ horizontal: 'center' }, '0.00'));
      cell(ws, r, cEst2, l.sinCx ? '' : { formula: 'ROUNDUP(' + col(cEst1) + r + ',0)', result: Math.ceil(est - 1e-9) }, st({ horizontal: 'center' }, '0'));
      cell(ws, r, cEst2 + 1, '', st()); cell(ws, r, cEst2 + 2, o.merged ? l.obs : '', st());
      if (!l.sinCx) { if (l.ref === 'MEDIANA') packs.MEDIANA += l.cx; else if (/^MINI/.test(l.ref)) packs.MINI += l.cx; else if (l.ref === 'BULTO' && l.emb >= 12 && /SIN LAVAR/.test(norm(l.name))) packs.B += l.cx; else packs.A += l.cx; }
      r++;
    });
    closeGroup();
    var last = r - 1, tot = r;
    var sum = function (cc) { return { formula: 'SUBTOTAL(9,' + col(cc) + first + ':' + col(cc) + last + ')' }; };
    var tv = function (cc, f) { var s = 0; o.lines.forEach(function (l) { s += f(l); }); return s; };
    var T = { fill: P[0], font: { bold: true } };
    for (var k = 1; k <= n; k++) cell(ws, tot, k, '', T);
    ws.mergeCells(tot, 1, tot, 2); cell(ws, tot, 1, 'PESO EN BRUTO', Object.assign({ al: { horizontal: 'center' } }, T));
    cell(ws, tot, c['N CX'], Object.assign(sum(c['N CX']), { result: tv(0, function (l) { return l.cx; }) }), Object.assign({ al: { horizontal: 'center' }, nf: NUM }, T));
    cell(ws, tot, c['CANTIDAD'], Object.assign(sum(c['CANTIDAD']), { result: tv(0, function (l) { return l.qty; }) }), Object.assign({ al: { horizontal: 'right' }, nf: NUM }, T));
    if (pr) cell(ws, tot, c['TOTAL'], Object.assign(sum(c['TOTAL']), { result: tv(0, function (l) { return l.qty * l.price; }) }), Object.assign({ al: { horizontal: 'right' }, nf: MONEY }, T));
    cell(ws, tot, cPed, Object.assign(sum(cPed), { result: tv(0, function (l) { return l.cx; }) }), Object.assign({ al: { horizontal: 'center' }, nf: NUM }, T));
    cell(ws, tot, cEst1, Object.assign(sum(cEst1), { result: tv(0, function (l) { return l.sinCx ? 0 : l.cx / (l.cap || capOf(l.ref)); }) }), Object.assign({ al: { horizontal: 'center' }, nf: '0.00' }, T));
    cell(ws, tot, cEst2, Object.assign(sum(cEst2), { result: tv(0, function (l) { return l.sinCx ? 0 : Math.ceil(l.cx / (l.cap || capOf(l.ref)) - 1e-9); }) }), Object.assign({ al: { horizontal: 'center' }, nf: '0' }, T));
    var allSin = o.lines.every(function (l) { return l.sinCx; });
    if (allSin) [c['N CX'], c['EMBALAJE'], cRef, cPed, cEst1, cEst2].forEach(function (k) { ws.getColumn(k).hidden = true; });
    if (allSin) { ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }; return ws; }
    // empaque
    var er = tot + 3, ec = 2;
    var EH = ['EMPAQUE', 'CTD', 'CUBICAJE', 'PESO CX'];
    EH.forEach(function (h, i) { cell(ws, er, ec + i, h, { fill: 'D9E1F2', font: { bold: true, size: 9 }, al: { horizontal: 'center' } }); });
    var items = [['CX MEDIANA', packs.MEDIANA, 0.72, 2.0], ['CX MINI', packs.MINI, 0.34, 1.15], ['BULTOS 18*20*25', packs.A, 0.70, 0], ['BULTOS *12', packs.B, 0.45, 0]];
    items.forEach(function (it, i) {
      var rr = er + 1 + i;
      cell(ws, rr, ec, it[0], { font: { size: 9 } }); cell(ws, rr, ec + 1, it[1], { al: { horizontal: 'center' }, nf: NUM });
      cell(ws, rr, ec + 2, { formula: col(ec + 1) + rr + '*' + it[2], result: it[1] * it[2] }, { al: { horizontal: 'center' }, nf: '0.0' });
      cell(ws, rr, ec + 3, it[3] ? { formula: col(ec + 1) + rr + '*' + it[3], result: it[1] * it[3] } : '-', { al: { horizontal: 'center' }, nf: '0.0' });
    });
    var tr = er + 1 + items.length, a = er + 1, b = tr - 1;
    var tc = items.reduce(function (s, it) { return s + it[1]; }, 0), tcub = items.reduce(function (s, it) { return s + it[1] * it[2]; }, 0), tpk = items.reduce(function (s, it) { return s + it[1] * it[3]; }, 0);
    cell(ws, tr, ec, 'TOTAL EMPAQUE', { fill: P[0], font: { bold: true, size: 9 } });
    cell(ws, tr, ec + 1, { formula: 'SUM(' + col(ec + 1) + a + ':' + col(ec + 1) + b + ')', result: tc }, { fill: P[0], font: { bold: true }, al: { horizontal: 'center' }, nf: NUM });
    cell(ws, tr, ec + 2, { formula: 'SUM(' + col(ec + 2) + a + ':' + col(ec + 2) + b + ')', result: tcub }, { fill: P[0], font: { bold: true }, al: { horizontal: 'center' }, nf: '0.0' });
    cell(ws, tr, ec + 3, { formula: 'SUM(' + col(ec + 3) + a + ':' + col(ec + 3) + b + ')', result: tpk }, { fill: P[0], font: { bold: true }, al: { horizontal: 'center' }, nf: '0.0' });
    ws.mergeCells(tr + 1, ec, tr + 1, ec + 2);
    var qsum = tv(0, function (l) { return l.qty; });
    cell(ws, tr + 1, ec, 'SUMATORIA PESO CX Y MERCANCIA', { fill: 'FFF2CC', font: { bold: true, size: 9 }, al: { horizontal: 'center' } });
    cell(ws, tr + 1, ec + 3, { formula: col(c['CANTIDAD']) + tot + '+' + col(ec + 3) + tr, result: qsum + tpk }, { fill: 'FFF2CC', font: { bold: true }, al: { horizontal: 'center' }, nf: NUM });
    if (o.chain === 'Éxito' || (o.merged && o.chains.indexOf('Éxito') >= 0)) { ws.mergeCells(tr + 3, 2, tr + 3, 8); cell(ws, tr + 3, 2, 'Éxito: cantidades en kilos. Las cajas de Éxito se calculan con el embalaje del catálogo; sin embalaje definido quedan en blanco.', { border: false, font: { italic: true, color: { argb: 'FF7F6000' } } }); }
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return ws;
  }

  function consolidated(wb, used, orders, opt) {
    var cities = [], prods = {}, order = [];
    orders.forEach(function (o) {
      if (cities.indexOf(o.city) < 0) cities.push(o.city);
      o.lines.forEach(function (l) {
        var k = norm(l.name);
        if (!prods[k]) { prods[k] = { name: l.name, ref: l.ref, emb: l.emb, prov: l.prov, by: {} }; order.push(k); }
        var p = prods[k]; if (!p.prov && l.prov) p.prov = l.prov;
        var b = p.by[o.city] || (p.by[o.city] = { cx: 0, qty: 0, val: 0 });
        b.cx += l.cx; b.qty += l.qty; b.val += l.qty * l.price;
      });
    });
    cities.sort();
    order.sort(function (a, b) { return gIdx(prods[a].name) - gIdx(prods[b].name) || (prods[a].name < prods[b].name ? -1 : 1); });
    var ws = wb.addWorksheet('Consolidado', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] });
    var anyProv = order.some(function (k) { return prods[k].prov; }), pr = !!opt.prices;
    var nFix = 5, nCols = nFix + cities.length * 2 + (anyProv ? 1 : 0) + (pr ? 1 : 0);
    ws.getColumn(1).width = 38; ws.getColumn(2).width = 12; ws.getColumn(3).width = 10; ws.getColumn(4).width = 11; ws.getColumn(5).width = 9;
    cities.forEach(function (ct, i) { ws.getColumn(nFix + 1 + i * 2).width = 8; ws.getColumn(nFix + 2 + i * 2).width = 11; });
    var cc = nFix + cities.length * 2 + 1; if (anyProv) ws.getColumn(cc).width = 16; if (pr) ws.getColumn(cc + (anyProv ? 1 : 0)).width = 16;
    ws.mergeCells(1, 1, 1, nFix); cell(ws, 1, 1, 'CONSOLIDADO ALMACENES' + (opt.title ? ' · ' + opt.title : ''), { fill: '1F3864', font: { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }, al: { horizontal: 'center' } });
    ws.getRow(1).height = 26;
    cities.forEach(function (ct, i) {
      var c1 = nFix + 1 + i * 2; ws.mergeCells(2, c1, 2, c1 + 1);
      cell(ws, 2, c1, ct.toUpperCase(), { fill: pal(ct)[1], font: { bold: true, size: 11 }, al: { horizontal: 'center' } }); cell(ws, 2, c1 + 1, undefined, { fill: pal(ct)[1] });
    });
    ['PRODUCTO', 'RESUMEN CANT.', 'RESUMEN CX', 'REF CX', 'EMBALAJE'].forEach(function (h, i) { cell(ws, 3, i + 1, h, { fill: 'D9E1F2', font: { bold: true, color: { argb: 'FF1F3864' } }, al: { horizontal: 'center', wrapText: true } }); });
    cell(ws, 2, 1, undefined, { fill: 'D9E1F2' });
    cities.forEach(function (ct, i) { var c1 = nFix + 1 + i * 2; cell(ws, 3, c1, 'CX', { fill: pal(ct)[1], font: { bold: true }, al: { horizontal: 'center' } }); cell(ws, 3, c1 + 1, 'CANT.', { fill: pal(ct)[1], font: { bold: true }, al: { horizontal: 'center' } }); });
    if (anyProv) cell(ws, 3, cc, 'PROVEEDOR', { fill: 'D9E1F2', font: { bold: true }, al: { horizontal: 'center' } });
    if (pr) cell(ws, 3, cc + (anyProv ? 1 : 0), 'VALOR (COP)', { fill: 'D9E1F2', font: { bold: true }, al: { horizontal: 'center' } });
    var r = 4, first = 4, tcx = 0, tq = 0, tval = 0, cityTot = cities.map(function () { return { cx: 0, q: 0 }; });
    var gName = '', gStart = 0, gs = {}, cnt = 0, valCol = cc + (anyProv ? 1 : 0);
    var closeGroup = function () {
      if (!gName) return;
      for (var kk = 1; kk <= nCols; kk++) cell(ws, r, kk, '', { fill: 'EDEDED', font: { bold: true, size: 9 } });
      cell(ws, r, 1, 'Subtotal ' + gName.toLowerCase(), { fill: 'EDEDED', font: { bold: true, size: 9 }, al: { horizontal: 'right' } });
      Object.keys(gs).forEach(function (k3) { var c3 = +k3; cell(ws, r, c3, { formula: 'SUBTOTAL(9,' + col(c3) + gStart + ':' + col(c3) + (r - 1) + ')', result: gs[k3] }, { fill: 'EDEDED', font: { bold: true, size: 9 }, al: { horizontal: (c3 === 2 || (c3 > nFix && (c3 - nFix) % 2 === 0) || c3 === valCol) ? 'right' : 'center' }, nf: (pr && c3 === valCol) ? MONEY : NUM }); });
      r++; gs = {};
    };
    var addG = function (c4, v) { gs[c4] = (gs[c4] || 0) + v; };
    order.forEach(function (k, ix) {
      var p = prods[k];
      if (groupOf(p.name) !== gName) {
        closeGroup(); gName = groupOf(p.name);
        for (var k5 = 1; k5 <= nCols; k5++) cell(ws, r, k5, '', { fill: '1F3864', font: { bold: true, color: { argb: 'FFFFFFFF' } } });
        ws.mergeCells(r, 1, r, nCols); cell(ws, r, 1, gName, { fill: '1F3864', font: { bold: true, color: { argb: 'FFFFFFFF' } }, al: { horizontal: 'left' } });
        r++; gStart = r;
      }
      cnt++;
      var bg = cnt % 2 ? null : 'F7F9FC', sCx = 0, sQ = 0, sV = 0, fc = [], fq = [];
      cell(ws, r, 1, p.name, { fill: bg });
      cities.forEach(function (ct, i) {
        var b = p.by[ct], c1 = nFix + 1 + i * 2, tone = pal(ct)[0];
        cell(ws, r, c1, b && b.cx ? b.cx : '-', { fill: b ? tone : bg, al: { horizontal: 'center' }, nf: NUM, font: { bold: true } });
        cell(ws, r, c1 + 1, b && b.qty ? b.qty : '-', { fill: b ? tone : bg, al: { horizontal: 'right' }, nf: NUM });
        if (b) { sCx += b.cx; sQ += b.qty; sV += b.val; cityTot[i].cx += b.cx; cityTot[i].q += b.qty; addG(c1, b.cx); addG(c1 + 1, b.qty); }
        fc.push(col(c1) + r); fq.push(col(c1 + 1) + r);
      });
      cell(ws, r, 2, { formula: 'SUM(' + fq.join(',') + ')', result: sQ }, { fill: bg, al: { horizontal: 'right' }, nf: NUM, font: { bold: true } });
      cell(ws, r, 3, { formula: 'SUM(' + fc.join(',') + ')', result: sCx }, { fill: bg, al: { horizontal: 'center' }, nf: NUM, font: { bold: true } });
      cell(ws, r, 4, sCx ? p.ref : '', { fill: bg, al: { horizontal: 'center' } });
      cell(ws, r, 5, sCx && p.emb ? Math.round(p.emb * 100) / 100 : '', { fill: bg, al: { horizontal: 'center' }, nf: NUM });
      if (anyProv) cell(ws, r, cc, p.prov, { fill: bg, al: { horizontal: 'center' } });
      if (pr) cell(ws, r, cc + (anyProv ? 1 : 0), sV, { fill: bg, al: { horizontal: 'right' }, nf: MONEY });
      addG(2, sQ); addG(3, sCx); if (pr) addG(valCol, sV);
      tcx += sCx; tq += sQ; tval += sV; r++;
    });
    closeGroup();
    var last = r - 1, T = { fill: 'FFD966', font: { bold: true } };
    for (var k2 = 1; k2 <= nCols; k2++) cell(ws, r, k2, '', T);
    cell(ws, r, 1, 'GRAN TOTAL', Object.assign({ al: { horizontal: 'center' } }, T));
    var colSum = function (c0, res, nf, al) { cell(ws, r, c0, { formula: 'SUBTOTAL(9,' + col(c0) + first + ':' + col(c0) + last + ')', result: res }, Object.assign({ al: { horizontal: al || 'center' }, nf: nf || NUM }, T)); };
    colSum(2, tq, NUM, 'right'); colSum(3, tcx);
    cities.forEach(function (ct, i) { var c1 = nFix + 1 + i * 2; colSum(c1, cityTot[i].cx); colSum(c1 + 1, cityTot[i].q, NUM, 'right'); });
    if (pr) colSum(cc + (anyProv ? 1 : 0), tval, MONEY, 'right');
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws.getCell(r + 2, 1).value = 'Éxito va en kilos; Ara en kilos o unidades según cada producto. Cajas de Éxito: calculadas con el embalaje del catálogo.';
    ws.getCell(r + 2, 1).font = { name: FONT, size: 9, italic: true, color: { argb: 'FF7F7F7F' } };
  }

  function build(ExcelJS, rows, opt) {
    opt = opt || {}; opt.dateText = opt.dateText || function (d) { return d; };
    var wb = new ExcelJS.Workbook(); wb.creator = 'OLA SAS'; wb.created = new Date();
    var orders = groupOrders(rows, opt.merge), used = { consolidado: 1 };
    if (!opt.noConsol) consolidated(wb, used, orders, opt);
    if (!opt.only) orders.forEach(function (o) { orderSheet(wb, used, o, opt); });
    return wb;
  }
  function stats(rows) {
    var cx = 0, est = 0, qty = 0;
    rows.forEach(function (d) { var c = d.cx || 0; cx += c; qty += d.qty || 0; est += c / (d.cap || capOf(d.ref || refCx(d.ara || d.name))); });
    return { cx: cx, est: est, qty: qty, lines: rows.length };
  }
  root.OlaXlsx = { build: build, refCx: refCx, groupOrders: groupOrders, lookup: lookup, capOf: capOf, stats: stats };
  if (typeof module !== 'undefined') module.exports = root.OlaXlsx;
})(typeof window !== 'undefined' ? window : globalThis);
