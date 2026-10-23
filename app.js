// APP DEL CELULAR DE GINA
//
// Lee lo que sube la compu del local (gina_docs) y lo muestra: el dia, los
// productos con fotos y stock, las cuentas corrientes y los condicionales.
// Lo unico que escribe es la "cola": un producto nuevo con sus fotos, que la
// compu levanta sola y lo da de alta. Asi el local sigue siendo el dueño de
// los datos y nunca hay dos lugares editando lo mismo.
//
// Sin señal muestra lo ultimo que bajo (queda guardado en el telefono).

;(function () {
  'use strict'
  const N = window.NUBE
  const raiz = document.getElementById('app')
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const $ = (c) => { const s = Dinero.formatoPesos(c || 0); return s.endsWith(',00') ? s.slice(0, -3) : s }
  const num = (n) => Number(n || 0).toLocaleString('es-AR')
  const iniciales = (s) => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const fecha = (f, hora) => { if (!f) return '—'; const d = new Date(f.length === 10 ? f + 'T12:00:00' : f); return d.getDate() + ' ' + MESES[d.getMonth()] + (hora ? ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '') }
  const hace = (f) => { if (!f) return 'nunca'; const m = Math.round((Date.now() - new Date(f)) / 60000); return m < 1 ? 'recién' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : fecha(f) }
  const guardar = (k, v) => { try { localStorage.setItem('gina.' + k, JSON.stringify(v)) } catch (e) { /* sin lugar */ } }
  const leer = (k) => { try { return JSON.parse(localStorage.getItem('gina.' + k)) } catch (e) { return null } }

  const P = {
    hoy: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    productos: '<path d="M8 3 4 6v4h3v11h10V10h3V6l-4-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3Z"/>',
    cargar: '<path d="M12 5v14M5 12h14"/>',
    cuentas: '<path d="M5 3h11a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z"/><path d="M8 8h6M8 12h6M8 16h3"/>',
    condicional: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    camara: '<path d="M4 8h3l2-3h6l2 3h3v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/>',
    wa: '<path d="M4 20l1.5-4A8 8 0 1 1 9 19.5L4 20Z"/>',
    salir: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'
  }
  const ico = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (P[n] || '') + '</svg>'

  function aviso (t, tipo) {
    const el = document.createElement('div')
    el.className = 'aviso ' + (tipo || '')
    el.textContent = t
    document.getElementById('avisos').appendChild(el)
    setTimeout(() => el.remove(), tipo === 'error' ? 5000 : 3000)
  }

  // --- sesion y pedidos a la nube -------------------------------------------

  let sesion = leer('sesion')

  async function pedir (metodo, ruta, { cuerpo, tipo, crudo, cabeceras, reintento } = {}) {
    if (sesion && sesion.vence < Date.now() + 60000 && ruta.indexOf('/auth/') !== 0) await renovar()
    const h = Object.assign({ apikey: N.clave }, cabeceras || {})
    if (sesion && ruta.indexOf('/auth/') !== 0) h.Authorization = 'Bearer ' + sesion.token
    if (cuerpo !== undefined && !crudo) h['Content-Type'] = 'application/json'
    if (tipo) h['Content-Type'] = tipo
    const r = await fetch(N.url + ruta, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : crudo ? cuerpo : JSON.stringify(cuerpo) })
    if (r.status === 401 && !reintento && sesion) { await renovar(true); return pedir(metodo, ruta, { cuerpo, tipo, crudo, cabeceras, reintento: true }) }
    if (!r.ok) { const e = new Error((await r.text().catch(() => '')).slice(0, 200) || ('Error ' + r.status)); e.status = r.status; throw e }
    return r
  }

  async function entrar (email, password) {
    const r = await pedir('POST', '/auth/v1/token?grant_type=password', { cuerpo: { email, password } })
    const d = await r.json()
    sesion = { token: d.access_token, refresh: d.refresh_token, vence: Date.now() + d.expires_in * 1000, email }
    guardar('sesion', sesion)
  }

  async function renovar () {
    try {
      const d = await (await fetch(N.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: N.clave, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: sesion.refresh }) })).json()
      if (!d.access_token) throw new Error('vencida')
      sesion = Object.assign(sesion, { token: d.access_token, refresh: d.refresh_token, vence: Date.now() + d.expires_in * 1000 })
      guardar('sesion', sesion)
    } catch (e) { salir(); throw new Error('Volvé a entrar con tu usuario.') }
  }

  function salir () { sesion = null; guardar('sesion', null); login() }

  // --- datos ----------------------------------------------------------------

  let D = leer('docs') || {}
  // Productos editados en el celular que la compu todavia no aplico.
  const pendientes = {}
  let bajado = leer('bajado')
  async function bajar () {
    const filas = await (await pedir('GET', '/rest/v1/gina_docs?select=clave,datos,actualizado')).json()
    D = {}
    // Las listas (ventas) quedan como lista: la fecha va en una propiedad aparte.
    for (const f of filas) D[f.clave] = Array.isArray(f.datos) ? Object.assign(f.datos.slice(), { _actualizado: f.actualizado }) : Object.assign({ _actualizado: f.actualizado }, f.datos)
    bajado = new Date().toISOString()
    guardar('docs', D)
    guardar('bajado', bajado)
  }

  // Las fotos son privadas: se bajan con el usuario y quedan en memoria.
  const fotos = {}
  function cargarFotos (cont) {
    cont.querySelectorAll('[data-foto]').forEach(async (el) => {
      const id = el.dataset.foto
      try {
        if (!fotos[id]) fotos[id] = pedir('GET', '/storage/v1/object/authenticated/fotos/' + id + '.jpg').then((r) => r.blob()).then((b) => URL.createObjectURL(b))
        el.style.backgroundImage = 'url(' + await fotos[id] + ')'
        el.textContent = ''
      } catch (e) { /* queda la inicial */ }
    })
  }

  // --- armazon ----------------------------------------------------------------

  const TABS = [['hoy', 'Hoy'], ['productos', 'Productos'], ['cargar', 'Cargar'], ['cuentas', 'Cuentas'], ['condicional', 'Condic.']]
  const TITULOS = { hoy: 'Hoy', productos: 'Productos', cargar: 'Cargar producto', cuentas: 'Cuentas corrientes', condicional: 'Condicionales' }

  function armazon (ruta) {
    const actualizado = D.resumen && D.resumen._actualizado
    raiz.innerHTML = '<header class="cab"><img src="logo.png" alt=""><h1>' + TITULOS[ruta] + '</h1><div class="estado" id="estado">' + (actualizado ? 'Datos de la compu<br>' + esc(hace(actualizado)) : '') + '</div></header><main class="contenido" id="cont"></main>' +
      '<nav class="tabbar">' + TABS.map(([k, n]) => '<a href="#/' + k + '" class="' + (k === ruta ? 'activo ' : '') + (k === 'cargar' ? 'cargar' : '') + '">' + ico(k) + '<span>' + n + '</span></a>').join('') + '</nav>'
  }

  async function ir () {
    if (!sesion) return login()
    const ruta = (location.hash.replace(/^#\//, '') || 'hoy').split('/')[0]
    const p = PANTALLAS[ruta] ? ruta : 'hoy'
    armazon(p)
    const cont = document.getElementById('cont')
    PANTALLAS[p](cont)
    if (p !== 'cargar') {
      try { await bajar(); if (location.hash.replace(/^#\//, '').split('/')[0] === ruta || !location.hash) { armazon(p); PANTALLAS[p](document.getElementById('cont')) } } catch (e) { const est = document.getElementById('estado'); if (est) est.innerHTML = 'Sin conexión<br>' + esc(bajado ? 'datos de ' + hace(bajado) : '') }
    }
  }

  function login () {
    raiz.innerHTML = '<div class="login"><div class="card"><img src="logo.png" alt=""><div class="campo"><span>Email</span><input class="input" id="lEmail" type="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"></div><div class="campo"><span>Contraseña</span><div style="position:relative"><input class="input" id="lPass" type="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" style="padding-right:56px"><button type="button" id="lVer" style="position:absolute;right:6px;top:6px;height:34px;border:0;background:transparent;font-size:13px;color:var(--muted)">Ver</button></div></div><button class="btn primario bloque" id="lOk">Entrar</button><p class="mini muted" style="text-align:center;margin-top:14px">Para ver la tienda desde el celular. Los datos los sube la compu del local.</p></div></div>'
    const ok = async () => {
      const b = raiz.querySelector('#lOk')
      b.disabled = true; b.textContent = 'Entrando…'
      try { await entrar(raiz.querySelector('#lEmail').value.trim().toLowerCase(), raiz.querySelector('#lPass').value); location.hash = '#/hoy'; ir() } catch (e) { aviso(e.status === 400 ? (/confirm/i.test(e.message) ? 'Falta confirmar el email de este usuario.' : 'Email o contraseña incorrectos. Tocá "Ver" para revisar lo que escribiste (mayúsculas incluidas).') : 'No se pudo entrar. ¿Hay señal?', 'error'); b.disabled = false; b.textContent = 'Entrar' }
    }
    raiz.querySelector('#lVer').addEventListener('click', () => { const p = raiz.querySelector('#lPass'); const ver = p.type === 'password'; p.type = ver ? 'text' : 'password'; raiz.querySelector('#lVer').textContent = ver ? 'Ocultar' : 'Ver' })
    raiz.querySelector('#lOk').addEventListener('click', ok)
    raiz.querySelector('#lPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok() })
  }

  function hoja (html) {
    const v = document.createElement('div')
    v.className = 'velo'
    v.innerHTML = '<div class="hoja"><div class="asa"></div>' + html + '</div>'
    v.addEventListener('click', (e) => { if (e.target === v) v.remove() })
    document.body.appendChild(v)
    return v
  }

  const sinDatos = '<div class="vacio">Todavía no llegaron datos de la compu del local. Fijate que el programa esté abierto y conectado a la nube (Configuración → Nube).</div>'

  function whatsapp (tel, texto) {
    let t = String(tel || '').replace(/\D/g, '')
    if (t.length === 10) t = '549' + t
    location.href = 'https://wa.me/' + t + '?text=' + encodeURIComponent(texto)
  }

  // --- pantallas --------------------------------------------------------------

  const PANTALLAS = {
    hoy (cont) {
      const r = D.resumen
      if (!r) { cont.innerHTML = sinDatos; return }
      const t = r.tablero
      const hoy = t.hoy
      const serie = t.serie.slice(-14)
      const max = Math.max(1, ...serie.map((d) => d.ingresos))
      cont.innerHTML = '<div class="kpis"><div class="card kpi grande"><div class="t">Vendido hoy</div><div class="v num">' + $(hoy.ingresos) + '</div><div class="mini" style="color:#d9c7b6">' + num(hoy.ventas) + ' ventas · ' + num(hoy.unidades) + ' prendas</div></div>' +
        '<div class="card kpi"><div class="t">Ticket promedio hoy</div><div class="v num">' + $(hoy.ticket) + '</div></div>' +
        '<div class="card kpi"><div class="t">Caja</div><div class="v" style="font-size:17px">' + (r.caja ? '● Abierta' : 'Cerrada') + '</div><div class="mini muted">' + (r.caja ? esc(r.caja.responsable || '') + (r.caja.esperado != null ? ' · efectivo ' + $(r.caja.esperado) : '') : '') + '</div></div>' +
        '<div class="card kpi"><div class="t">Últimos 30 días</div><div class="v num" style="font-size:18px">' + $(t.actual.ingresos) + '</div></div>' +
        '<div class="card kpi"><div class="t">Ganancia 30 días</div><div class="v num" style="font-size:18px">' + $(t.actual.ganancia) + '</div><div class="mini muted">margen ' + String(t.actual.margen).replace('.', ',') + '%</div></div></div>' +
        '<h2>Ventas de las últimas 2 semanas</h2><div class="card"><div class="barras">' + serie.map((d) => '<i style="height:' + Math.max(2, (d.ingresos / max) * 100) + '%" title="' + esc(fecha(d.dia) + ' ' + $(d.ingresos)) + '"></i>').join('') + '</div><div class="entre mini muted" style="padding:0 14px 10px"><span>' + esc(fecha(serie[0].dia)) + '</span><span>hoy</span></div></div>' +
        '<h2>Lo que más se vende</h2><div class="card lista">' + t.destacados.map((p) => '<div><div class="crece"><div class="nombre">' + esc(p.nombre) + '</div><div class="mini muted">' + num(p.unidades) + ' vendidos</div></div><b class="num">' + $(p.ingresos) + '</b></div>').join('') + '</div>' +
        '<h2>Últimas ventas</h2><div class="card lista">' + (D.ventas || []).slice(0, 15).map((v) => '<div><div class="avatar">' + esc(iniciales(v.cliente || 'CF')) + '</div><div class="crece"><div class="nombre">' + esc(v.cliente || 'Consumidor final') + '</div><div class="mini muted">#' + v.numero + ' · ' + esc(fecha(v.fecha, true)) + ' · ' + esc(v.medios) + '</div></div><b class="num">' + $(v.total) + '</b></div>').join('') + '</div>' +
        (t.alertas.length ? '<h2>Para reponer</h2><div class="card lista">' + t.alertas.map((v) => '<div><div class="crece"><div class="nombre">' + esc(v.nombre) + '</div><div class="mini muted">' + esc(v.color + ' · ' + v.talle) + '</div></div><span class="badge ' + (v.stock <= 0 ? 'bad' : 'warn') + '">' + (v.stock <= 0 ? 'Sin stock' : 'Quedan ' + v.stock) + '</span></div>').join('') + '</div>' : '') +
        '<button class="btn bloque mt" id="salir" style="margin-top:24px">' + ico('salir') + 'Salir</button>'
      cont.querySelector('#salir').addEventListener('click', salir)
    },

    productos (cont) {
      if (!D.productos) { cont.innerHTML = sinDatos; return }
      let rubro = ''
      let texto = ''
      cont.innerHTML = '<input class="input" id="pBuscar" placeholder="Buscar producto…"><div class="chips mt" id="pRubro">' + [['', 'Todo'], ['ropa', 'Ropa'], ['joyeria', 'Joyería'], ['marroquineria', 'Marroquinería'], ['bajo', 'Poco stock']].map(([k, n]) => '<button class="chip' + (k === rubro ? ' activo' : '') + '" data-r="' + k + '">' + n + '</button>').join('') + '</div><div class="grilla mt" id="pGrilla"></div>'
      const dibujar = () => {
        const f = texto.toLowerCase()
        const lista = D.productos.filter((p) => (!rubro || (rubro === 'bajo' ? p.stock <= 3 : p.rubro === rubro)) && (!f || (p.nombre + ' ' + p.categoria + ' ' + p.marca).toLowerCase().includes(f))).slice(0, 120)
        const g = cont.querySelector('#pGrilla')
        g.innerHTML = lista.length ? lista.map((p) => '<button class="card prod" data-id="' + esc(p.id) + '"><div class="img"' + (p.fotos[0] ? ' data-foto="' + esc(p.fotos[0]) + '"' : '') + '>' + esc(iniciales(p.nombre)) + '</div><div class="info"><div class="nombre">' + esc(p.nombre) + '</div><div class="entre"><b class="num">' + $(p.precio) + '</b><span class="mini ' + (p.stock <= 3 ? 'stock-bajo' : 'muted') + '">' + num(p.stock) + ' u.</span></div></div></button>').join('') : '<div class="vacio" style="grid-column:1/-1">No hay productos con esa búsqueda.</div>'
        g.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => detalle(D.productos.find((p) => p.id === b.dataset.id))))
        cargarFotos(g)
      }
      cont.querySelector('#pBuscar').addEventListener('input', (e) => { texto = e.target.value; dibujar() })
      cont.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { rubro = b.dataset.r; cont.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('activo', x === b)); dibujar() }))
      dibujar()
      function detalle (p) {
        const talles = [...new Set(p.variantes.map((v) => v.talle))]
        const colores = [...new Set(p.variantes.map((v) => v.color))]
        const v = hoja('<div class="fotos" style="flex-wrap:nowrap;overflow-x:auto;margin-bottom:12px">' + p.fotos.map((f) => '<div class="f" data-foto="' + esc(f) + '" style="width:150px;height:190px;flex:none"></div>').join('') + '</div><h3 style="margin:0 0 2px">' + esc(p.nombre) + '</h3><div class="muted mini">' + esc([p.categoria, p.marca, p.metal && D.listas && D.listas.metales[p.metal], p.gramos && String(p.gramos).replace('.', ',') + ' g'].filter(Boolean).join(' · ')) + '</div>' +
          '<div class="entre mt"><b style="font-size:22px" class="num">' + $(p.precio) + '</b>' + (p.costo != null ? '<span class="mini muted">costo ' + $(p.costo) + '</span>' : '') + '</div>' +
          '<button class="btn primario bloque mt" id="pEditar">Editar producto, fotos y stock</button>' + (pendientes[p.id] ? '<p class="mini muted">Hay cambios enviados que la compu todavía no aplicó.</p>' : '') +
          '<h2>Stock por ' + (p.rubro === 'joyeria' ? 'medida' : 'talle') + '</h2><table class="t"><tr><th></th>' + talles.map((t) => '<th>' + esc(t) + '</th>').join('') + '</tr>' + colores.map((c) => '<tr><td>' + esc(c) + '</td>' + talles.map((t) => { const x = p.variantes.find((y) => y.talle === t && y.color === c); return '<td class="num' + (x && x.stock <= x.minimo ? ' stock-bajo' : '') + '">' + (x ? x.stock : '') + '</td>' }).join('') + '</tr>').join('') + '</table>')
        cargarFotos(v)
        v.querySelector('#pEditar').addEventListener('click', () => { v.remove(); editar(p) })
      }

      // EDITAR DESDE EL CELULAR: viaja por la cola y la compu lo aplica.
      function editar (p) {
        const fotos = p.fotos.map((id) => ({ id }))
        const v = hoja('<h3 style="margin:0 0 12px">Editar producto</h3>' +
          '<div class="campo"><span>Fotos</span><div class="fotos" id="eFotos"></div></div>' +
          '<div class="campo"><span>Nombre</span><input class="input" id="eNombre" value="' + esc(p.nombre) + '"></div>' +
          '<div class="dos"><div class="campo"><span>Costo (opcional)</span><input class="input" id="eCosto" inputmode="decimal" value="' + (p.costo ? p.costo / 100 : '') + '"></div><div class="campo"><span>Ganancia %</span><input class="input" id="ePct" inputmode="decimal" value="' + (p.costo > 0 ? Math.round(((p.precio / p.costo) - 1) * 100) : '') + '"></div></div>' +
          '<div class="campo"><span>Precio de venta</span><input class="input" id="ePrecio" inputmode="decimal" value="' + p.precio / 100 + '"></div>' +
          '<h2>Stock (lo que hay contado)</h2><div class="card lista">' + p.variantes.map((x) => '<div><div class="crece"><div class="nombre">' + esc(x.color + ' · ' + (x.talle === 'U' ? 'Único' : x.talle)) + '</div><div class="mini muted">' + esc(x.codigoBarras || '') + '</div></div><input class="input" type="number" inputmode="numeric" min="0" data-v="' + esc(x.id) + '" value="' + x.stock + '" style="width:84px"></div>').join('') + '</div>' +
          '<button class="btn primario bloque mt" id="eOk">Guardar cambios</button><p class="mini muted">Se aplican en la compu del local en un minuto.</p>')
        const $e = (s) => v.querySelector(s)
        const dibujarFotos = () => {
          const caja = $e('#eFotos')
          caja.innerHTML = fotos.map((x, i) => '<div class="f"' + (x.id && !x.blob ? ' data-foto="' + esc(x.id) + '"' : '') + ' style="' + (x.url ? 'background-image:url(' + x.url + ')' : '') + '"><button data-q="' + i + '">✕</button></div>').join('') +
            (fotos.length < 6 ? '<label class="agregar">' + ico('camara') + 'Sacar o elegir<input type="file" accept="image/*" capture="environment" multiple class="oculto" id="eArchivo"></label>' : '')
          cargarFotos(caja)
          caja.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { fotos.splice(Number(b.dataset.q), 1); dibujarFotos() }))
          const inp = caja.querySelector('#eArchivo')
          if (inp) inp.addEventListener('change', async () => { for (const a of [...inp.files].slice(0, 6 - fotos.length)) { try { const blob = await achicar(a); fotos.push({ blob, url: URL.createObjectURL(blob) }) } catch (e) { aviso(e.message, 'error') } } dibujarFotos() })
        }
        const desdeCosto = () => { const c = Dinero.aCentavos($e('#eCosto').value); const pct = Number(String($e('#ePct').value).replace(',', '.')); if (c > 0 && $e('#ePct').value !== '' && pct >= 0) $e('#ePrecio').value = Math.ceil(c * (1 + pct / 100) / 10000) * 100 }
        const desdePrecio = () => { const c = Dinero.aCentavos($e('#eCosto').value); const pr = Dinero.aCentavos($e('#ePrecio').value); if (c > 0 && pr > 0) $e('#ePct').value = Math.round(((pr / c) - 1) * 100) }
        $e('#eCosto').addEventListener('input', desdeCosto)
        $e('#ePct').addEventListener('input', desdeCosto)
        $e('#ePrecio').addEventListener('input', desdePrecio)
        dibujarFotos()
        $e('#eOk').addEventListener('click', async () => {
          const b = $e('#eOk')
          const precio = Dinero.aCentavos($e('#ePrecio').value)
          if (!(precio > 0)) return aviso('Poné el precio de venta.', 'error')
          b.disabled = true
          try {
            const ids = []
            for (const [i, x] of fotos.entries()) {
              if (!x.blob) { ids.push(x.id); continue }
              b.textContent = 'Subiendo foto ' + (i + 1) + '…'
              const id = 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
              await pedir('POST', '/storage/v1/object/fotos/' + id + '.jpg', { cuerpo: x.blob, crudo: true, tipo: 'image/jpeg', cabeceras: { 'x-upsert': 'true' } })
              ids.push(id)
            }
            const stock = {}
            v.querySelectorAll('[data-v]').forEach((inp) => { stock[inp.dataset.v] = Math.max(0, Math.round(Number(inp.value) || 0)) })
            const datos = { id: p.id, nombre: $e('#eNombre').value.trim(), precio, costo: Dinero.aCentavos($e('#eCosto').value) || null, fotos: ids, stock }
            b.textContent = 'Enviando…'
            await pedir('POST', '/rest/v1/gina_cola', { cuerpo: { tipo: 'producto.editar', datos }, cabeceras: { Prefer: 'return=minimal' } })
            // Se ve el cambio ya en el telefono, hasta que la compu suba los datos nuevos.
            Object.assign(p, { nombre: datos.nombre || p.nombre, precio, costo: datos.costo || p.costo, fotos: ids })
            for (const x of p.variantes) if (x.id in stock) x.stock = stock[x.id]
            p.stock = p.variantes.reduce((s, x) => s + x.stock, 0)
            pendientes[p.id] = true
            guardar('docs', D)
            v.remove()
            aviso('Cambios enviados. Se aplican en la compu en un minuto.', 'ok')
            ir()
          } catch (e) { aviso('No se pudo enviar: ' + (e.message || 'sin señal'), 'error'); b.disabled = false; b.textContent = 'Guardar cambios' }
        })
      }
    },

    cuentas (cont) {
      const c = D.cuentas
      if (!c) { cont.innerHTML = sinDatos; return }
      cont.innerHTML = '<div class="kpis"><div class="card kpi"><div class="t">Te deben</div><div class="v num">' + $(c.totales.deuda) + '</div><div class="mini muted">' + num(c.totales.deudoras) + ' clientas</div></div><div class="card kpi"><div class="t">Vencido</div><div class="v num" style="color:' + (c.totales.vencido ? 'var(--bad)' : 'inherit') + '">' + $(c.totales.vencido) + '</div><div class="mini muted">' + num(c.totales.conVencido) + ' atrasadas</div></div></div>' +
        '<div class="card lista mt">' + (c.filas.length ? c.filas.map((x, i) => '<div data-i="' + i + '"><div class="avatar">' + esc(iniciales(x.nombre)) + '</div><div class="crece"><div class="nombre">' + esc(x.nombre) + '</div><div class="mini muted">desde ' + esc(fecha(x.desde)) + ' · último pago ' + esc(hace(x.ultimoPago)) + '</div></div><div style="text-align:right"><b class="num">' + $(x.deuda) + '</b>' + (x.vencido ? '<div><span class="badge bad">vencido ' + $(x.vencido) + '</span></div>' : '') + '</div></div>').join('') : '<div class="vacio">Nadie debe nada. ✓</div>') + '</div>'
      cont.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => {
        const x = c.filas[Number(el.dataset.i)]
        const texto = 'Hola ' + x.nombre.split(' ')[0] + '! Te paso el resumen de tu cuenta en ' + (D.listas ? D.listas.negocio : 'la tienda') + ':\n\n' + x.pendientes.map((p) => '• ' + fecha(p.fecha) + ' — ' + (p.nota || 'Compra') + ': ' + $(p.pendiente) + (p.vencida ? ' (vencida)' : ' (vence ' + fecha(p.vence) + ')')).join('\n') + '\n\nTotal: ' + $(x.deuda) + '. ¡Gracias!'
        const v = hoja('<h3 style="margin:0">' + esc(x.nombre) + '</h3><div class="muted mini">' + esc(x.telefono || 'sin celular') + '</div><div class="entre mt"><span>Debe</span><b class="num" style="font-size:22px">' + $(x.deuda) + '</b></div>' +
          '<h2>Deudas pendientes</h2><div class="card lista">' + x.pendientes.map((p) => '<div><div class="crece"><div class="nombre">' + esc(p.nota || 'Compra') + '</div><div class="mini muted">' + esc(fecha(p.fecha)) + '</div></div><div style="text-align:right"><b class="num">' + $(p.pendiente) + '</b><div>' + (p.vencida ? '<span class="badge bad">vencida ' + p.diasVencida + ' d</span>' : '<span class="badge">vence ' + esc(fecha(p.vence)) + '</span>') + '</div></div></div>').join('') + '</div>' +
          (x.telefono ? '<button class="btn wa bloque mt" id="wa">' + ico('wa') + 'Mandarle el resumen por WhatsApp</button>' : '') + '<p class="mini muted">Los pagos se cargan en la compu del local (Cuentas corrientes).</p>')
        const b = v.querySelector('#wa')
        if (b) b.addEventListener('click', () => whatsapp(x.telefono, texto))
      }))
    },

    condicional (cont) {
      const c = D.condicionales
      if (!c) { cont.innerHTML = sinDatos; return }
      const abiertos = c.filas.filter((x) => x.estado === 'abierto')
      cont.innerHTML = '<div class="kpis"><div class="card kpi"><div class="t">Ropa afuera</div><div class="v num">' + num(c.totales.prendas) + ' prendas</div><div class="mini muted">' + $(c.totales.valor) + '</div></div><div class="card kpi"><div class="t">Vencidos</div><div class="v num" style="color:' + (c.totales.vencidos ? 'var(--bad)' : 'inherit') + '">' + num(c.totales.vencidos) + '</div><div class="mini muted">de ' + num(c.totales.abiertos) + ' abiertos</div></div></div>' +
        '<div class="card lista mt">' + (abiertos.length ? abiertos.map((x, i) => '<div data-i="' + i + '"><div class="avatar">' + esc(iniciales(x.cliente)) + '</div><div class="crece"><div class="nombre">' + esc(x.cliente) + '</div><div class="mini muted">C' + x.numero + ' · ' + num(x.prendas) + ' prendas · ' + esc(x.telefono) + '</div></div>' + (x.vencido ? '<span class="badge bad">Vencido</span>' : '<span class="badge">' + esc(fecha(x.vence)) + '</span>') + '</div>').join('') : '<div class="vacio">No hay ropa afuera.</div>') + '</div>'
      cont.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => {
        const x = abiertos[Number(el.dataset.i)]
        const texto = 'Hola ' + x.cliente.split(' ')[0] + '! Te escribo de ' + (D.listas ? D.listas.negocio : 'la tienda') + ' por las prendas que te llevaste a probar el ' + fecha(x.fecha) + ':\n' + x.items.map((i) => '• ' + i.nombre + ' ' + i.color + ' talle ' + i.talle).join('\n') + '\n\n¿Te las quedás o las traés? ¡Gracias!'
        const v = hoja('<h3 style="margin:0">Condicional C' + x.numero + '</h3><div class="muted mini">' + esc(x.cliente) + ' · 📱 ' + esc(x.telefono) + '</div><div class="mini muted">Se lo llevó el ' + esc(fecha(x.fecha, true)) + ' · vuelve el ' + esc(fecha(x.vence)) + '</div><div class="card lista mt">' +
          x.items.map((i) => '<div><div class="img" ' + (i.foto ? 'data-foto="' + esc(i.foto) + '"' : '') + ' style="width:48px;height:48px;border-radius:10px;background:var(--oro-soft) center/cover"></div><div class="crece"><div class="nombre">' + esc(i.nombre) + '</div><div class="mini muted">' + esc(i.color + ' · ' + i.talle) + '</div></div><b class="num">' + $(i.precio * i.cantidad) + '</b></div>').join('') + '</div>' +
          (x.telefono ? '<button class="btn wa bloque mt" id="wa">' + ico('wa') + 'Escribirle por WhatsApp</button>' : ''))
        cargarFotos(v)
        const b = v.querySelector('#wa')
        if (b) b.addEventListener('click', () => whatsapp(x.telefono, texto))
      }))
    },

    cargar (cont) {
      const L = D.listas || { categorias: [], marcas: [], metales: {}, preciosMetal: {}, dolar: 0, multiplicador: 200 }
      const f = { rubro: 'ropa', fotos: [] }
      const dibujar = () => {
        const joya = f.rubro === 'joyeria'
        const marro = f.rubro === 'marroquineria'
        const cats = L.categorias.filter((c) => !c.rubro || c.rubro === f.rubro)
        cont.innerHTML = '<div class="seg" style="grid-template-columns:1fr 1fr 1fr"><button data-rubro="ropa" class="' + (f.rubro === 'ropa' ? 'activo' : '') + '">Ropa</button><button data-rubro="joyeria" class="' + (joya ? 'activo' : '') + '">Joyería</button><button data-rubro="marroquineria" class="' + (marro ? 'activo' : '') + '">Marroquinería</button></div>' +
          '<div class="campo"><span>Fotos</span><div class="fotos" id="cFotos"></div></div>' +
          '<div class="campo"><span>Nombre</span><input class="input" id="cNombre" placeholder="' + (joya ? 'Ej: Anillo solitario plata' : marro ? 'Ej: Cartera de cuero' : 'Ej: Vestido midi satinado') + '"></div>' +
          '<div class="dos"><div class="campo"><span>Categoría</span><input class="input" id="cCat" list="lCat" placeholder="Elegí o escribí"><datalist id="lCat">' + cats.map((c) => '<option value="' + esc(c.nombre) + '">').join('') + '</datalist></div><div class="campo"><span>Marca</span><input class="input" id="cMarca" list="lMarca"><datalist id="lMarca">' + L.marcas.map((c) => '<option value="' + esc(c.nombre) + '">').join('') + '</datalist></div></div>' +
          (joya ? '<div class="dos"><div class="campo"><span>Metal</span><select class="input" id="cMetal">' + Object.entries(L.metales).map(([k, n]) => '<option value="' + k + '">' + esc(n) + '</option>').join('') + '</select></div><div class="campo"><span>Gramos</span><input class="input" id="cGramos" inputmode="decimal" placeholder="3,5"></div></div><div class="calc" id="cCalc">Poné los gramos para calcular el costo.</div>' : '') +
          '<div class="dos"><div class="campo"><span>Costo (opcional)</span><input class="input" id="cCosto" inputmode="decimal"></div><div class="campo"><span>Ganancia %</span><input class="input" id="cPct" inputmode="decimal" placeholder="Ej: 100"></div></div>' +
          '<div class="campo"><span>Precio de venta</span><input class="input" id="cPrecio" inputmode="decimal"></div>' +
          '<div class="campo"><span>' + (joya ? 'Medidas (anillos: 12 14 16; si no tiene, dejalo vacío)' : marro ? 'Modelo o medida (si no tiene, dejalo vacío)' : 'Talles (separados por espacio)') + '</span><input class="input" id="cTalles" placeholder="' + (joya ? '12 14 16' : 'S M L') + '"></div>' +
          '<div class="campo"><span>' + (joya ? 'Terminación (separadas por coma)' : 'Colores (separados por coma)') + '</span><input class="input" id="cColores" placeholder="' + (joya ? 'Plata, Dorado' : 'Negro, Crudo') + '"></div>' +
          '<div class="campo"><span>Stock de cada combinación</span><input class="input" id="cStock" inputmode="numeric" value="1"></div>' +
          '<button class="btn primario bloque" id="cOk">Enviar a la compu del local</button><p class="mini muted">El producto aparece en el sistema del local en un minuto, con su código de barras listo para imprimir la etiqueta.</p>'
        cont.querySelectorAll('[data-rubro]').forEach((b) => b.addEventListener('click', () => { f.rubro = b.dataset.rubro; dibujar() }))
        dibujarFotos()
        if (joya) {
          const calc = () => {
            const g = Number(String(cont.querySelector('#cGramos').value).replace(',', '.')) || 0
            const usd = L.preciosMetal[cont.querySelector('#cMetal').value] || 0
            if (!g || !usd) { cont.querySelector('#cCalc').textContent = usd ? 'Poné los gramos para calcular el costo.' : 'Este metal no tiene precio por gramo: poné el costo a mano.'; return }
            const costo = Math.round((g * usd * L.dolar) / 100)
            const sugerido = Math.round((costo * L.multiplicador) / 10000) * 100
            cont.querySelector('#cCalc').innerHTML = String(g).replace('.', ',') + ' g × US$ ' + (usd / 100).toLocaleString('es-AR') + ' × dólar ' + $(L.dolar) + ' = <b>costo ' + $(costo) + '</b><br>Sugerido: <b>' + $(sugerido) + '</b> <button class="btn chico" id="cUsar">Usar</button>'
            cont.querySelector('#cUsar').addEventListener('click', () => { cont.querySelector('#cPrecio').value = sugerido / 100 })
          }
          cont.querySelector('#cGramos').addEventListener('input', calc)
          cont.querySelector('#cMetal').addEventListener('change', calc)
        }
        const desdeCosto = () => { const c = Dinero.aCentavos(cont.querySelector('#cCosto').value); const pct = Number(String(cont.querySelector('#cPct').value).replace(',', '.')); if (c > 0 && cont.querySelector('#cPct').value !== '' && pct >= 0) cont.querySelector('#cPrecio').value = Math.ceil(c * (1 + pct / 100) / 10000) * 100 }
        cont.querySelector('#cCosto').addEventListener('input', desdeCosto)
        cont.querySelector('#cPct').addEventListener('input', desdeCosto)
        cont.querySelector('#cOk').addEventListener('click', enviar)
      }
      function dibujarFotos () {
        const caja = cont.querySelector('#cFotos')
        caja.innerHTML = f.fotos.map((x, i) => '<div class="f" style="background-image:url(' + x.url + ')"><button data-q="' + i + '">✕</button></div>').join('') +
          (f.fotos.length < 6 ? '<label class="agregar">' + ico('camara') + 'Sacar o elegir<input type="file" accept="image/*" capture="environment" multiple class="oculto" id="cArchivo"></label>' : '')
        caja.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { f.fotos.splice(Number(b.dataset.q), 1); dibujarFotos() }))
        const inp = caja.querySelector('#cArchivo')
        if (inp) inp.addEventListener('change', async () => { for (const a of [...inp.files].slice(0, 6 - f.fotos.length)) { try { const blob = await achicar(a); f.fotos.push({ blob, url: URL.createObjectURL(blob) }) } catch (e) { aviso(e.message, 'error') } } dibujarFotos() })
      }
      async function enviar () {
        const val = (id) => cont.querySelector(id) ? cont.querySelector(id).value.trim() : ''
        const datos = {
          rubro: f.rubro, nombre: val('#cNombre'), categoria: val('#cCat'), marca: val('#cMarca'),
          precio: Dinero.aCentavos(val('#cPrecio')), costo: Dinero.aCentavos(val('#cCosto')),
          talles: val('#cTalles').split(/[\s,;]+/).map((x) => x.toUpperCase()).filter(Boolean),
          colores: val('#cColores').split(/[,;]+/).map((x) => x.trim()).filter(Boolean).map((x) => x[0].toUpperCase() + x.slice(1)),
          stock: Number(val('#cStock')) || 0,
          metal: f.rubro === 'joyeria' ? val('#cMetal') : null,
          gramos: f.rubro === 'joyeria' ? Number(val('#cGramos').replace(',', '.')) || null : null,
          fotos: []
        }
        if (!datos.nombre) return aviso('Poné el nombre.', 'error')
        if (!(datos.precio > 0)) return aviso('Poné el precio de venta.', 'error')
        const b = cont.querySelector('#cOk')
        b.disabled = true
        try {
          for (const [i, x] of f.fotos.entries()) {
            b.textContent = 'Subiendo foto ' + (i + 1) + ' de ' + f.fotos.length + '…'
            const id = 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
            await pedir('POST', '/storage/v1/object/fotos/' + id + '.jpg', { cuerpo: x.blob, crudo: true, tipo: 'image/jpeg', cabeceras: { 'x-upsert': 'true' } })
            datos.fotos.push(id)
          }
          b.textContent = 'Enviando…'
          await pedir('POST', '/rest/v1/gina_cola', { cuerpo: { tipo: 'producto', datos }, cabeceras: { Prefer: 'return=minimal' } })
          aviso('Enviado. Aparece en la compu del local en un minuto.', 'ok')
          f.fotos = []
          dibujar()
        } catch (e) { aviso('No se pudo enviar: ' + (e.message || 'sin señal'), 'error'); b.disabled = false; b.textContent = 'Enviar a la compu del local' }
      }
      dibujar()
    }
  }

  // La foto del telefono (5 MB) se achica a 1200 px antes de subirla.
  function achicar (archivo) {
    return new Promise((ok, mal) => {
      const img = new Image()
      const url = URL.createObjectURL(archivo)
      img.onload = () => {
        const e = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight))
        const c = document.createElement('canvas')
        c.width = Math.round(img.naturalWidth * e); c.height = Math.round(img.naturalHeight * e)
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height)
        URL.revokeObjectURL(url)
        c.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo leer la foto.'))), 'image/jpeg', 0.85)
      }
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo abrir la foto (si es HEIC, mandala por WhatsApp y elegila desde ahí).')) }
      img.src = url
    })
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {})
  window.addEventListener('hashchange', ir)
  ir()
})()
