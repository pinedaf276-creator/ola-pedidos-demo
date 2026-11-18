/* Datos de EJEMPLO para la demo (no son pedidos reales). Fechas relativas a hoy para que el calendario siempre tenga movimiento. */
(function () {
  var seed = 11; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  var PRODS = [
    ['000045292', 'PAPA SIN LAVAR X 500 G', 'KG', 12], ['000045300', 'TOMATE CHONTO X 500 G', 'KG', 15], ['000045283', 'MANGO X 500 G', 'KG', 5],
    ['000045302', 'ZANAHORIA PAQUETE X 1000 G', 'UD', 12], ['000045288', 'PAPA PASTUSA GRUESA BOLSA X 2500 G', 'UD', 8],
    ['000052185', 'MORA/FRESA CONGELADA SOLEI X500G', 'UD', 24], ['000045296', 'PIÑA ORO MIEL 500 G', 'KG', 11], ['000045299', 'SANDIA BABY X 500 G', 'KG', 10]
  ];
  var EXITO = ['Papa Criolla Granel', 'Tomate Chonto Granel', 'Cebolla Cabezona Blanca', 'Zanahoria Granel'];
  var CITIES = ['Barranquilla', 'Cartagena', 'Montería', 'Valledupar', 'Cúcuta', 'Medellín'];
  var PROVS = ['PROVEEDOR A', 'PROVEEDOR B', 'PROVEEDOR C'];
  function dd(d) { return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear(); }
  var today = new Date(); today.setHours(12, 0, 0, 0);
  var orders = {}, disp = {}, n = 0;
  for (var off = -14; off <= 4; off++) {
    var dt = new Date(today.getTime() + off * 86400000), date = dd(dt), pool = CITIES.slice(), k;
    for (var j = 0; j < 2; j++) {
      var city = pool.splice(ri(0, pool.length - 1), 1)[0], oc = String(4500000000 + (++n) * 7), lines = [], ps = PRODS.slice();
      for (var q = ri(2, 5); q > 0; q--) {
        var p = ps.splice(ri(0, ps.length - 1), 1)[0], cx = ri(5, 120);
        lines.push({ caja: '', cx: cx, emb: p[3], key: p[0], name: p[1], price: ri(2500, 12000), qty: cx * p[3] * (p[2] === 'KG' ? 0.5 : 1), sku: p[0], unit: p[2] });
      }
      k = oc + '|' + city;
      orders[k] = { chain: 'Ara', city: city, date: date, id: k, lines: lines, name: oc + '.PDF', oc: oc, savedAt: new Date(dt.getTime() - 3 * 86400000).toISOString(), source: 'PDF', totalOk: true, declared: 1000000, unread: 0 };
      if (off < 0 || (off === 0 && j === 0)) disp['Ara|' + oc] = { by: 'Bodega demo', at: new Date(dt.getTime() - 3600000).toISOString() };
    }
    oc = String(6300000 + (++n)); k = oc + '|Barranquilla';
    var el = EXITO.slice(0, ri(2, 4)).map(function (nm, i) { return { caja: '', cx: 0, emb: 0, key: 'E:' + (1100 + i), name: nm, price: ri(2500, 9000), qty: ri(150, 2500), sku: '', unit: '' }; });
    orders[k] = { chain: 'Éxito', city: 'Barranquilla', date: date, id: k, lines: el, name: oc + '.xlsb', oc: oc, savedAt: new Date(dt.getTime() - 2 * 86400000).toISOString(), source: 'XLSB', totalOk: true, unread: 0 };
    if (off < 0) disp['Éxito|' + oc] = { by: 'Bodega demo', at: new Date(dt.getTime() - 7200000).toISOString() };
  }
  // dos recibos de ejemplo: uno completo y uno con faltante, para mostrar Pedido -> Despachado -> Recibido
  var rec = {}, past = Object.keys(orders).map(function (x) { return orders[x]; }).filter(function (o) { return o.chain === 'Ara' && o.date !== dd(today); }).slice(0, 2);
  past.forEach(function (o, i) {
    var lines = o.lines.map(function (l, j) { var short = i === 1 && j === 0, r2 = short ? Math.round(l.qty * 0.8) : l.qty, r1 = short ? Math.round(l.cx * 0.8) : l.cx; return { code: l.sku, name: l.name, umd: 'CX', adm: l.cx, rec: r1, adm2: l.qty, rec2: r2, u2: l.unit }; });
    var id = o.oc + '_1_G' + (1000 + i) + '_ABC12' + i;
    rec[id] = { id: id, oc: o.oc, entrega: '1', guia: 'G' + (1000 + i), matricula: 'ABC12' + i, fecha: o.date, local: 'CD ' + o.city, destino: o.city, nota: '', tot: {}, lines: lines, env: [], at: new Date(today.getTime() - (5 - i) * 86400000).toISOString(), by: 'Demo' };
  });
  var map = {};
  PRODS.forEach(function (p, i) { map[p[0]] = { a: p[1], n: p[1], p: PROVS[i % 3], c: p[2] === 'KG' ? 'MEDIANA' : 'MINI' }; });
  window.OLA_DEMO_DATA = { hist: { orders: orders, seen: {}, boxes: {}, status: {}, picked: {}, disp: disp, costs: {}, users: {}, ver: 3 }, cat: { map: map, alias: {}, provs: {} }, rec: rec };
})();
