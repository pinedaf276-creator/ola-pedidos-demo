(function (root) {
  'use strict';

  var KNOWN = {
    BARRANQUILLA: 'Barranquilla', MONTERIA: 'Montería', VALLEDUPAR: 'Valledupar', CARTAGENA: 'Cartagena',
    MEDELLIN: 'Medellín', CUCUTA: 'Cúcuta', BOGOTA: 'Bogotá', CALI: 'Cali', BUCARAMANGA: 'Bucaramanga',
    PEREIRA: 'Pereira', COTA: 'Cota', GACHANCIPA: 'Gachancipá', 'SATELITE R7': 'Satélite R7 (Bogotá)', 'SATELITE R7 BOGOTA': 'Satélite R7 (Bogotá)', 'SANTA MARTA': 'Santa Marta', SINCELEJO: 'Sincelejo', 'VILLAVICENCIO': 'Villavicencio'
  };

  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  function num(v) {
    if (typeof v === 'number') return v;
    if (v == null || v === '') return NaN;
    var s = String(v).trim().replace(/\s/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }

  function normUnit(u) {
    var x = norm(u);
    if (x === 'UN' || x === 'UND' || x === 'UNIDAD' || x === 'UNIDADES') return 'UD';
    if (x === 'KILO' || x === 'KILOS' || x === 'KGS') return 'KG';
    return x;
  }


  // Presentación leída del nombre: "MALLA DE JENGIBRE X 150 GR" -> malla de 150 g
  var PACKS = [['MALLA', 'malla', 'mallas'], ['BOLSA', 'bolsa', 'bolsas'], ['ESTUCHE', 'estuche', 'estuches'], ['BANDEJA', 'bandeja', 'bandejas'], ['CANASTILLA', 'canastilla', 'canastillas'], ['PAQUETE', 'paquete', 'paquetes'], ['PQT', 'paquete', 'paquetes'], ['GRANEL', 'granel', 'kilos']];
  function presentation(name, unit, chain) {
    var n = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(), pack = null, g = 0, cnt = 0, m;
    if (/SOLEI|CONGELAD/.test(n)) pack = ['SOLEI', 'bolsa congelada', 'bolsas congeladas'];
    PACKS.forEach(function (p) { if (!pack && new RegExp('\\b' + p[0] + '\\b').test(n)) pack = p; });
    if ((m = /(\d+(?:[.,]\d+)?)\s*(KGS?|KILOS?|K)(?![A-Z])/.exec(n))) g = num(m[1]) * 1000;
    else if ((m = /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(GRS?|G)\b/.exec(n))) g = num(m[1].replace(/\.(?=\d{3}\b)/g, ''));
    if ((m = /X\s*(\d+)\s*UN\b/.exec(n))) cnt = +m[1];
    var label, word, wordSg;
    if (chain === 'Éxito') { return { pres: /GRANEL/.test(n) ? 'Granel' : '', word: 'kilos', g: 0, cnt: 0, kgQty: true }; }
    if (!pack && g) pack = ['', 'empaque', 'empaques'];
    if (pack && pack[0] === 'GRANEL') { label = 'Granel'; word = 'kilos'; }
    else if (pack) { label = pack[1].charAt(0).toUpperCase() + pack[1].slice(1) + (g ? ' de ' + (g >= 1000 ? (g / 1000).toString().replace('.', ',') + ' kg' : g + ' g') : '') + (cnt ? ' x ' + cnt + ' und' : ''); word = pack[2]; }
    else if (cnt) { label = cnt + ' unidades'; word = 'unidades'; }
    else { label = ''; word = unit === 'KG' ? 'kilos' : 'unidades'; }
    // en los pedidos de Ara, si el PDF trae la cantidad en KG, esa cantidad ya es el total en kilos
    if (unit === 'KG') return { pres: label, word: 'kilos', g: g, cnt: cnt, kgQty: true };
    return { pres: label, word: word, g: g, cnt: cnt };
  }

  function cityLabel(s) {
    var n = norm(s);
    if (!n) return '';
    if (KNOWN[n]) return KNOWN[n];
    return n.toLowerCase().replace(/(^|\s)\S/g, function (m) { return m.toUpperCase(); });
  }

  function addWarn(l) {
    l.warn = l.emb > 0 && Math.abs(l.qty - l.cx * l.emb) > Math.max(0.5, l.qty * 0.01);
    return l;
  }

  // Lectura directa de hojas con encabezados PRODUCTO / N CX / CANTIDAD. Devuelve null si no reconoce el formato.
  function parseDirect(rows) {
    var hi = -1, c = null, r, cells;
    for (r = 0; r < Math.min(rows.length, 25); r++) {
      cells = (rows[r] || []).map(norm);
      var ip = cells.findIndex(function (x) { return x === 'PRODUCTO' || x === 'PRODUCTOS' || x === 'ARTICULO' || x === 'DESCRIPCION'; });
      var ix = cells.findIndex(function (x) { return /^(N CX|NCX|N CAJAS|CAJAS|CX)$/.test(x); });
      var iq = cells.findIndex(function (x) { return /^(CANTIDAD|CANT)$/.test(x); });
      if (ip >= 0 && ix >= 0 && iq >= 0) {
        c = {
          prod: ip, cx: ix, qty: iq,
          unit: cells.indexOf('UNIDAD'),
          emb: cells.indexOf('EMBALAJE'),
          caja: cells.findIndex(function (x) { return x === 'REF CX' || x === 'REF'; })
        };
        hi = r; break;
      }
    }
    if (hi < 0) return null;

    var city = '', oc = [], date = '';
    for (r = 0; r <= hi; r++) {
      (rows[r] || []).forEach(function (cell) {
        var t = String(cell == null ? '' : cell).trim();
        if (!t) return;
        if (KNOWN[norm(t)]) city = KNOWN[norm(t)];
        if (/^\d{8,}$/.test(t) && oc.indexOf(t) < 0) oc.push(t);
        if (!date && /\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}/i.test(t)) date = t;
      });
    }
    if (!city) {
      for (r = 0; r < hi && !city; r++) {
        var row = rows[r] || [];
        for (var j = row.length - 1; j >= 0; j--) {
          var t2 = String(row[j] == null ? '' : row[j]).trim();
          if (/^[A-Za-zÁÉÍÓÚÑáéíóúñ ]{4,}$/.test(t2) && !/^(PRODUCTO|O C)$/.test(norm(t2))) { city = cityLabel(t2); break; }
        }
      }
    }

    var lines = [];
    for (r = hi + 1; r < rows.length; r++) {
      var rw = rows[r] || [];
      var name = String(rw[c.prod] == null ? '' : rw[c.prod]).trim();
      var nm = norm(name);
      if (/^(PESO EN BRUTO|TOTAL)/.test(nm)) break;
      if (!name) continue;
      var cx = num(rw[c.cx]), qty = num(rw[c.qty]);
      if (isNaN(cx) && isNaN(qty)) continue;
      var emb = c.emb >= 0 ? num(rw[c.emb]) : NaN;
      if (isNaN(cx) && emb > 0) cx = qty / emb;
      if (isNaN(qty) && emb > 0) qty = cx * emb;
      lines.push(addWarn({
        code: c.prod > 0 && rw[c.prod - 1] !== '' ? String(rw[c.prod - 1]) : '',
        name: name, key: nm,
        unit: c.unit >= 0 ? normUnit(rw[c.unit]) : '',
        caja: c.caja >= 0 ? norm(rw[c.caja]) : '',
        emb: isNaN(emb) ? 0 : emb,
        cx: isNaN(cx) ? 0 : cx, qty: isNaN(qty) ? 0 : qty
      }));
    }
    return { city: city, oc: oc.join(' / '), date: date, lines: lines };
  }

  function sheetToText(rows) {
    return rows.map(function (r) { return (r || []).map(function (x) { return String(x == null ? '' : x); }).join('\t'); })
      .join('\n').slice(0, 200000);
  }

  // Normaliza la respuesta de la IA al mismo formato que parseDirect
  function fromAI(obj) {
    var arr = (obj && (obj.lineas || obj.lines)) || [];
    var lines = arr.map(function (x) {
      var name = String(x.producto || x.name || '').trim();
      var cx = num(x.cajas != null ? x.cajas : x.cx), qty = num(x.cantidad != null ? x.cantidad : x.qty);
      var emb = num(x.und_por_caja != null ? x.und_por_caja : x.emb);
      if (isNaN(cx) && !isNaN(qty) && emb > 0) cx = qty / emb;
      if (isNaN(qty) && !isNaN(cx) && emb > 0) qty = cx * emb;
      return addWarn({
        code: x.codigo != null ? String(x.codigo) : '', name: name, key: norm(name),
        unit: normUnit(x.unidad || ''), caja: norm(x.caja || ''),
        emb: isNaN(emb) ? 0 : emb, cx: isNaN(cx) ? 0 : cx, qty: isNaN(qty) ? 0 : qty
      });
    }).filter(function (l) { return l.name && (l.cx || l.qty); });
    return {
      city: cityLabel(obj && (obj.ciudad || obj.city) || ''),
      oc: String(obj && (obj.orden_compra || obj.oc) || ''),
      date: String(obj && (obj.fecha_entrega || obj.date) || ''),
      lines: lines
    };
  }

  // ---------- PDF de pedido (SAP / Jerónimo Martins - Ara) ----------
  function textFromItems(items) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str || !String(it.str).trim()) return;
      var row = null;
      for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - it.y) < 2.5) { row = rows[i]; break; }
      if (!row) { row = { y: it.y, its: [] }; rows.push(row); }
      row.its.push(it);
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      return r.its.sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.str; }).join(' ');
    }).join('\n');
  }

  var PO_LINE = /(?<!\d)(\d{9})(?=\s)\s+(.+?)\s+(\d+)\s+(\d+)\s+CX\s+([\d.,]+)\s+(KG|UN|UD)\s+\d+\s+([\d.,]+)\s+([\d.,]+)\s+\d+%/g;

  function addDays(dmy, n) {
    var m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(dmy || '');
    if (!m) return '';
    var d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1] + n));
    var days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    var months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return days[d.getUTCDay()] + ', ' + d.getUTCDate() + ' de ' + months[d.getUTCMonth()] + ' de ' + d.getUTCFullYear();
  }

  // Lee el texto de un pedido de compra. Devuelve null si no parece uno.
  function parsePdfText(text) {
    var s = String(text || '').replace(/\s+/g, ' ');
    var lines = [], m;
    PO_LINE.lastIndex = 0;
    while ((m = PO_LINE.exec(s))) {
      var cx = parseInt(m[4], 10), qty = num(m[5]);
      // el factor del PDF a veces viene sin decimal (35 en lugar de 3,5): se usa cantidad / cajas
      lines.push({
        sku: m[1], code: m[1], name: m[2].trim(), key: m[1],
        unit: normUnit(m[6]), caja: '', emb: cx > 0 ? qty / cx : parseInt(m[3], 10), cx: cx, qty: qty,
        price: Math.round(num(m[7].replace(/\./g, ''))), warn: false
      });
    }
    if (!lines.length) return null;
    var oc = (/N[ºo°]\s*del\s*Pedido:?\s*(\d{8,})/i.exec(s) || /(?<!\d)(45\d{8})(?!\d)/.exec(s) || [])[1] || '';
    var delivery = (/Fecha\s+de\s+Entrega:?\s*(\d{2}\.\d{2}\.\d{4})/i.exec(s) || [])[1] || '';
    var poDate = (/Fecha\s+del\s+Pedido:?\s*(\d{2}\.\d{2}\.\d{4})/i.exec(s) || [])[1] || '';
    var sn = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    var lm = /Lugar\s+de\s+Entrega:?\s*(.+?)\s+\d{4}\b/i.exec(sn) || /CENTRO\s+(?:DE\s+)?DISTRIBUCION\s+(.+?)\s+\d{3,}/i.exec(sn);
    var city = '';
    if (lm) {
      var seg = norm(lm[1]);
      Object.keys(KNOWN).forEach(function (k) { if (!city && new RegExp('(^| )' + k + '( |$)').test(seg)) city = KNOWN[k]; });
      if (!city) city = cityLabel(seg.replace(/\b(PARCELA|VEREDA|KM|CALLE|CR|CL|AV)\b.*$/,' ').replace(/\b(PROYECTO|3PL|CEDI|CENTRO|DE|DISTRIBUCION|SATELITE|FRIOS|FRUVER|CD|PLATAFORMA)\b/g, ' ').replace(/\s+/g, ' ').trim());
    }
    var cand = (s.match(/(?<!\d)000\d{6}(?=\s)/g) || []).length;
    var tm = /Valor\s+net\.?\s*total\s+sin\s+IVA\s+([\d.]+)/i.exec(s);
    var declared = tm ? parseInt(tm[1].replace(/\./g, ''), 10) : null;
    var calc = lines.reduce(function (a, l) { return a + l.qty * l.price; }, 0);
    return {
      kind: 'pdf', chain: 'Ara', city: city, oc: oc, date: delivery, poDate: poDate, lines: lines,
      declared: declared, calc: calc, unread: Math.max(0, cand - lines.length), totalOk: declared == null ? null : Math.abs(declared - calc) < 1
    };
  }


  // ---- Éxito: Excel con una hoja "Bd" que trae las órdenes de TODOS los proveedores; se queda solo con la nuestra
  var MY_NITS = ['000000000'];
  var MY_NAME = /OPERADOR\s+LOG[IÍ]ST/i;
  function ymd(v) { var m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(v || '').trim()); return m ? m[3] + '.' + m[2] + '.' + m[1] : String(v || ''); }
  function parseExito(rows) {
    var h = -1;
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var t = rows[i].map(function (c) { return norm(c); });
      if (t.indexOf('PROVEEDOR') >= 0 && t.indexOf('ORDEN') >= 0 && t.indexOf('PLU') >= 0 && t.indexOf('C PED') >= 0) { h = i; break; }
    }
    if (h < 0) return null;
    var hd = rows[h].map(function (c) { return norm(c); });
    var ix = function (n) { return hd.indexOf(n); };
    var cNit = ix('NIT'), cProv = ix('PROVEEDOR'), cDep = ix('DEP DESC'), cOrd = ix('ORDEN'), cFin = ix('F INI'), cPlu = ix('PLU'), cDesc = ix('DESC PLU'), cQty = ix('C PED'), cCst = ix('CST');
    var pos = {}, order = [], total = 0;
    for (var r = h + 1; r < rows.length; r++) {
      var x = rows[r]; if (!x[cOrd] || !x[cPlu]) continue;
      total++;
      var mine = (MY_NITS.indexOf(String(x[cNit]).trim()) >= 0) || MY_NAME.test(String(x[cProv] || ''));
      if (!mine) continue;
      var key = x[cOrd] + '|' + x[cDep];
      var po = pos[key];
      if (!po) {
        po = pos[key] = { kind: 'exito', chain: 'Éxito', city: cityLabel(String(x[cDep] || '').replace(/^CEDI\s+/i, '')), oc: String(x[cOrd]), date: ymd(x[cFin]), poDate: '', lines: [], declared: null, totalOk: null };
        order.push(key);
      }
      var qty = num(x[cQty]), price = num(x[cCst]);
      po.lines.push({ sku: '', code: String(x[cPlu]), name: String(x[cDesc]).trim(), key: 'E:' + x[cPlu], unit: '', caja: '', emb: 0, cx: 0, qty: qty, price: price, warn: false });
    }
    var out = order.map(function (k) { return pos[k]; });
    out.total = total;
    return out;
  }

  function nameIndex(cat) {
    var idx = {};
    var map = (cat && cat.map) || {};
    Object.keys(map).forEach(function (code) {
      var e = map[code];
      if (e.n) idx[norm(e.n)] = code;
      if (e.a) idx[norm(e.a)] = code;
    });
    var al = (cat && cat.alias) || {};
    Object.keys(al).forEach(function (k) { idx[k] = al[k]; });
    return idx;
  }

  function resolveKey(l, idx) {
    if (l.sku) return l.sku;
    return idx[l.key] || ('N:' + l.key);
  }

  // Une todas las hojas en una tabla por producto con columnas por ciudad
  function consolidate(files, cat) {
    var cities = [];
    files.forEach(function (f) { if (f.city && cities.indexOf(f.city) < 0) cities.push(f.city); });
    var map = {}, order = [], idx = nameIndex(cat);
    files.forEach(function (f) {
      f.lines.forEach(function (l) {
        var k = resolveKey(l, idx);
        var canon = cat && cat.map && cat.map[k];
        var row = map[k];
        if (!row) {
          row = map[k] = {
            key: k, name: canon && canon.n ? canon.n : l.name, ara: canon && canon.a ? canon.a : (l.sku ? l.name : ''),
            unit: l.unit, caja: (canon && canon.c) || l.caja, emb: l.emb, by: {}, cx: 0, qty: 0, val: 0, warn: false
          };
          order.push(k);
        }
        if (!row.unit && l.unit) row.unit = l.unit;
        if (!row.caja && l.caja) row.caja = l.caja;
        if (!row.emb && l.emb) row.emb = l.emb;
        var city = f.city || '(sin ciudad)';
        if (cities.indexOf(city) < 0) cities.push(city);
        var cell = row.by[city] || (row.by[city] = { cx: 0, qty: 0 });
        cell.cx += l.cx; cell.qty += l.qty;
        row.cx += l.cx; row.qty += l.qty; row.val += (l.price || 0) * l.qty;
        if (l.warn) row.warn = true;
      });
    });
    var rows = order.map(function (k) { return map[k]; });
    rows.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    return { cities: cities, rows: rows };
  }

  function provOf(row, cat) {
    var e = cat && cat.map && cat.map[row.key];
    return e && e.p ? e.p : '';
  }

  function groupByProv(cons, cat) {
    var g = {};
    cons.rows.forEach(function (r) {
      var p = provOf(r, cat) || 'SIN ASIGNAR';
      (g[p] = g[p] || { name: p, rows: [], cx: 0 }).rows.push(r);
      g[p].cx += r.cx;
    });
    var list = Object.keys(g).map(function (k) { return g[k]; });
    list.sort(function (a, b) {
      if (a.name === 'SIN ASIGNAR') return 1;
      if (b.name === 'SIN ASIGNAR') return -1;
      return b.cx - a.cx;
    });
    return list;
  }

  function fmt(n) {
    var r = Math.round(n * 100) / 100;
    return String(r).replace('.', ',');
  }

  function mailText(group, cities, date, email) {
    var out = [];
    out.push('Asunto: Pedido para entrega ' + (date || '') + ' - ' + group.name);
    if (email) out.push('Para: ' + email);
    out.push('');
    out.push('Hola ' + group.name + ',');
    out.push('');
    out.push('Este es el pedido para entrega ' + (date || '') + ':');
    out.push('');
    group.rows.forEach(function (r) {
      var parts = cities.filter(function (c) { return r.by[c] && r.by[c].cx; })
        .map(function (c) { return c + ' ' + fmt(r.by[c].cx); }).join(', ');
      out.push('- ' + r.name + ': ' + fmt(r.cx) + ' cajas (' + fmt(r.qty) + ' ' + (r.unit || 'und') + ')' + (parts ? ' | ' + parts : ''));
    });
    out.push('');
    out.push('Total: ' + fmt(group.cx) + ' cajas.');
    out.push('');
    out.push('Por favor confirmar disponibilidad. Gracias.');
    return out.join('\n');
  }


  function cityParts(r, cities) {
    return cities.filter(function (c) { return r.by[c] && r.by[c].cx; }).map(function (c) { return cityShort(c) + ' ' + fmt(r.by[c].cx); }).join(' · ');
  }
  function cityShort(c) { c = String(c || ''); return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase().slice(0, 5); }

  // Mensaje corto, pensado para WhatsApp: una línea por producto.
  function waText(group, cities, date) {
    var o = ['*Pedido para ' + group.name + '*', 'Entrega: ' + (date || ''), ''];
    group.rows.forEach(function (r) {
      o.push('• ' + r.name + ': *' + fmt(r.cx) + ' CX*' + (r.caja ? ' ' + r.caja.toLowerCase() : '') + ' (' + fmt(r.qty) + ' ' + (r.unit || 'und') + ')' + (cities.length > 1 ? '  [' + cityParts(r, cities) + ']' : ''));
    });
    o.push('', 'Total: *' + fmt(group.cx) + ' cajas*', 'Por favor confirmar. Gracias.');
    return o.join('\n');
  }

  // Resumen del día para quien hace los pedidos.
  function daySummary(files, groups, date) {
    var o = ['*RESUMEN PARA PEDIR — ' + (date || '') + '*', ''];
    o.push('Órdenes recibidas:');
    files.forEach(function (f) {
      var cx = 0; f.lines.forEach(function (l) { cx += l.cx; });
      o.push('• ' + (f.city || 'Sin ciudad') + (f.oc ? ' (OC ' + f.oc + ')' : '') + ' — entrega ' + (f.date || '—') + ' — ' + f.lines.length + ' productos, ' + fmt(cx) + ' CX');
    });
    o.push('', 'A quién pedir:');
    var un = null;
    groups.forEach(function (g) {
      if (g.name === 'SIN ASIGNAR') { un = g; return; }
      o.push('☐ ' + g.name + ' — ' + fmt(g.cx) + ' CX (' + g.rows.length + ' productos)');
    });
    if (un) {
      o.push('', '⚠ SIN PROVEEDOR (' + fmt(un.cx) + ' CX):');
      un.rows.forEach(function (r) { o.push('   - ' + r.name + ': ' + fmt(r.cx) + ' CX'); });
    }
    return o.join('\n');
  }

  function aoaProvider(group, cities, date) {
    var head = ['Producto', 'Unidad', 'Caja', 'Und/caja'];
    cities.forEach(function (c) { head.push(c + ' CX', c + ' Cant.'); });
    head.push('Total CX', 'Total cant.');
    var aoa = [['Pedido a ' + group.name], ['Entrega', date || ''], [], head];
    group.rows.forEach(function (r) {
      var line = [r.name, r.unit, r.caja, r.emb || ''];
      cities.forEach(function (c) { var b = r.by[c]; line.push(b && b.cx ? b.cx : '', b && b.qty ? b.qty : ''); });
      line.push(r.cx, r.qty);
      aoa.push(line);
    });
    var tot = ['TOTAL CX', '', '', ''];
    cities.forEach(function (c) {
      var s = 0; group.rows.forEach(function (r) { s += (r.by[c] ? r.by[c].cx : 0); });
      tot.push(s || '', '');
    });
    tot.push(group.cx, '');
    aoa.push(tot);
    return aoa;
  }

  function aoaConsolidated(cons, cat, date) {
    var head = ['Producto', 'Unidad', 'Caja', 'Und/caja', 'Proveedor'];
    cons.cities.forEach(function (c) { head.push(c + ' CX', c + ' Cant.'); });
    head.push('Total CX', 'Total cant.');
    var aoa = [['Consolidado de pedidos'], ['Entrega', date || ''], [], head];
    cons.rows.forEach(function (r) {
      var line = [r.name, r.unit, r.caja, r.emb || '', provOf(r, cat) || 'SIN ASIGNAR'];
      cons.cities.forEach(function (c) { var b = r.by[c]; line.push(b && b.cx ? b.cx : '', b && b.qty ? b.qty : ''); });
      line.push(r.cx, r.qty);
      aoa.push(line);
    });
    return aoa;
  }

  root.Logic = {
    norm: norm, num: num, presentation: presentation, cityLabel: cityLabel, parseDirect: parseDirect, sheetToText: sheetToText,
    fromAI: fromAI, consolidate: consolidate, groupByProv: groupByProv, provOf: provOf,
    textFromItems: textFromItems, parsePdfText: parsePdfText, nameIndex: nameIndex, addDays: addDays,
    parseExito: parseExito, mailText: mailText, waText: waText, daySummary: daySummary, cityShort: cityShort, cityParts: cityParts, aoaProvider: aoaProvider, aoaConsolidated: aoaConsolidated, fmt: fmt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Logic;
})(typeof window !== 'undefined' ? window : globalThis);
