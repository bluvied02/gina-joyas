// LOS COLORES QUE SE RECONOCEN EN EL NOMBRE DE UNA PRENDA
//
// "Pantalón rústico negro" -> Negro, sin tener que elegirlo. Se usa al crear un
// producto (en la compu y en el celular) y al importar un Excel sin columna de
// color. Es el mismo archivo en src/comun y en celular/ (se copia tal cual).

;(function (raiz) {
  'use strict'

  // Nombre que se muestra, color de la muestra y otras formas de escribirlo.
  const LISTA = [
    ['Negro', '#1f1f22', 'negra'], ['Blanco', '#f4f1ea', 'blanca'], ['Crudo', '#e9dfcc', 'cruda'], ['Natural', '#e6d8bf'],
    ['Hueso', '#ece3d0'], ['Marfil', '#f1e8d2'], ['Tiza', '#ebe7df'], ['Arena', '#d9c7a7'], ['Beige', '#d8c3a5', 'beish'],
    ['Nude', '#e3c4ad'], ['Camel', '#b48a5a', 'camello'], ['Suela', '#9a6a3f'], ['Habano', '#8a5a36'], ['Tostado', '#a0703f', 'tostada'],
    ['Chocolate', '#5b3a29'], ['Marrón', '#6b4630', 'marron'], ['Visón', '#8f7f73', 'vison'], ['Topo', '#7d7066'],
    ['Champagne', '#e8d6b3', 'champan'], ['Rosa viejo', '#c98b8f'], ['Rosa', '#e8b4bc', 'rosado', 'rosada'], ['Fucsia', '#c2187a'],
    ['Coral', '#f08070'], ['Rojo', '#c62828', 'roja'], ['Bordó', '#6d1f2f', 'bordo', 'bordeaux'], ['Vino', '#5e1b2c'],
    ['Terracota', '#b5563c'], ['Ladrillo', '#a2492f'], ['Naranja', '#ef7d2d'], ['Mostaza', '#c9a227'],
    ['Amarillo', '#f2d03b', 'amarilla'], ['Verde oliva', '#6b6b3a'], ['Verde militar', '#4b5320'], ['Verde agua', '#9fd8cb'],
    ['Verde', '#3f8f4f'], ['Oliva', '#6b6b3a'], ['Militar', '#4b5320'], ['Salvia', '#a3b18a'], ['Menta', '#a8e0c4'],
    ['Kaki', '#a89a6a', 'khaki', 'caqui'], ['Turquesa', '#2fb5b0'], ['Celeste', '#a9c6e0'], ['Azul marino', '#1e2a44', 'marino'],
    ['Azul francia', '#2f4fb5'], ['Azul', '#2d4c8f'], ['Denim claro', '#8eaacb'], ['Denim', '#4a6a8f'], ['Gris melange', '#a5a5a8', 'melange'],
    ['Gris topo', '#7d7066'], ['Gris', '#8d8d91'], ['Grafito', '#4a4a4f'], ['Lila', '#b9a7d6'], ['Lavanda', '#c7b8e0'],
    ['Violeta', '#7b4fa0'], ['Morado', '#6a3d8f', 'morada'], ['Plata', '#c9c9cc', 'plateado', 'plateada'],
    ['Dorado', '#d4af37', 'dorada'], ['Oro rosa', '#c9a08b'], ['Cobre', '#b87333'], ['Animal print', '#a67c52', 'leopardo'],
    ['Multicolor', '#d8c3a5']
  ]

  const sinTildes = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // Cada forma escrita -> [nombre, hex]; las de mas palabras primero ("azul marino" antes que "azul").
  const FORMAS = []
  for (const [nombre, hex, ...otras] of LISTA) for (const f of [nombre, ...otras]) FORMAS.push([sinTildes(f), nombre, hex])
  FORMAS.sort((a, b) => b[0].length - a[0].length)
  const HEX = Object.fromEntries(LISTA.map(([n, h]) => [sinTildes(n), h]))

  // Colores escritos en un texto, en el orden en que aparecen y sin repetir.
  function detectar (texto) {
    let t = ' ' + sinTildes(texto).replace(/[^a-z0-9ñ]+/g, ' ') + ' '
    const hallados = []
    for (const [forma, nombre, hex] of FORMAS) {
      const i = t.indexOf(' ' + forma + ' ')
      if (i < 0) continue
      if (!hallados.some((h) => h.nombre === nombre)) hallados.push({ nombre, hex, en: i })
      t = t.slice(0, i) + ' ' + '_'.repeat(forma.length) + ' ' + t.slice(i + forma.length + 2)
    }
    return hallados.sort((a, b) => a.en - b.en).map(({ nombre, hex }) => ({ nombre, hex }))
  }

  // Muestra para un color escrito a mano ("negro", "Azul Marino"); null si no se conoce.
  function hex (nombre) {
    const k = sinTildes(nombre).trim()
    if (HEX[k]) return HEX[k]
    const d = detectar(nombre)
    return d.length === 1 ? d[0].hex : null
  }

  const exp = { LISTA, detectar, hex }
  if (typeof module !== 'undefined' && module.exports) module.exports = exp
  else raiz.Colores = exp
})(typeof window !== 'undefined' ? window : globalThis)
