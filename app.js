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
    gastos: '<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M16 14.5h2.5"/><path d="M6 6V4.5h12V6"/>',
    codigo: '<path d="M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M7 8v8M10 8v8M13 8v8M17 8v8"/>',
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
  // Gastos mandados desde aca que la compu todavia no devolvio en los datos.
  let gastosEnviados = []
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

  // --- lector de codigos de barra con la camara -------------------------------
  // Android trae lector propio (BarcodeDetector). Donde no hay (iPhone) se usa
  // ZXing: zxing.js se baja recien la primera vez que se abre el lector.
  let zxing = null
  function cargarZxing () {
    if (window.ZXing) return Promise.resolve()
    return zxing || (zxing = new Promise((ok, mal) => {
      const s = document.createElement('script')
      s.src = 'zxing.js'
      s.onload = ok
      s.onerror = () => { zxing = null; mal(new Error('no se pudo bajar el lector (¿hay señal?)')) }
      document.head.appendChild(s)
    }))
  }
  function escanear () {
    return new Promise((resolver) => {
      const velo = document.createElement('div')
      velo.className = 'lector'
      velo.innerHTML = '<video playsinline muted autoplay></video><div class="lector-marco"></div><div class="lector-pie"><span>Apuntá al código de barras de la etiqueta</span><button class="btn bloque" id="lCerrar">Cancelar</button></div>'
      document.body.appendChild(velo)
      const video = velo.querySelector('video')
      let fin = false
      let stream = null
      let lector = null
      const terminar = (codigo) => {
        if (fin) return
        fin = true
        if (lector) try { lector.reset() } catch (e) { /* ya cerrado */ }
        if (stream) stream.getTracks().forEach((t) => t.stop())
        velo.remove()
        if (codigo && navigator.vibrate) navigator.vibrate(80)
        resolver(codigo ? String(codigo).trim() : null)
      }
      velo.querySelector('#lCerrar').addEventListener('click', () => terminar(null))
      ;(async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('este navegador no deja usar la cámara')
          const formatos = 'BarcodeDetector' in window ? await BarcodeDetector.getSupportedFormats() : []
          if (formatos.length) {
            const det = new BarcodeDetector({ formats: formatos })
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            video.srcObject = stream
            await video.play()
            const mirar = async () => {
              if (fin) return
              try { const r = await det.detect(video); if (r.length) return terminar(r[0].rawValue) } catch (e) { /* cuadro sin imagen todavia */ }
              setTimeout(mirar, 120)
            }
            mirar()
          } else {
            await cargarZxing()
            if (fin) return
            lector = new ZXing.BrowserMultiFormatReader()
            await lector.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (r) => { if (r) terminar(r.getText()) })
          }
        } catch (e) {
          aviso(e.name === 'NotAllowedError' ? 'Dale permiso a la cámara para leer códigos (en la configuración del navegador).' : 'No se pudo abrir la cámara: ' + (e.message || e), 'error')
          terminar(null)
        }
      })()
    })
  }
  // Codigos comparados sin mayusculas ni simbolos, como en la compu.
  const clave = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const porCodigo = (codigo) => (D.productos || []).find((p) => p.variantes.some((v) => clave(v.codigoBarras) === clave(codigo) || (v.sku && clave(v.sku) === clave(codigo))))
  // Leido en Productos y no encontrado: se pasa a Cargar ya escrito.
  let codigoParaCargar = ''

  // --- armazon ----------------------------------------------------------------

  const TABS = [['hoy', 'Hoy'], ['productos', 'Productos'], ['cargar', 'Cargar'], ['gastos', 'Gastos'], ['cuentas', 'Cuentas'], ['condicional', 'Condic.']]
  const TITULOS = { hoy: 'Hoy', productos: 'Productos', cargar: 'Cargar producto', cuentas: 'Cuentas corrientes', condicional: 'Condicionales', gastos: 'Gastos' }

  // La ayuda de cada pestaña (el "?" de arriba): pasos cortos, sin palabras tecnicas.
  const AYUDA = {
    hoy: [['Lo del día', 'Arriba ves lo vendido hoy, el ticket promedio y si la caja del local está abierta.'], ['Cierres de caja', 'Cada vez que cierran la caja aparece acá: lo vendido por medio de pago y si el efectivo cerró justo, faltó o sobró.'], ['De dónde salen los datos', 'Los sube la compu del local cada minuto, si está prendida y con internet. Arriba a la derecha dice hace cuánto llegaron.'], ['Reponer', 'Abajo aparecen las prendas que llegaron al mínimo: hay que pedirlas.']],
    productos: [['Buscar', 'Escribí el nombre o tocá el botón del código de barras y apuntá la cámara a la etiqueta: te abre la prenda.'], ['Ver y editar', 'Tocá una prenda para ver el stock por talle y color. Con "Editar" cambiás nombre, precio, costo, fotos y el stock contado.'], ['Si no está cargada', 'Si escaneás algo que no existe, te ofrece cargarlo con ese código ya puesto.']],
    cargar: [['Igual que en la compu', 'Elegí Ropa, Joyería o Marroquinería, sacá fotos y escribí el nombre con el color ("Pantalón rústico negro"): el color se completa solo.'], ['Precio', 'Poné el costo y el % de ganancia: el precio se calcula solo. Si no sabés el costo, poné solo el precio.'], ['Talles y combinaciones', 'Escribí los talles separados por espacio y tocá "Generar combinaciones". En cada una ponés el stock y, si la etiqueta trae código, lo leés con la cámara.'], ['Enviar', 'Tocá "Enviar a la compu del local": en un minuto aparece en el sistema con sus códigos para imprimir las etiquetas.']],
    gastos: [['Cargar un gasto', 'Tocá "Cargar un gasto": el monto, de qué es (Alquiler, Luz, Bolsas…), con qué se pagó y la fecha.'], ['Efectivo de la caja', 'Si elegís "Efectivo de la caja", sale de la caja del local (si está abierta). Si no, queda anotado aparte.'], ['Cuánto va del mes', 'Arriba ves lo gastado este mes y el anterior. En la compu, en Reportes, ves la ganancia neta (ganancia menos gastos).']],
    cuentas: [['Quién debe', 'La lista de clientas con deuda, la más vencida primero.'], ['Mandar el resumen', 'Tocá una clienta y "Escribirle por WhatsApp": le llega el detalle de lo que debe. Los pagos se anotan en la compu.']],
    condicional: [['Ropa afuera', 'Las clientas que se llevaron ropa a probar y para cuándo la tienen que traer. Las vencidas, en rojo.'], ['Recordarle', 'Tocá el condicional y "Escribirle por WhatsApp": le llega la lista de lo que se llevó.']]
  }
  function mostrarAyuda (ruta) {
    const pasos = AYUDA[ruta] || []
    hoja('<h3 style="margin:0 0 4px">Cómo se usa: ' + TITULOS[ruta] + '</h3><div class="ayuda-pasos">' + pasos.map(([t, d], i) => '<div><span>' + (i + 1) + '</span><div><b>' + t + '</b><p>' + d + '</p></div></div>').join('') + '</div><p class="mini muted">¿Dudas? Escribile a Pablo.</p>')
  }

  function armazon (ruta) {
    const actualizado = D.resumen && D.resumen._actualizado
    raiz.innerHTML = '<header class="cab"><img src="logo.png" alt=""><h1>' + TITULOS[ruta] + '</h1><div class="estado" id="estado">' + (actualizado ? 'Datos de la compu<br>' + esc(hace(actualizado)) : '') + '</div><button class="ayuda" id="ayuda" aria-label="Ayuda">?</button></header><main class="contenido" id="cont"></main>' +
      '<nav class="tabbar">' + TABS.map(([k, n]) => '<a href="#/' + k + '" class="' + (k === ruta ? 'activo ' : '') + (k === 'cargar' ? 'cargar' : '') + '">' + ico(k) + '<span>' + n + '</span></a>').join('') + '</nav>'
    raiz.querySelector('#ayuda').addEventListener('click', () => mostrarAyuda(ruta))
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
        (r.cierres && r.cierres.length ? '<h2>Cierres de caja</h2><div class="card lista">' + r.cierres.map((c) => '<div><div class="crece"><div class="nombre">' + esc(fecha(c.cierre)) + ' · ' + esc(c.responsable || 'Sin responsable') + '</div><div class="mini muted">' + num(c.ventas) + ' ventas · ' + Object.entries(c.porMedio || {}).filter(([, v]) => v > 0).map(([k, v]) => esc((r.medios || {})[k] || k) + ' ' + $(v)).join(' · ') + '</div><div class="mini muted">Efectivo: esperado ' + $(c.esperado) + ' · contado ' + $(c.contado) + (c.nota ? ' · ' + esc(c.nota) : '') + '</div></div><div style="text-align:right"><b class="num">' + $(c.vendido) + '</b><div><span class="badge ' + (!c.diferencia ? 'ok' : c.diferencia < 0 ? 'bad' : 'warn') + '">' + (!c.diferencia ? 'Cerró justo' : (c.diferencia < 0 ? 'Faltan ' : 'Sobran ') + $(Math.abs(c.diferencia))) + '</span></div></div></div>').join('') + '</div>' : '') +
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
      cont.innerHTML = '<div class="buscar-fila"><input class="input" id="pBuscar" placeholder="Buscar producto o código…"><button class="btn" id="pLeer" title="Leer código de barras">' + ico('codigo') + '</button></div><div class="chips mt" id="pRubro">' + [['', 'Todo'], ['ropa', 'Ropa'], ['joyeria', 'Joyería'], ['marroquineria', 'Marroquinería'], ['bajo', 'Poco stock']].map(([k, n]) => '<button class="chip' + (k === rubro ? ' activo' : '') + '" data-r="' + k + '">' + n + '</button>').join('') + '</div><div class="grilla mt" id="pGrilla"></div>'
      const dibujar = () => {
        const f = texto.toLowerCase()
        const k = clave(f)
        const lista = D.productos.filter((p) => (!rubro || (rubro === 'bajo' ? p.stock <= 3 : p.rubro === rubro)) && (!f || (p.nombre + ' ' + p.categoria + ' ' + p.marca).toLowerCase().includes(f) || (k.length >= 4 && p.variantes.some((v) => clave(v.codigoBarras).includes(k))))).slice(0, 120)
        const g = cont.querySelector('#pGrilla')
        g.innerHTML = lista.length ? lista.map((p) => '<button class="card prod" data-id="' + esc(p.id) + '"><div class="img"' + (p.fotos[0] ? ' data-foto="' + esc(p.fotos[0]) + '"' : '') + '>' + esc(iniciales(p.nombre)) + '</div><div class="info"><div class="nombre">' + esc(p.nombre) + '</div><div class="entre"><b class="num">' + $(p.precio) + '</b><span class="mini ' + (p.stock <= 3 ? 'stock-bajo' : 'muted') + '">' + num(p.stock) + ' u.</span></div></div></button>').join('') : '<div class="vacio" style="grid-column:1/-1">No hay productos con esa búsqueda.</div>'
        g.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => detalle(D.productos.find((p) => p.id === b.dataset.id))))
        cargarFotos(g)
      }
      cont.querySelector('#pBuscar').addEventListener('input', (e) => { texto = e.target.value; dibujar() })
      cont.querySelector('#pLeer').addEventListener('click', async () => {
        const codigo = await escanear()
        if (!codigo) return
        const p = porCodigo(codigo)
        if (p) return detalle(p)
        const v = hoja('<h3 style="margin:0 0 6px">No está cargado</h3><p class="muted">Ningún producto tiene el código <b>' + esc(codigo) + '</b>.</p><button class="btn primario bloque mt" id="hCargar">Cargar producto nuevo con este código</button><button class="btn bloque mt" id="hOtro">Leer otro</button>')
        v.querySelector('#hCargar').addEventListener('click', () => { v.remove(); codigoParaCargar = codigo; location.hash = '#/cargar' })
        v.querySelector('#hOtro').addEventListener('click', () => { v.remove(); cont.querySelector('#pLeer').click() })
      })
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
            (fotos.length < 6 ? '<label class="agregar">' + ico('camara') + 'Sacar o elegir<input type="file" accept="image/*" multiple class="oculto" id="eArchivo"></label>' : '')
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

    // CARGAR UN PRODUCTO: lo mismo que en la compu (Productos > Nuevo): rubro,
    // listas, costo y ganancia, joyeria por gramo y la grilla de combinaciones
    // con stock, codigo de barras y precio propio. Viaja por la cola y la compu
    // lo da de alta en un minuto.
    cargar (cont) {
      const L = Object.assign({ categorias: [], marcas: [], colecciones: [], temporadas: [], metales: {}, preciosMetal: {}, dolar: 0, gananciaDefault: 100, redondeoPrecio: 10000 }, D.listas || {})
      let f = nuevo()
      function nuevo () {
        const x = { rubro: 'ropa', fotos: [], vars: [], coloresAMano: false, costoAuto: true, codigoInicial: codigoParaCargar }
        codigoParaCargar = ''
        return x
      }
      const $c = (s) => cont.querySelector(s)
      const campoF = (k) => $c('[data-f="' + k + '"]')
      // Lo escrito pasa a "f" antes de redibujar: cambiar de rubro no borra nada.
      const tomar = () => {
        for (const k of ['nombre', 'categoria', 'marca', 'coleccion', 'temporada', 'costo', 'pct', 'precio', 'descripcion', 'talles', 'colores', 'metal', 'gramos', 'adicional']) { const el = campoF(k); if (el) f[k] = el.value }
        if ($c('#cAuto')) f.costoAuto = $c('#cAuto').checked
      }
      const datalist = (id, items) => '<datalist id="' + id + '">' + (items || []).map((c) => '<option value="' + esc(c.nombre) + '">').join('') + '</datalist>'
      const campo = (k, titulo, extra) => '<div class="campo"><span>' + titulo + '</span><input class="input" data-f="' + k + '" value="' + esc(f[k] || '') + '"' + (extra || '') + '></div>'
      const redondear = (c) => { const r = L.redondeoPrecio || 100; return Math.ceil(c / r) * r }

      function dibujar () {
        const joya = f.rubro === 'joyeria'
        const marro = f.rubro === 'marroquineria'
        const cats = L.categorias.filter((c) => !c.rubro || c.rubro === f.rubro)
        if (joya && !f.metal) f.metal = Object.keys(L.metales)[0] || ''
        cont.innerHTML = '<div class="seg" style="grid-template-columns:1fr 1fr 1fr">' + [['ropa', 'Ropa'], ['joyeria', 'Joyería'], ['marroquineria', 'Marroquinería']].map(([k, n]) => '<button data-rubro="' + k + '" class="' + (f.rubro === k ? 'activo' : '') + '">' + n + '</button>').join('') + '</div>' +
          '<div class="campo"><span>Fotos <span class="muted" style="font-weight:400">· la primera es la principal</span></span><div class="fotos" id="cFotos"></div></div>' +
          campo('nombre', 'Nombre', ' placeholder="' + (joya ? 'Ej: Anillo solitario plata' : marro ? 'Ej: Cartera de cuero negra' : 'Ej: Pantalón rústico negro') + '"') +
          '<div class="dos">' + campo('categoria', 'Categoría', ' list="lCat" placeholder="Elegí o escribí"') + campo('marca', 'Marca', ' list="lMarca" placeholder="Elegí o escribí"') + '</div>' +
          '<div class="dos">' + campo('coleccion', 'Colección', ' list="lCol" placeholder="Opcional"') + campo('temporada', 'Temporada', ' list="lTem" placeholder="Opcional"') + '</div>' +
          datalist('lCat', cats) + datalist('lMarca', L.marcas) + datalist('lCol', L.colecciones) + datalist('lTem', L.temporadas) +
          (joya ? '<div class="card pad" style="margin-bottom:12px"><b>Metal y peso</b><div class="dos mt"><div class="campo"><span>Metal</span><select class="input" data-f="metal">' + Object.entries(L.metales).map(([k, n]) => '<option value="' + k + '"' + (f.metal === k ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>' + campo('gramos', 'Gramos', ' inputmode="decimal" placeholder="3,5"') + '</div>' + campo('adicional', 'Adicional (piedras, hechura)', ' inputmode="decimal" placeholder="0"') + '<label class="tilde"><input type="checkbox" id="cAuto"' + (f.costoAuto ? ' checked' : '') + '> Calcular el costo con el precio del metal</label><div class="calc" id="cCalc" style="margin:10px 0 0"></div></div>' : '') +
          '<div class="dos">' + campo('costo', 'Costo (opcional)', ' inputmode="decimal"') + campo('pct', 'Ganancia %', ' inputmode="decimal" placeholder="' + L.gananciaDefault + '"') + '</div>' +
          campo('precio', 'Precio de venta', ' inputmode="decimal"') +
          '<div class="campo"><span>Descripción <span class="muted" style="font-weight:400">(opcional)</span></span><textarea class="input" data-f="descripcion" rows="2">' + esc(f.descripcion || '') + '</textarea></div>' +
          '<h2>Variantes</h2><p class="mini muted" style="margin:-4px 2px 10px">Cada combinación tiene su stock, su código de barras y, si querés, su propio precio.</p>' +
          '<div class="card pad" style="background:var(--surface-2)">' +
            campo('talles', joya ? 'Medidas (anillos: 12 14 16; si no tiene, vacío)' : marro ? 'Modelo o medida (si no tiene, vacío)' : 'Talles (separados por espacio; si es único, vacío)', ' placeholder="' + (joya ? '12 14 16' : marro ? 'Chica Grande' : 'S M L  ó  36 38 40') + '" autocapitalize="characters"') +
            campo('colores', joya ? 'Terminación (separadas por coma)' : 'Colores (separados por coma)', ' placeholder="' + (joya ? 'Plata, Dorado' : 'Negro, Crudo, Camel') + '"') +
            '<div id="cDetect" class="detect"></div>' +
            '<button class="btn bloque" id="cGenerar">Generar combinaciones</button></div>' +
          '<div id="cVars" class="mt"></div>' +
          '<button class="btn primario bloque mt" id="cOk">Enviar a la compu del local</button><p class="mini muted">El producto aparece en el sistema del local en un minuto, con los códigos de barras listos para imprimir las etiquetas.</p>'
        cont.querySelectorAll('[data-rubro]').forEach((b) => b.addEventListener('click', () => { tomar(); f.rubro = b.dataset.rubro; dibujar() }))
        dibujarFotos()
        dibujarVars()
        mostrarDetectados()
        // El color sale del nombre ("Pantalón rústico negro" -> Negro) mientras no lo escriban a mano.
        campoF('nombre').addEventListener('input', (e) => {
          if (f.coloresAMano) return
          campoF('colores').value = Colores.detectar(e.target.value).map((c) => c.nombre).join(', ')
          mostrarDetectados()
        })
        campoF('colores').addEventListener('input', () => { f.coloresAMano = true; mostrarDetectados() })
        campoF('costo').addEventListener('input', desdeCosto)
        campoF('pct').addEventListener('input', desdeCosto)
        campoF('precio').addEventListener('input', desdePrecio)
        if (joya) {
          for (const k of ['gramos', 'adicional']) campoF(k).addEventListener('input', calcJoya)
          campoF('metal').addEventListener('change', calcJoya)
          $c('#cAuto').addEventListener('change', calcJoya)
          calcJoya()
        }
        $c('#cGenerar').addEventListener('click', () => { const n = generar(); if (n >= 0) aviso(n ? 'Se agregaron ' + n + ' combinaciones.' : 'Esas combinaciones ya estaban.') })
        $c('#cOk').addEventListener('click', enviar)
      }

      // Las muestras de los colores escritos (los que se conocen).
      function mostrarDetectados () {
        const el = $c('#cDetect')
        const lista = campoF('colores').value.split(/[,;]+/).map((c) => c.trim()).filter(Boolean)
        el.innerHTML = lista.length ? lista.map((c) => '<span class="muestra-chip"><i style="background:' + esc(Colores.hex(c) || '#d8c3a5') + '"></i>' + esc(c) + '</span>').join('') + (f.coloresAMano ? '' : '<span class="mini muted">tomado del nombre</span>') : ''
      }
      function desdeCosto () {
        const c = Dinero.aCentavos(campoF('costo').value)
        const pv = campoF('pct').value.trim()
        const pct = pv === '' ? L.gananciaDefault : Number(pv.replace(',', '.'))
        if (c > 0 && pct >= 0) campoF('precio').value = redondear(Math.round(c * (1 + pct / 100))) / 100
      }
      function desdePrecio () {
        const c = Dinero.aCentavos(campoF('costo').value)
        const pr = Dinero.aCentavos(campoF('precio').value)
        if (c > 0 && pr > 0) campoF('pct').value = String(Math.round(((pr / c) - 1) * 1000) / 10).replace('.', ',')
      }
      // Joyeria: gramos x precio del metal (US$) x dolar + adicional, como en la compu.
      function calcJoya () {
        const el = $c('#cCalc')
        const g = Number(String(campoF('gramos').value || '').replace(',', '.')) || 0
        const metal = campoF('metal').value
        const usd = L.preciosMetal[metal] || 0
        const adic = Dinero.aCentavos(campoF('adicional').value)
        if (!g || !usd) { el.textContent = usd ? 'Poné los gramos para calcular el costo.' : 'Este metal no tiene precio por gramo en la compu: poné el costo a mano.'; return }
        const costo = Math.round((g * usd * L.dolar) / 100) + adic
        el.innerHTML = String(g).replace('.', ',') + ' g × US$ ' + (usd / 100).toLocaleString('es-AR') + ' × dólar ' + $(L.dolar) + (adic ? ' + ' + $(adic) : '') + ' = <b>costo ' + $(costo) + '</b>'
        if ($c('#cAuto').checked) { campoF('costo').value = costo / 100; desdeCosto() }
      }

      // Talles x colores; sin talle va "U" (unico) y sin color "Único".
      function generar () {
        tomar()
        const talles = String(f.talles || '').trim() ? f.talles.split(/[\s,;]+/).map((t) => t.trim().toUpperCase()).filter(Boolean) : ['U']
        const colores = String(f.colores || '').split(/[,;]+/).map((c) => c.trim()).filter(Boolean).map((c) => c[0].toUpperCase() + c.slice(1))
        if (!colores.length) colores.push('Único')
        let sumadas = 0
        for (const c of colores) for (const t of talles) {
          if (f.vars.some((v) => v.talle === t && v.color.toLowerCase() === c.toLowerCase())) continue
          f.vars.push({ talle: t, color: c, colorHex: (f.vars.find((v) => v.color === c) || {}).colorHex || Colores.hex(c) || '#d8c3a5', stock: 1, codigoBarras: '', precio: null })
          sumadas++
        }
        // El codigo leido en Productos (no estaba cargado) va a la primera combinacion.
        if (f.codigoInicial && f.vars.length && !f.vars.some((v) => v.codigoBarras)) { f.vars[0].codigoBarras = f.codigoInicial; f.codigoInicial = '' }
        dibujarVars()
        return sumadas
      }

      function dibujarVars () {
        const caja = $c('#cVars')
        caja.innerHTML = f.vars.length
          ? '<div class="mini muted" style="margin:0 2px 6px">' + f.vars.length + ' combinaciones · tocá la muestra para cambiar el color</div>' + f.vars.map((v, i) => '<div class="card pad var">' +
            '<div class="entre"><div class="fila"><input type="color" class="muestra" data-vk="colorHex" data-i="' + i + '" value="' + esc(v.colorHex || '#d8c3a5') + '"><div><b>' + esc(v.color) + '</b><div class="mini muted">' + esc(v.talle === 'U' ? 'Talle único' : (f.rubro === 'joyeria' ? 'Medida ' : 'Talle ') + v.talle) + '</div></div></div><button class="btn chico" data-x="' + i + '" title="Quitar">✕</button></div>' +
            '<div class="dos mt"><div class="campo"><span>Stock</span><input class="input" type="number" inputmode="numeric" min="0" data-vk="stock" data-i="' + i + '" value="' + v.stock + '"></div><div class="campo"><span>Precio propio</span><input class="input" inputmode="decimal" data-vk="precio" data-i="' + i + '" value="' + (v.precio ? v.precio / 100 : '') + '" placeholder="Igual"></div></div>' +
            '<div class="buscar-fila"><input class="input" data-vk="codigoBarras" data-i="' + i + '" value="' + esc(v.codigoBarras || '') + '" placeholder="Código de barras (si no, automático)" autocapitalize="characters"><button class="btn" data-leer="' + i + '" title="Leer con la cámara">' + ico('codigo') + '</button></div></div>').join('')
          : '<div class="card pad mini muted">Escribí los talles y los colores y tocá <b>Generar combinaciones</b>. Si no lo hacés, se arman solas al enviar.</div>'
        caja.querySelectorAll('[data-vk]').forEach((inp) => inp.addEventListener('input', () => {
          const v = f.vars[Number(inp.dataset.i)]
          const k = inp.dataset.vk
          v[k] = k === 'stock' ? Math.max(0, Math.round(Number(inp.value) || 0)) : k === 'precio' ? (Dinero.aCentavos(inp.value) || null) : inp.value.trim()
        }))
        caja.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => { f.vars.splice(Number(b.dataset.x), 1); dibujarVars() }))
        caja.querySelectorAll('[data-leer]').forEach((b) => b.addEventListener('click', async () => {
          const i = Number(b.dataset.leer)
          const codigo = await escanear()
          if (!codigo) return
          const ya = porCodigo(codigo)
          if (ya) return aviso('Ese código ya es de "' + ya.nombre + '". Buscalo en Productos para editarlo.', 'error')
          if (f.vars.some((v, j) => j !== i && clave(v.codigoBarras) === clave(codigo))) return aviso('Ese código ya lo pusiste en otra combinación.', 'error')
          f.vars[i].codigoBarras = codigo
          dibujarVars()
        }))
      }

      function dibujarFotos () {
        const caja = $c('#cFotos')
        caja.innerHTML = f.fotos.map((x, i) => '<div class="f" style="background-image:url(' + x.url + ')">' + (i === 0 ? '<span class="ppal">Principal</span>' : '') + '<button data-q="' + i + '">✕</button></div>').join('') +
          (f.fotos.length < 6 ? '<label class="agregar">' + ico('camara') + 'Sacar o elegir<input type="file" accept="image/*" multiple class="oculto" id="cArchivo"></label>' : '')
        caja.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { f.fotos.splice(Number(b.dataset.q), 1); dibujarFotos() }))
        const inp = caja.querySelector('#cArchivo')
        if (inp) inp.addEventListener('change', async () => { for (const a of [...inp.files].slice(0, 6 - f.fotos.length)) { try { const blob = await achicar(a); f.fotos.push({ blob, url: URL.createObjectURL(blob) }) } catch (e) { aviso(e.message, 'error') } } dibujarFotos() })
      }

      async function enviar () {
        tomar()
        if (!String(f.nombre || '').trim()) return aviso('Poné el nombre.', 'error')
        const precio = Dinero.aCentavos(f.precio)
        if (!(precio > 0)) return aviso('Poné el precio de venta.', 'error')
        if (!f.vars.length) generar()
        const codigos = f.vars.map((v) => clave(v.codigoBarras)).filter(Boolean)
        if (new Set(codigos).size !== codigos.length) return aviso('Hay dos combinaciones con el mismo código de barras.', 'error')
        const joya = f.rubro === 'joyeria'
        const datos = {
          rubro: f.rubro, nombre: f.nombre.trim(), categoria: (f.categoria || '').trim(), marca: (f.marca || '').trim(), coleccion: (f.coleccion || '').trim(), temporada: (f.temporada || '').trim(),
          precio, costo: Dinero.aCentavos(f.costo), descripcion: (f.descripcion || '').trim(),
          variantes: f.vars.map((v) => ({ talle: v.talle, color: v.color, colorHex: v.colorHex, stock: v.stock, codigoBarras: v.codigoBarras || null, precio: v.precio || null })),
          metal: joya ? f.metal || null : null,
          gramos: joya ? Number(String(f.gramos || '').replace(',', '.')) || null : null,
          adicional: joya ? Dinero.aCentavos(f.adicional) : 0,
          costoAuto: joya ? !!f.costoAuto : false,
          // Para una compu que todavia no se actualizo: talles, colores y stock sueltos.
          talles: [...new Set(f.vars.map((v) => v.talle))], colores: [...new Set(f.vars.map((v) => v.color))], stock: f.vars[0].stock, codigoBarras: (f.vars.find((v) => v.codigoBarras) || {}).codigoBarras || null,
          fotos: []
        }
        const b = $c('#cOk')
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
          aviso('Enviado: "' + datos.nombre + '" aparece en la compu del local en un minuto.', 'ok')
          f = nuevo()
          dibujar()
          window.scrollTo(0, 0)
        } catch (e) { aviso('No se pudo enviar: ' + (e.message || 'sin señal') + '. Probá de nuevo: lo que cargaste sigue acá.', 'error'); b.disabled = false; b.textContent = 'Enviar a la compu del local' }
      }
      dibujar()
    },

    // GASTOS: cargar lo que se paga (alquiler, luz, bolsas…) y ver cuanto va del mes.
    gastos (cont) {
      const G = D.gastos
      if (!G) { cont.innerHTML = sinDatos; return }
      // Los enviados recien, hasta que la compu los toma y vuelven en los datos.
      gastosEnviados = gastosEnviados.filter((x) => !G._actualizado || G._actualizado < x.enviado)
      const total = G.mes + gastosEnviados.reduce((s, x) => s + x.monto, 0)
      cont.innerHTML = '<div class="kpis"><div class="card kpi grande"><div class="t">Gastos de este mes</div><div class="v num">' + $(total) + '</div><div class="mini" style="color:#d9c7b6">El mes pasado: ' + $(G.anterior) + '</div></div></div>' +
        '<button class="btn primario bloque mt" id="gNuevo">' + ico('cargar') + 'Cargar un gasto</button>' +
        (G.porCategoria.length ? '<h2>En qué se gastó este mes</h2><div class="card lista">' + G.porCategoria.map((c) => '<div><div class="crece">' + esc(c.nombre) + '</div><b class="num">' + $(c.monto) + '</b></div>').join('') + '</div>' : '') +
        '<h2>Últimos gastos</h2><div class="card lista">' +
          gastosEnviados.map((x) => '<div><div class="crece"><div class="nombre">' + esc(x.categoria) + '</div><div class="mini muted">' + esc(x.concepto || '') + ' · <span class="badge warn">enviado, la compu lo toma en un minuto</span></div></div><b class="num">' + $(x.monto) + '</b></div>').join('') +
          (G.filas.length ? G.filas.map((x) => '<div><div class="crece"><div class="nombre"' + (x.anulado ? ' style="text-decoration:line-through;color:var(--muted)"' : '') + '>' + esc(x.categoria) + '</div><div class="mini muted">' + esc(fecha(x.fecha) + (x.concepto ? ' · ' + x.concepto : '') + ' · ' + x.medioNombre + (x.usuario ? ' · ' + x.usuario : '')) + '</div></div>' + (x.anulado ? '<span class="badge bad">Anulado</span>' : '<b class="num">' + $(x.monto) + '</b>') + '</div>').join('') : (gastosEnviados.length ? '' : '<div class="vacio">Todavía no hay gastos cargados.</div>')) +
        '</div>'
      cont.querySelector('#gNuevo').addEventListener('click', () => {
        let categoria = ''
        const hoyDia = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
        const v = hoja('<h3 style="margin:0 0 12px">Cargar gasto</h3>' +
          '<div class="campo"><span>Monto</span><input class="input num" id="gMonto" inputmode="decimal" placeholder="0" style="font-size:22px;height:54px"></div>' +
          '<div class="campo"><span>¿De qué es?</span><div class="chips envolver" id="gCats">' + G.categorias.map((c) => '<button type="button" class="chip" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div></div>' +
          '<div class="campo"><span>Detalle (opcional)</span><input class="input" id="gConcepto" placeholder="Ej: factura de luz de octubre"></div>' +
          '<div class="dos"><div class="campo"><span>Pagado con</span><select class="input" id="gMedio">' + Object.entries(G.medios).map(([k, n]) => '<option value="' + k + '"' + (k === 'transferencia' ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div><div class="campo"><span>Fecha</span><input class="input" type="date" id="gFecha" value="' + hoyDia + '" max="' + hoyDia + '"></div></div>' +
          '<button class="btn primario bloque" id="gOk">Guardar gasto</button><p class="mini muted">"Efectivo de la caja" lo saca de la caja del local si está abierta.</p>')
        v.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
          categoria = categoria === b.dataset.cat ? '' : b.dataset.cat
          v.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('activo', x.dataset.cat === categoria))
        }))
        v.querySelector('#gOk').addEventListener('click', async () => {
          const monto = Dinero.aCentavos(v.querySelector('#gMonto').value)
          if (!(monto > 0)) return aviso('Poné el monto.', 'error')
          const concepto = v.querySelector('#gConcepto').value.trim()
          if (!categoria && !concepto) return aviso('Elegí de qué es el gasto.', 'error')
          const b = v.querySelector('#gOk')
          b.disabled = true
          b.textContent = 'Enviando…'
          const datos = { monto, categoria: categoria || 'Otros', concepto, medio: v.querySelector('#gMedio').value, fecha: v.querySelector('#gFecha').value, cargadoPor: sesion && sesion.email }
          try {
            await pedir('POST', '/rest/v1/gina_cola', { cuerpo: { tipo: 'gasto', datos }, cabeceras: { Prefer: 'return=minimal' } })
            gastosEnviados.unshift(Object.assign({ enviado: new Date().toISOString() }, datos))
            v.remove()
            aviso('Gasto enviado. La compu lo anota en un minuto.', 'ok')
            PANTALLAS.gastos(cont)
          } catch (e) { aviso('No se pudo enviar: ' + (e.message || 'sin señal'), 'error'); b.disabled = false; b.textContent = 'Guardar gasto' }
        })
        setTimeout(() => v.querySelector('#gMonto').focus(), 80)
      })
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
