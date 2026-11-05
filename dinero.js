// Toda la plata se guarda en centavos enteros. Nunca en decimales:
// 0.1 + 0.2 en punto flotante da 0.30000000000000004 y eso, sumado
// 500 veces por turno, termina en una diferencia de caja fantasma.

function aCentavos (valor) {
  if (typeof valor === 'number') return Math.round(valor * 100)
  if (valor === null || valor === undefined) return 0
  const limpio = String(valor).trim().replace(/\$/g, '').replace(/\s/g, '')
  if (limpio === '') return 0
  // Acepta "1.250,50" (formato argentino) y "1250.50" (formato del export)
  let normalizado
  // "19.000" o "1.250.000" son miles, como se escribe en Argentina (nadie
  // cobra 19 pesos con tres decimales).
  if (/^-?\d{1,3}(\.\d{3})+$/.test(limpio)) return Number(limpio.replace(/\./g, '')) * 100
  // "1,650.00": coma de miles y punto de centavos, como exportan otros sistemas
  // (Eleventa). Antes se leia como 16,50 y el precio quedaba cien veces mas bajo.
  if (/^-?\d{1,3}(,\d{3})+\.\d{1,2}$/.test(limpio)) return Math.round(Number(limpio.replace(/,/g, '')) * 100)
  if (limpio.includes(',')) {
    normalizado = limpio.replace(/\./g, '').replace(',', '.')
  } else {
    normalizado = limpio
  }
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0
}

function aPesos (centavos) {
  return (centavos || 0) / 100
}

function formatoPesos (centavos, conSimbolo = true) {
  const negativo = centavos < 0
  const abs = Math.abs(Math.round(centavos || 0))
  const entero = Math.floor(abs / 100)
  const dec = String(abs % 100).padStart(2, '0')
  const miles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const cuerpo = `${miles},${dec}`
  return `${negativo ? '-' : ''}${conSimbolo ? '$ ' : ''}${cuerpo}`
}

// Porcentajes en base 10.000 para no perder el 0,1% del QR.
// 2% se guarda como 200; 0,1% como 10.
function pctABasis (pct) {
  return Math.round(Number(pct || 0) * 100)
}

function aplicarPct (centavos, basis) {
  return Math.round((centavos * basis) / 10000)
}

function formatoPct (basis, decimales = 1) {
  return `${(basis / 100).toFixed(decimales).replace('.', ',')}%`
}

const Dinero = { aCentavos, aPesos, formatoPesos, pctABasis, aplicarPct, formatoPct }
if (typeof module !== 'undefined' && module.exports) module.exports = Dinero
if (typeof window !== 'undefined') window.Dinero = Dinero
