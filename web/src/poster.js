// Póster estático con los mismos datos que el explorador. Borrador sin diseño final.
// Se exporta a PNG/PDF con Playwright (ver README).
import * as d3 from 'd3';
import './poster.css';
import { CAT_COLORS } from './theme.js';
import { barras, dumbbell, apiladas, leyenda, num, fmt } from './charts.js';
import P from './data/pozos.json';
import AREAS from './data/areas.geojson?raw';
import AREAS_PROPS from './data/areas_props.json';
import META from './data/meta.json';

const areas = JSON.parse(AREAS);
const G = META.grupos;
const DIN = META.dinero;
const PR = DIN.precios;
const R = META.propiedad;

const cc = c => CAT_COLORS[c] || '#888';

const EXT = ['EE.UU.', 'Europa', 'Asia y Medio Oriente', 'Latinoamérica', 'Otros'];
const ORDEN = ['Argentina', 'Mixto', 'EE.UU.', 'Europa', 'Asia y Medio Oriente', 'Latinoamérica'];

// solo pozos que produjeron petróleo en 2025; los grandes primero para que
// los chicos queden dibujados arriba
const pozos = P.id
  .map((id, i) => ({ lon: P.lon[i], lat: P.lat[i], area: P.area[i], op: P.op[i], pet: P.pet25[i] || 0 }))
  .filter(p => p.pet > 0)
  .sort((a, b) => b.pet - a.pet);

// dueños del área del pozo a dic-2025
function duenos(p) {
  const f = AREAS_PROPS[p.area]?.fotos?.['2025-12'];
  return f && f.length ? f : [[p.op, 1]];
}

// % del petróleo de las categorías `cats` con los dueños de la fecha f
function catFoto(f, cats) {
  const filas = R.categoria_por_foto.filter(r => r.foto === f && cats.includes(r.cat));
  return d3.sum(filas, r => r.pet_own);
}

// % del petróleo de las categorías `cats` contando por operador
function opCat(cats) {
  const filas = R.operado_categoria.filter(r => cats.includes(r.cat));
  return d3.sum(filas, r => r.pet);
}


// ---------- mapas ----------
// modo 'op': color del operador; modo 'due': color del dueño principal y
// borde del segundo dueño si tiene 20% o más
function mapa(sel, modo) {
  const W = 560;
  const H = 560;
  const svg = d3.select(sel).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%');

  const caja = { type: 'MultiPoint', coordinates: [[-69.75, -37.0], [-68.05, -39.05]] };
  const proj = d3.geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], caja);
  const path = d3.geoPath(proj);

  svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#EEF0EC');
  svg.append('g')
    .selectAll('path')
    .data(areas.features)
    .join('path')
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', '#9AA1A6')
    .attr('stroke-width', 0.6);

  const r = d3.scaleSqrt().domain([0, d3.max(pozos, p => p.pet)]).range([1, 9]);
  const g = svg.append('g');

  pozos.forEach(p => {
    const [x, y] = proj([p.lon, p.lat]);
    const c = g.append('circle')
      .attr('cx', x)
      .attr('cy', y)
      .attr('r', r(p.pet));

    if (modo === 'op') {
      c.attr('fill', cc(G[p.op].cat))
        .attr('fill-opacity', 0.85)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.3);
    } else {
      const d = duenos(p);
      const segundo = d.length > 1 && d[1][1] >= 0.2;
      c.attr('fill', cc(G[d[0][0]].cat))
        .attr('fill-opacity', 0.85)
        .attr('stroke', segundo ? cc(G[d[1][0]].cat) : '#fff')
        .attr('stroke-width', segundo ? 1.4 : 0.3);
    }
  });

  // referencia: Añelo
  const anelo = proj([-68.79, -38.354]);
  svg.append('text')
    .attr('x', anelo[0] + 6)
    .attr('y', anelo[1] - 40)
    .attr('class', 'mlbl')
    .text('Añelo');
  svg.append('line')
    .attr('x1', anelo[0] + 5)
    .attr('x2', anelo[0])
    .attr('y1', anelo[1] - 37)
    .attr('y2', anelo[1])
    .attr('stroke', '#333');

  // escala de 25 km (a la latitud de 39° S)
  const kmPorGrado = 111.32 * Math.cos(39 * Math.PI / 180);
  const a = proj([-69.7, -39.0]);
  const b = proj([-69.7 + 25 / kmPorGrado, -39.0]);
  svg.append('line')
    .attr('x1', a[0])
    .attr('x2', b[0])
    .attr('y1', a[1])
    .attr('y2', a[1])
    .attr('stroke', '#333')
    .attr('stroke-width', 2);
  svg.append('text')
    .attr('x', a[0])
    .attr('y', a[1] - 6)
    .attr('class', 'mlbl')
    .text('25 km');
}


// ---------- números del texto ----------
const k = DIN.kpi;
const L = Object.fromEntries(DIN.libro.map(l => [l.clave, l]));
const op = Object.fromEntries(R.operado.map(r => [r.grupo, r.pet]));
const ow = Object.fromEntries(
  R.por_participacion.filter(r => r.foto === '2025-12').map(r => [r.grupo, r.pet_own]),
);
const valTot = L.petroleo.usd + L.gas.usd;

// parte del Estado (Neuquén + Nación) en cada régimen, %
const b = DIN.barril;
const estado = r => (b[r].neuquen + b[r].nacion) / b[r].fob * 100;


document.getElementById('poster').innerHTML = `
<header>
  <h1>Vaca Muerta de Punta a Punta</h1>
  <p class="sub">Quién opera, quién es dueño, qué entra y qué sale · borrador sin diseño final</p>
  <p class="kpi"><b>${num(k.pozos_activos)}</b> pozos activos · <b>${num(L.petroleo.fisico / 1e6, 1)}</b> MMbbl de petróleo · <b>${num(L.gas.fisico / 1e9, 1)}</b> bcm de gas · <b>${fmt.mmusd(valTot)}</b> de valor estimado</p>
</header>

<section class="fila2">
  <div>
    <h2>Pozos por operador · petróleo 2025</h2>
    <div id="m1"></div>
    <p class="dato">Contado por operador, el capital argentino produce ${num(opCat(['Argentina']), 1)}% del petróleo.</p>
  </div>
  <div>
    <h2>Pozos por dueño principal (dic-2025) · borde: segundo dueño</h2>
    <div id="m2"></div>
    <p class="dato">Contado por participación de cada socio, ${num(catFoto('2025-12', ['Argentina']), 1)}%.</p>
  </div>
</section>

<div id="ley"></div>

<section class="fila2">
  <div>
    <h2>Petróleo 2025, %: operado vs por participación</h2>
    <p class="dato">Chevron opera ${num(op.Chevron, 1)}% y le corresponde ${num(ow.Chevron, 1)}%.</p>
    <div id="c1"></div>
  </div>
  <div>
    <h2>Petróleo 2025 según los dueños de cada fecha, %</h2>
    <p class="dato">Empresas con sede fuera del país: ${num(catFoto('2020-12', EXT), 1)}% con los dueños de dic-2020, ${num(catFoto('2026-10', EXT), 1)}% con los de oct-2026.</p>
    <div id="c2"></div>
    <p class="nota">Ventas: Exxon→Pluspetrol (dic-24), Exxon/Qatar→YPF (ene-25), Petronas→Vista (abr-25), Total→YPF (ago-25), Pluspetrol→Continental (nov-25), Equinor→Vista (may-26).</p>
  </div>
</section>

<section class="fila2">
  <div>
    <h2>Entradas, producción y salidas 2025, millones de USD</h2>
    <p class="dato">${num(k.kg_arena_por_bbl, 1)} kg de arena por barril; ${num(k.m3_agua_por_pozo)} m³ de agua por pozo fracturado.</p>
    <div id="c3"></div>
  </div>
  <div>
    <h2>Reparto de cada barril según destino y régimen, %</h2>
    <p class="dato">Estado (Neuquén + Nación): ${num(estado('int'), 1)}% mercado interno · ${num(estado('exp'), 1)}% exportación · ${num(estado('rigi'), 1)}% RIGI.</p>
    <div id="c4"></div>
    <h2>Quema estimada por satélite ÷ gas declarado, % (2025)</h2>
    <div id="c5"></div>
  </div>
</section>

<footer>
  <p>Fuentes: Secretaría de Energía (Capítulo IV y Adjunto IV, descarga 28/10/2026); Gobierno de Neuquén (capa Areas, GeoServer); Banco Mundial (estimación de quema por antorcha, VIIRS); IAE Mosconi (Vaca Muerta: análisis 2025); Ministerio de Economía de Neuquén vía El Economista (reparto del barril); prensa para las ventas 2024–2026 (una fuente por operación). Vista y PAE se clasifican como "mixto". Precio 2025: ${num(PR.pet_usd_bbl, 2)} USD/bbl y ${num(PR.gas_usd_mmbtu, 1)} USD/MMBTU. Exportaciones: % de la Cuenca Neuquina aplicado a Vaca Muerta. Procesamiento en Python + DuckDB.</p>
</footer>`;


// ---------- gráficos ----------
mapa('#m1', 'op');
mapa('#m2', 'due');
leyenda('#ley', ORDEN.map(c => ({ label: c, color: cc(c) })));

// c1: operado vs participación (grupos con 1,4% o más)
const colorGrupo = Object.fromEntries(G.map(g => [g.nombre, cc(g.cat)]));
const grupos = Object.keys({ ...op, ...ow })
  .filter(g => Math.max(op[g] || 0, ow[g] || 0) >= 1.4)
  .sort((x, y) => (ow[y] || 0) - (ow[x] || 0));
dumbbell('#c1', grupos.map(g => ({ label: g, a: op[g] || 0, b: ow[g] || 0, color: colorGrupo[g] })), { w: 520 });

// c2: origen del dueño en cada fecha
const FECHAS = { '2020-12': 'dic-2020', '2023-12': 'dic-2023', '2025-12': 'dic-2025', '2026-10': 'oct-2026' };
const filasFecha = Object.keys(FECHAS).map(f => ({
  key: f,
  label: FECHAS[f],
  parts: ORDEN.map(c => ({ key: c, value: catFoto(f, [c]), color: cc(c) })).filter(p => p.value > 0),
}));
apiladas('#c2', filasFecha, { w: 520 });

// c3: libro contable en USD
const COLOR_LADO = { entra: '#9A7B4F', adentro: '#333', sale: '#5B7C99' };
const conUsd = DIN.libro.filter(i => i.usd);
barras('#c3', conUsd.map(i => ({
  label: i.etiqueta,
  value: i.usd,
  color: COLOR_LADO[i.lado],
  text: fmt.musd(i.usd),
})), { w: 520, labelW: 190 });

// c4: reparto del barril
const C = { neuquen: '#2F6DB5', nacion: '#8FB5DE', empresa: '#B9B9B4' };
const REGIMENES = [['int', 'Mercado interno'], ['exp', 'Exportación'], ['rigi', 'RIGI']];
const filasBarril = REGIMENES.map(([r, label]) => ({
  key: r,
  label,
  parts: ['neuquen', 'nacion', 'empresa'].map(p => ({ key: p, value: b[r][p] / b[r].fob * 100, color: C[p] })),
}));
apiladas('#c4', filasBarril, { w: 520, labelW: 120 });
leyenda('#c4', [
  { label: 'Neuquén', color: C.neuquen },
  { label: 'Nación', color: C.nacion },
  { label: 'Empresa (costos + inversión + ganancia)', color: C.empresa },
]);

// c5: quema / gas por área
const tc = s => s.toLowerCase()
  .replace(/(^|\s)\S/g, a => a.toUpperCase())
  .replace(/\b(Ii|Iii|Iv)\b/g, w => w.toUpperCase());
barras('#c5', META.quema_ratio_area.slice(0, 8).map(r => ({
  label: tc(r.area),
  value: r.pct,
  color: '#E8782A',
  text: num(r.pct, 0) + '%',
})), { w: 520, labelW: 190, row: 19 });

// avisa a Playwright que ya terminó de dibujar
document.body.dataset.listo = '1';
