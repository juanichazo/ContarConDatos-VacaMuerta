// Explorador: mapa (MapLibre + deck.gl) a la izquierda y panel con pasos a la derecha.
//   datos.js  -> carga los JSON
//   estado.js -> qué está elegido (S)
//   pasos.js  -> texto y gráficos de cada paso
//   main.js   -> mapa, tooltip, controles, navegación y fichas
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, GeoJsonLayer, ArcLayer, TextLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-50m.json';
import './style.css';
import { UI, hex2rgb } from './theme.js';
import { leyenda, num, fmt } from './charts.js';
import {
  META, G, AP, PR, FOTOS, TOT, areasGJ, ductosGJ, pozosVis, quema, nodos,
  usdPozo, colorCat, colorGrupo,
} from './datos.js';
import {
  S, duenosDe, colorDe, VISTA_CUENCA, pantallaAngosta, hayFiltro, parteFiltro,
} from './estado.js';
import { PASOS } from './pasos.js';


// ---------- color y tamaño de los pozos ----------
const BLANCO = [255, 255, 255, 160];

function rellenoPozo(p) {
  const gi = S.view === 'dueno' ? duenosDe(p)[0][0] : p.op;
  return hex2rgb(colorDe(gi));
}

const APAGADO = [175, 175, 175, 35]; // pozos que no pasan el filtro

// en la vista "dueño", el segundo dueño (si tiene 20% o más) se dibuja como
// un anillo por fuera del círculo, así no tapa el color del dueño principal
function segundoDueno(p) {
  const d = duenosDe(p);
  if (d.length > 1 && d[1][1] >= 0.2) return d[1][0];
  return null;
}

function tamVal(p) {
  if (S.tam === 'gas') return p.gas25;
  if (S.tam === 'usd') return p.usd25;
  if (S.tam === 'arena') return p.arena || 0;
  return p.pet25;
}

let rScale;
function updScale() {
  const max = d3.max(pozosVis, tamVal) || 1;
  rScale = d3.scaleSqrt().domain([0, max]).range([1.6, S.tam === 'gas' ? 14 : 13]);
}


// ---------- mapa base ----------
// Fondo local con contornos de países, por si no hay conexión.
const paises = feature(world, world.objects.countries);
const estiloLocal = {
  version: 8,
  sources: { paises: { type: 'geojson', data: paises } },
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#DCE3E8' } },
    {
      id: 'paises',
      type: 'fill',
      source: 'paises',
      paint: {
        'fill-color': ['case', ['==', ['get', 'name'], 'Argentina'], '#F4F3EE', '#E9E8E2'],
        'fill-outline-color': '#B9BDB8',
      },
    },
  ],
};

const map = new maplibregl.Map({
  container: 'map',
  style: estiloLocal,
  ...VISTA_CUENCA,
  zoom: VISTA_CUENCA.zoom - (pantallaAngosta() ? 0.9 : 0),
  attributionControl: false,
  minZoom: 3,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
map.addControl(new maplibregl.AttributionControl({
  compact: true,
  customAttribution: 'Datos: Secretaría de Energía, Neuquén, Banco Mundial, IAE',
}));

// Si hay conexión, cambio al mapa de OpenFreeMap.
fetch('https://tiles.openfreemap.org/styles/positron')
  .then(r => (r.ok ? r.json() : Promise.reject()))
  .then(estilo => {
    map.setStyle(estilo);
    map.once('styledata', () => map.getStyle() && null);
    map.addControl(new maplibregl.AttributionControl({
      customAttribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © OpenMapTiles · Datos de OpenStreetMap',
    }));
  })
  .catch(() => {});

// pickingRadius: el mouse "agarra" líneas y puntos a hasta 6 px de distancia
const overlay = new MapboxOverlay({ interleaved: false, layers: [], pickingRadius: 6 });
map.addControl(overlay);


// ---------- capas de deck.gl ----------
function capaAreas() {
  return new GeoJsonLayer({
    id: 'areas',
    data: areasGJ,
    stroked: true,
    filled: true,
    pickable: true,
    getFillColor: f => {
      // solo se pintan en la vista "dueño", con el color del dueño principal
      if (S.view !== 'dueno') return [255, 255, 255, 0];
      const fo = f.properties.fotos?.[S.foto];
      if (!fo || !fo.length) return [255, 255, 255, 0];
      return [...hex2rgb(colorDe(fo[0][0])), 38];
    },
    getLineColor: f => {
      const resaltada = S.hover?.tipo === 'area' && S.hover.i === f.properties.i;
      return resaltada ? [20, 20, 20, 255] : [...UI.area, 110];
    },
    getLineWidth: 1,
    lineWidthUnits: 'pixels',
    updateTriggers: {
      getFillColor: [S.view, S.foto, S.color],
      getLineColor: [S.hover?.i],
    },
  });
}

// oleoductos: línea continua oscura; gasoductos: línea punteada de otro color,
// para que no se confundan con los bordes de las áreas
function capaDuctos() {
  const esPetroleo = f => f.properties.f === 'Petroleo';
  return new GeoJsonLayer({
    id: 'ductos',
    data: ductosGJ,
    pickable: true,
    lineWidthUnits: 'pixels',
    getLineColor: f => (esPetroleo(f) ? [...UI.ducto_pet, 220] : [...UI.ducto_gas, 230]),
    getLineWidth: f => (esPetroleo(f) ? 2.2 : 2),
    getDashArray: f => (esPetroleo(f) ? [0, 0] : [3, 2]),
    dashJustified: true,
    extensions: [new PathStyleExtension({ dash: true })],
  });
}

function capaPozos() {
  updScale();
  const disparadores = [S.view, S.foto, S.color, S.filtro.emp, S.filtro.pais];
  return new ScatterplotLayer({
    id: 'pozos',
    data: pozosVis,
    pickable: true,
    stroked: true,
    radiusUnits: 'pixels',
    lineWidthUnits: 'pixels',
    getPosition: p => [p.lon, p.lat],
    getRadius: p => rScale(tamVal(p)),
    // los pozos que no produjeron en 2025 van casi transparentes
    getFillColor: p => {
      if (parteFiltro(p) === 0) return APAGADO;
      return [...rellenoPozo(p), p.pet25 + p.gas25 > 0 ? 215 : 70];
    },
    getLineColor: p => {
      if (S.sel === p.id) return [0, 0, 0, 255];
      if (parteFiltro(p) === 0) return [0, 0, 0, 0];
      return BLANCO;
    },
    getLineWidth: p => (S.sel === p.id ? 2.5 : 0.4),
    updateTriggers: {
      getFillColor: disparadores,
      getLineColor: [...disparadores, S.sel],
      getLineWidth: [S.sel],
      getRadius: [S.tam],
    },
    transitions: { getRadius: 500, getFillColor: 400 },
  });
}

// anillo del segundo dueño (solo en la vista "dueño")
function capaSegundoDueno() {
  const conSegundo = pozosVis.filter(p => segundoDueno(p) !== null && parteFiltro(p) > 0);
  return new ScatterplotLayer({
    id: 'pozos-segundo',
    data: conSegundo,
    pickable: false,
    filled: false,
    stroked: true,
    radiusUnits: 'pixels',
    lineWidthUnits: 'pixels',
    getPosition: p => [p.lon, p.lat],
    // el anillo queda por fuera del círculo: radio + medio ancho de línea
    getRadius: p => rScale(tamVal(p)) + 0.5 + anchoAnillo(p) / 2,
    getLineWidth: anchoAnillo,
    getLineColor: p => [...hex2rgb(colorDe(segundoDueno(p))), 235],
    updateTriggers: {
      getRadius: [S.tam],
      getLineWidth: [S.tam],
      getLineColor: [S.foto, S.color],
    },
  });
}

// anillo más fino en los pozos chicos, para que no se coma el círculo
function anchoAnillo(p) {
  return Math.min(1.6, 0.5 + 0.18 * rScale(tamVal(p)));
}

function capasQuema() {
  const radioMax = pantallaAngosta() ? 11 : 20;
  const rq = d3.scaleSqrt().domain([0, d3.max(quema, q => q.vol)]).range([2, radioMax]);
  const halo = new ScatterplotLayer({
    id: 'quema-halo',
    data: quema,
    radiusUnits: 'pixels',
    getPosition: q => [q.lon, q.lat],
    getRadius: q => rq(q.vol) * 1.9,
    getFillColor: [...UI.quema, 45],
  });
  const puntos = new ScatterplotLayer({
    id: 'quema',
    data: quema,
    pickable: true,
    radiusUnits: 'pixels',
    stroked: true,
    lineWidthUnits: 'pixels',
    getPosition: q => [q.lon, q.lat],
    getRadius: q => rq(q.vol),
    getFillColor: [...UI.quema, 210],
    getLineColor: [120, 40, 0, 255],
    getLineWidth: 1,
  });
  return [halo, puntos];
}

// arcos del paso 4: de dónde viene la arena y a dónde va el petróleo y el gas
function colorFlujo(f) {
  if (f.producto === 'arena') return [176, 138, 80, 230];
  if (f.producto === 'gas') return [110, 110, 110, 220];
  return [25, 25, 25, 230];
}

// estos nodos quedan muy pegados a otros y no llevan etiqueta
const NODOS_SIN_NOMBRE = ['anelo', 'allen', 'tratayen', 'puesto_hernandez'];

function capasFlujos() {
  const flujos = META.flujos.map(f => ({
    ...f,
    a: nodos[f.desde],
    b: nodos[f.hasta],
  }));

  const arcos = new ArcLayer({
    id: 'flujos',
    data: flujos,
    pickable: true,
    getSourcePosition: f => [f.a.lon, f.a.lat],
    getTargetPosition: f => [f.b.lon, f.b.lat],
    getSourceColor: colorFlujo,
    getTargetColor: colorFlujo,
    // todas las líneas del mismo ancho: no hay datos medidos de cuánto pasa por cada una
    getWidth: 4,
    widthUnits: 'pixels',
    getHeight: 0.35,
    greatCircle: false,
  });
  const etiquetas = new TextLayer({
    id: 'nodos',
    data: META.nodos.filter(n => !NODOS_SIN_NOMBRE.includes(n.id)),
    getPosition: n => [n.lon, n.lat],
    getText: n => n.nombre,
    getSize: 12,
    getColor: [30, 30, 30],
    getTextAnchor: 'start',
    getPixelOffset: [6, 0],
    background: true,
    getBackgroundColor: [255, 255, 255, 200],
    fontFamily: 'system-ui, sans-serif',
    characterSet: 'auto',
  });
  // capacidad de cada ducto (de una fuente publicada) en la mitad de la línea
  const conNumero = flujos.filter(f => f.capacidad !== '');
  const numeros = new TextLayer({
    id: 'flujos-num',
    data: conNumero,
    getPosition: f => [(f.a.lon + f.b.lon) / 2, (f.a.lat + f.b.lat) / 2],
    getText: f => f.capacidad,
    getSize: 12,
    getColor: [20, 20, 20],
    fontWeight: 700,
    background: true,
    getBackgroundColor: [255, 255, 255, 235],
    backgroundPadding: [3, 1],
    fontFamily: 'system-ui, sans-serif',
    characterSet: 'auto',
    // que el texto quede siempre por encima de los arcos
    parameters: { depthCompare: 'always', depthWriteEnabled: false },
  });
  return [arcos, etiquetas, numeros];
}

function capas() {
  const L = [];
  if (S.capas.areas) L.push(capaAreas());
  if (S.capas.ductos) L.push(capaDuctos());
  L.push(capaPozos());
  if (S.view === 'dueno') L.push(capaSegundoDueno());
  if (S.capas.quema) L.push(...capasQuema());
  if (S.capas.flujos) L.push(...capasFlujos());
  return L;
}

function render() {
  overlay.setProps({ layers: capas(), getTooltip: null });
  leyendaMapa();
  syncControles();
}


// ---------- tooltip ----------
const tip = document.getElementById('tip');

overlay.setProps({
  onHover: info => {
    const o = info.object;
    S.hover = o ? { tipo: info.layer.id, i: o.properties?.i } : null;
    if (!o) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = tooltipHTML(info.layer.id, o);
    tip.hidden = false;
    const ancho = tip.parentElement.clientWidth;
    tip.style.left = Math.min(info.x + 14, ancho - 270) + 'px';
    tip.style.top = (info.y + 14) + 'px';
  },
  onClick: info => {
    if (info.layer?.id === 'pozos') {
      S.sel = info.object.id;
      ficha(info.object);
      render();
    } else if (info.layer?.id === 'areas') {
      fichaArea(info.object.properties);
    }
  },
});

// "12.345 bbl · 1,2 MMm³" o "US$ 3 M", según la unidad elegida
function valTxt(bbl, mmm3) {
  if (S.unit === 'usd') return fmt.musd(usdPozo(bbl, mmm3));
  return `${num(bbl || 0)} bbl · ${num(mmm3 || 0, 1)} MMm³`;
}

// "YPF 50% · Shell 50%" (con un decimal si el socio tiene menos de 10%)
function duenosTxt(fo) {
  return fo.map(([g, s]) => `${G[g].nombre} ${num(s * 100, s < 0.1 ? 1 : 0)}%`).join(' · ');
}

function tooltipHTML(capa, o) {
  const fecha = FOTOS[S.foto];

  if (capa === 'pozos') {
    return `<b>${o.sigla}</b><br>${AP[o.area]?.nombre ?? ''} · opera ${G[o.op].nombre}<br>`
      + `2025: ${valTxt(o.pet25, o.gas25)}<br>`
      + `<span class="m">Dueños (${fecha}): ${duenosTxt(duenosDe(o))}</span>`;
  }

  if (capa === 'areas') {
    const p = o.properties;
    const duenos = p.fotos[S.foto] ? duenosTxt(p.fotos[S.foto]) : '—';
    return `<b>${p.nombre}</b><br>${p.pozos} pozos VM · 2025: ${valTxt(p.pet25, p.gas25)}<br>`
      + `<span class="m">Dueños (${fecha}): ${duenos}</span>`;
  }

  if (capa === 'quema') {
    return `<b>Antorcha (VIIRS)</b><br>${o.campo || 'sin nombre'}<br>`
      + `2025: ${num(o.vol, 1)} millones de m³ quemados (estimación satelital)`;
  }

  if (capa === 'ductos') {
    return `<b>${o.properties.n || 'Ducto'}</b><br>${o.properties.f} · ${o.properties.op}`;
  }

  if (capa === 'flujos') {
    const capacidad = o.capacidad
      ? `${o.capacidad}${o.fuente_capacidad ? ` (${o.fuente_capacidad})` : ''}<br>`
      : '';
    return `<b>${o.etiqueta}</b><br>${capacidad}<span class="m">Trazado: ${o.fuente}</span>`;
  }

  return '';
}


// ---------- leyenda del mapa ----------
function leyendaMapa() {
  const el = document.getElementById('legend');
  el.innerHTML = '';

  let color = S.view === 'dueno'
    ? `Color: dueño principal (${FOTOS[S.foto]}); anillo: segundo dueño ≥20%`
    : 'Color: operador 2025';
  color += S.color === 'cat' ? ' · por origen del capital' : ' · por empresa';

  const titulo = document.createElement('div');
  titulo.className = 'lt';
  titulo.textContent = color;
  el.appendChild(titulo);

  if (S.color === 'cat') {
    const cats = META.categorias.filter(c => c !== 'Otros');
    leyenda(el, cats.map(c => ({ label: c, color: colorCat(c) })));
  } else {
    // solo las empresas que aparecen en el mapa, en orden alfabético
    const usados = new Set(pozosVis.map(p => (S.view === 'dueno' ? duenosDe(p)[0][0] : p.op)));
    const ordenados = [...usados].sort((a, b) => G[a].nombre.localeCompare(G[b].nombre));
    leyenda(el, ordenados.map(g => ({ label: G[g].nombre, color: colorGrupo(g) })));
  }

  let tam = 'petróleo 2025 (bbl)';
  if (S.tam === 'gas') tam = 'gas 2025 (MMm³)';
  if (S.tam === 'arena') tam = 'arena de fractura (t, todas las fracturas del pozo)';
  if (S.tam === 'usd') {
    tam = `valor 2025 (USD; petróleo a ${num(PR.pet_usd_bbl, 2)} USD/bbl, gas a ${num(PR.gas_usd_mmbtu, 1)} USD/MMBTU)`;
  }
  const tamano = document.createElement('div');
  tamano.className = 'lt m';
  tamano.textContent = `Tamaño: ${tam}`;
  el.appendChild(tamano);

  if (hayFiltro()) {
    const nombre = [S.filtro.emp, S.filtro.pais].filter(Boolean).join(' · ');
    let pet = 0;
    let pozosFiltro = 0;
    pozosVis.forEach(p => {
      const parte = parteFiltro(p);
      pet += p.pet25 * parte;
      if (parte > 0) pozosFiltro += 1;
    });
    const como = S.view === 'dueno' ? `por participación, dueños a ${FOTOS[S.foto]}` : 'como operador';
    const filtro = document.createElement('div');
    filtro.className = 'lt filtro';
    filtro.textContent = `${nombre}: ${num(pozosFiltro)} pozos, ${num(pet / TOT.pet * 100, 1)}% del petróleo 2025 (${como})`;
    el.appendChild(filtro);
  }
}


// ---------- controles ----------
// pone los botones y selectores según el estado S
function syncControles() {
  document.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('button').forEach(b => {
      b.setAttribute('aria-pressed', S[seg.dataset.ctl] === b.dataset.v);
    });
  });
  document.getElementById('foto').value = S.foto;
  document.getElementById('tam').value = S.tam;
  document.getElementById('fEmp').value = S.filtro.emp;
  document.getElementById('fPais').value = S.filtro.pais;
  document.querySelectorAll('[data-capa]').forEach(c => {
    c.checked = S.capas[c.dataset.capa];
  });
}

// botones segmentados: unidad, vista y color
document.querySelectorAll('.seg').forEach(seg => {
  seg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    S[seg.dataset.ctl] = b.dataset.v;
    // al cambiar de unidad, el tamaño de los pozos acompaña
    if (seg.dataset.ctl === 'unit') S.tam = S.unit === 'usd' ? 'usd' : 'pet';
    render();
    pintarPaso();
  });
});

document.getElementById('foto').addEventListener('change', e => {
  S.foto = e.target.value;
  render();
  pintarPaso();
});

document.getElementById('tam').addEventListener('change', e => {
  S.tam = e.target.value;
  render();
});

// filtros: las opciones salen de la lista de grupos
const selEmp = document.getElementById('fEmp');
const selPais = document.getElementById('fPais');
[...G].sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach(g => {
  selEmp.add(new Option(g.nombre, g.nombre));
});
[...new Set(G.map(g => g.pais).filter(Boolean))].sort().forEach(pais => {
  selPais.add(new Option(pais, pais));
});
selEmp.addEventListener('change', () => {
  S.filtro.emp = selEmp.value;
  render();
});
selPais.addEventListener('change', () => {
  S.filtro.pais = selPais.value;
  render();
});

document.querySelectorAll('[data-capa]').forEach(c => {
  c.addEventListener('change', () => {
    S.capas[c.dataset.capa] = c.checked;
    render();
  });
});


// ---------- navegación entre pasos ----------
const pasosNav = document.getElementById('pasos');
PASOS.forEach((p, i) => {
  const b = document.createElement('button');
  b.textContent = i + 1;
  b.title = p.t;
  b.onclick = () => irA(i);
  pasosNav.appendChild(b);
});

function irA(i, volar = true) {
  S.paso = Math.max(0, Math.min(PASOS.length - 1, i));
  S.sel = null;

  // cada paso define cómo queda el mapa
  const m = PASOS[S.paso].mapa;
  S.view = m.view;
  S.capas = { ...m.capas };
  if (m.foto) S.foto = m.foto;
  S.color = m.color || 'cat';
  // el paso de arena muestra los pozos por arena; al salir vuelve al tamaño normal
  if (m.tam) S.tam = m.tam;
  else if (S.tam === 'arena') S.tam = S.unit === 'usd' ? 'usd' : 'pet';

  if (volar) {
    map.flyTo({ ...m.vista, zoom: m.vista.zoom - (pantallaAngosta() ? 0.9 : 0), duration: 1200 });
  }
  render();
  pintarPaso();
}

function pintarPaso() {
  if (S.paso < 0) return;
  const p = PASOS[S.paso];
  document.getElementById('contenido').innerHTML = p.html();
  p.charts();

  pasosNav.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-current', i === S.paso));
  document.getElementById('pasoN').textContent = `${S.paso + 1} / ${PASOS.length}`;
  document.getElementById('prev').disabled = S.paso === 0;
  document.getElementById('next').disabled = S.paso === PASOS.length - 1;
}

document.getElementById('prev').onclick = () => irA(S.paso - 1);
document.getElementById('next').onclick = () => irA(S.paso + 1);


// ---------- fichas (clic en un pozo o en un área) ----------
const TIPOS = { P: 'Petrolífero', G: 'Gasífero', O: 'Otro' };

function ficha(p) {
  const a = AP[p.area];
  const d = duenosDe(p);
  const kgbbl = p.arena && p.pet12 ? p.arena * 1000 / p.pet12 : null;

  const fractura = p.frac
    ? `${p.frac} · ${num(p.etapas || 0)} etapas · rama ${num(p.rama || 0)} m`
    : 'sin dato en Adjunto IV';
  const insumos = p.arena ? `${num(p.arena)} t · ${num(p.agua || 0)} m³` : '—';
  let primerAnio = '—';
  if (p.pet12) {
    primerAnio = num(p.pet12) + ' bbl';
    if (kgbbl) primerAnio += ` · ${num(kgbbl, 1)} kg de arena por barril`;
  }

  document.getElementById('contenido').innerHTML = `<h2>Pozo ${p.sigla}</h2>
  <table class="libro">
    <tr><td>Área</td><td>${a?.nombre ?? '—'}</td></tr>
    <tr><td>Operador 2025</td><td>${G[p.op].nombre}</td></tr>
    <tr><td>Dueños (${FOTOS[S.foto]})</td><td>${duenosTxt(d)}</td></tr>
    <tr><td>Tipo</td><td>${TIPOS[p.tipo]}</td></tr>
    <tr><td>Primera producción</td><td>${p.ini ?? '—'}</td></tr>
    <tr><td>2025</td><td>${valTxt(p.pet25, p.gas25)}</td></tr>
    <tr><td>Acumulado</td><td>${valTxt(p.petAc, p.gasAc)}</td></tr>
    <tr><td>Fractura</td><td>${fractura}</td></tr>
    <tr><td>Arena / agua</td><td>${insumos}</td></tr>
    <tr><td>Petróleo primeros 12 meses</td><td>${primerAnio}</td></tr>
  </table>
  <p class="nota">Fuente: Capítulo IV y Adjunto IV (Secretaría de Energía); dueños: capa Areas de Neuquén + ventas curadas. <a href="#" id="volver">Volver al paso ${S.paso + 1}</a></p>`;

  document.getElementById('volver').onclick = e => {
    e.preventDefault();
    S.sel = null;
    render();
    pintarPaso();
  };
}

function fichaArea(a) {
  const filasDuenos = Object.keys(FOTOS)
    .map(f => `<tr><td>${FOTOS[f]}</td><td>${a.fotos[f] ? duenosTxt(a.fotos[f]) : '—'}</td></tr>`)
    .join('');

  document.getElementById('contenido').innerHTML = `<h2>${a.nombre}</h2>
  <table class="libro">
    <tr><td>Tipo</td><td>${a.tipo || '—'}</td></tr>
    <tr><td>Operador (capa Neuquén)</td><td>${a.operador || '—'}</td></tr>
    <tr><td>Vence</td><td>${a.fin || '—'}</td></tr>
    <tr><td>Pozos VM</td><td>${a.pozos}</td></tr>
    <tr><td>2025</td><td>${valTxt(a.pet25, a.gas25)}</td></tr>
    <tr><td>Quema 2025 (satélite)</td><td>${num(a.quema25 || 0, 1)} MMm³</td></tr>
  </table>
  <h3>Dueños por fecha</h3>
  <table class="libro">${filasDuenos}</table>
  <p class="nota">Participación oficial (capa Neuquén): ${a.participac || '—'}. <a href="#" id="volver">Volver al paso ${S.paso + 1}</a></p>`;

  document.getElementById('volver').onclick = e => {
    e.preventDefault();
    pintarPaso();
  };
}


// ---------- arranque ----------
// en el celular el menú de capas arranca cerrado
if (window.matchMedia('(max-width: 860px)').matches) {
  document.getElementById('capas').open = false;
}
map.on('load', () => irA(0, false));
window.addEventListener('resize', () => map.resize());
