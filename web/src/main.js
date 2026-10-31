// Explorador: mapa (MapLibre + deck.gl) a la izquierda y panel con pasos a la derecha.
//   datos.js  -> carga los JSON
//   estado.js -> qué está elegido (S)
//   pasos.js  -> texto y gráficos de cada paso
//   main.js   -> mapa, tooltip, controles, navegación y fichas
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, GeoJsonLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import { PathStyleExtension, FillStyleExtension } from '@deck.gl/extensions';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-50m.json';
import './style.css';
import { UI, hex2rgb, VIOLETA, NEUTRO, ROJO } from './theme.js';
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
const BLANCO = [...UI.borde_pozo, 170]; // borde fino de los pozos (oscuro, sobre mapa oscuro)

function rellenoPozo(p) {
  // el punto siempre muestra al operador; el dueño se ve en el sombreado del área
  return hex2rgb(colorDe(p.op));
}

const APAGADO = [120, 128, 145, 30]; // pozos que no pasan el filtro

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
      return [...hex2rgb(colorDe(fo[0][0])), 110];
    },
    getLineColor: f => {
      const resaltada = S.hover?.tipo === 'areas' && S.hover.i === f.properties.i;
      return resaltada ? [255, 255, 255, 230] : [...UI.area, 110];
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
    getLineColor: f => (esPetroleo(f) ? COLOR_PETROLEO : COLOR_GAS),
    // el Perito Moreno es un ducto principal: va más grueso
    getLineWidth: f => (esPeritoMoreno(f) ? ANCHO_PRINCIPAL : 1.6),
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

// ---------- rayas del segundo dueño ----------
// Los dueños son de cada área, así que el segundo dueño se muestra en el área:
// rayas diagonales de su color, más gruesas cuanto mayor es su parte.
// Las rayas se dibujan una vez en un canvas chico (el "atlas") y deck.gl las repite.
const LADO = 16;
const GROSORES = { fino: 2, medio: 4, grueso: 7 };

function atlasRayas() {
  const c = document.createElement('canvas');
  c.width = LADO * 3;
  c.height = LADO;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  Object.values(GROSORES).forEach((grosor, i) => {
    ctx.save();
    ctx.translate(i * LADO, 0);
    ctx.beginPath();
    ctx.rect(0, 0, LADO, LADO);
    ctx.clip();
    // tres diagonales para que el dibujo empalme al repetirse
    ctx.lineWidth = grosor;
    ctx.strokeStyle = '#fff';
    [-LADO, 0, LADO].forEach(d => {
      ctx.beginPath();
      ctx.moveTo(d, LADO);
      ctx.lineTo(d + LADO, 0);
      ctx.stroke();
    });
    ctx.restore();
  });
  return c.toDataURL();
}

const ATLAS_RAYAS = atlasRayas();
const MAPA_RAYAS = {
  fino: { x: 0, y: 0, width: LADO, height: LADO, mask: true },
  medio: { x: LADO, y: 0, width: LADO, height: LADO, mask: true },
  grueso: { x: LADO * 2, y: 0, width: LADO, height: LADO, mask: true },
};

// segundo dueño del área en la fecha elegida: [grupo, parte] o null (menos de 10%: no se marca)
function segundoDelArea(f) {
  const fo = f.properties.fotos?.[S.foto];
  if (!fo || fo.length < 2 || fo[1][1] < 0.1) return null;
  return fo[1];
}

function grosorRayas(parte) {
  if (parte < 0.25) return 'fino';
  if (parte < 0.4) return 'medio';
  return 'grueso';
}

function zoomActual() {
  return map.getZoom();
}

function capaRayas() {
  const conSegundo = areasGJ.features.filter(f => segundoDelArea(f) !== null);
  return new GeoJsonLayer({
    id: 'areas-rayas',
    data: conSegundo,
    pickable: false,
    stroked: false,
    filled: true,
    getFillColor: f => [...hex2rgb(colorDe(segundoDelArea(f)[0])), 175],
    fillPatternAtlas: ATLAS_RAYAS,
    fillPatternMapping: MAPA_RAYAS,
    fillPatternMask: true,
    getFillPattern: f => grosorRayas(segundoDelArea(f)[1]),
    // la trama se escala con el zoom para que en pantalla siempre se vea igual
    getFillPatternScale: 1.6 * Math.pow(2, 7.4 - zoomActual()),
    getFillPatternOffset: [0, 0],
    extensions: [new FillStyleExtension({ pattern: true })],
    updateTriggers: {
      getFillColor: [S.foto, S.color],
      getFillPattern: [S.foto],
      getFillPatternScale: [Math.round(zoomActual() * 4)],
    },
  });
}

function capasQuema() {
  const radioMax = pantallaAngosta() ? 11 : 20;
  const rq = d3.scaleSqrt().domain([0, d3.max(quema, q => q.vol)]).range([2, radioMax]);
  const halo = new ScatterplotLayer({
    id: 'quema-halo',
    data: quema,
    radiusUnits: 'pixels',
    getPosition: q => [q.lon, q.lat],
    // halo grande y transparente: da el efecto de brillo
    getRadius: q => rq(q.vol) * 2.2,
    getFillColor: [...UI.quema, 50],
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
    getFillColor: [...UI.quema, 225],
    getLineColor: [255, 196, 176, 255],
    getLineWidth: 0.8,
  });
  return [halo, puntos];
}

// Ductos nacionales (fuera de Neuquén) y la ruta de la arena.
// Mismo estilo que los ductos de la provincia (continuo = petróleo, punteado = gas),
// pero en violeta para distinguirlos. La arena va con puntos cortos.
// un color por producto; los ductos principales (nacionales) van más gruesos
const COLOR_PETROLEO = [215, 220, 232, 230];
const COLOR_GAS = [...UI.ducto_gas, 235];
const COLOR_ARENA = [214, 186, 130, 230];
const ANCHO_PRINCIPAL = 4;
const colorProducto = p => (p === 'arena' ? COLOR_ARENA : p === 'gas' ? COLOR_GAS : COLOR_PETROLEO);

// El gasoducto Perito Moreno ya viene completo (hasta Salliqueló) en la capa de Neuquén:
// no se dibuja otra vez; ese tramo se pinta con el color de los ductos nacionales.
const esPeritoMoreno = f => (f.properties.n || '').includes('PERITO');

// estos nodos quedan muy pegados a otros y no llevan etiqueta
const NODOS_SIN_NOMBRE = ['anelo', 'allen', 'tratayen', 'puesto_hernandez'];

// ángulo de la línea en pantalla, sin dar vuelta el texto
function anguloLinea(f) {
  const [a, b] = f.camino;
  let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  return ang;
}

function capasFlujos() {
  const flujos = META.flujos.map(f => ({
    ...f,
    a: nodos[f.desde],
    b: nodos[f.hasta],
  }));
  flujos.forEach(f => { f.camino = [[f.a.lon, f.a.lat], [f.b.lon, f.b.lat]]; });

  const lineas = new PathLayer({
    id: 'flujos',
    data: flujos.filter(f => f.id !== 'perito_moreno'),
    pickable: true,
    getPath: f => f.camino,
    getColor: f => colorProducto(f.producto),
    getWidth: ANCHO_PRINCIPAL,
    widthUnits: 'pixels',
    capRounded: true,
  });
  // La capacidad de cada ducto va debajo del nombre de su destino, en horizontal.
  // Oldelval: Allen queda pegado a Añelo, así que su capacidad va con Puerto Rosales
  // (la cifra es de todo el sistema Añelo–Allen–Puerto Rosales).
  const capacidadEn = {};
  flujos.filter(f => f.capacidad !== '').forEach(f => {
    let nodo = f.hasta;
    if (f.id === 'oldelval') nodo = 'puerto_rosales';
    if (f.producto === 'arena') nodo = f.desde; // la arena sale de Ibicuy
    const texto = f.id === 'oldelval' ? 'Oldelval: 530.000 bbl/día' : f.capacidad;
    capacidadEn[nodo] = texto;
  });

  const etiquetas = new TextLayer({
    id: 'nodos',
    data: META.nodos.filter(n => !NODOS_SIN_NOMBRE.includes(n.id)),
    getPosition: n => [n.lon, n.lat],
    getText: n => (capacidadEn[n.id] ? `${n.nombre}\n${capacidadEn[n.id]}` : n.nombre),
    getSize: 12,
    getColor: [237, 228, 214],
    // los destinos del oeste (Chile) van con el texto a la izquierda, para no tapar la cuenca
    getTextAnchor: n => (n.lon < -70 ? 'end' : 'start'),
    getAlignmentBaseline: 'center',
    getPixelOffset: n => (n.lon < -70 ? [-8, 0] : [8, 0]),
    lineHeight: 1.3,
    background: true,
    getBackgroundColor: [26, 20, 22, 230],
    backgroundPadding: [6, 4],
    fontFamily: 'Inter, system-ui, sans-serif',
    characterSet: 'auto',
    parameters: { depthCompare: 'always', depthWriteEnabled: false },
  });
  return [lineas, etiquetas];
}

function capas() {
  const L = [];
  if (S.capas.areas) L.push(capaAreas());
  // la capa "Ductos" incluye los de Neuquén y los nacionales
  if (S.capas.ductos) L.push(capaDuctos(), ...capasFlujos());
  L.push(capaPozos());
  if (S.capas.quema) L.push(...capasQuema());
  return L;
}

function render() {
  llenarFiltros();
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
    ? `Sombreado del área: dueño principal (${FOTOS[S.foto]}) · punto: operador`
    : 'Color: operador 2025';
  if (S.color === 'cat') color += ' · por origen del capital';
  if (S.color === 'grupo') color += ' · por empresa';
  // en el paso de la quema los pozos van en gris para que se lea el rojo
  if (S.color === 'neutro') color = 'Pozos de Vaca Muerta';

  const titulo = document.createElement('div');
  titulo.className = 'lt';
  titulo.textContent = color;
  el.appendChild(titulo);

  if (S.color === 'neutro') {
    const items = [{ label: 'Pozo', color: NEUTRO }];
    if (S.capas.quema) items.push({ label: 'Antorcha (satélite)', color: ROJO });
    leyenda(el, items);
  } else if (S.color === 'cat') {
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
  if (S.capas.ductos) {
    leyenda(el, [
      { label: 'Petróleo', color: '#D7DCE8' },
      { label: 'Gas', color: '#6EA5EB' },
      { label: 'Arena', color: '#D6BA82' },
    ]);
    const nota = document.createElement('div');
    nota.className = 'lt m';
    nota.textContent = 'Línea gruesa: ducto o ruta principal (nacional)';
    el.appendChild(nota);
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


document.getElementById('tam').addEventListener('change', e => {
  S.tam = e.target.value;
  render();
});

// filtros: las opciones salen de la lista de grupos
const selEmp = document.getElementById('fEmp');
const selPais = document.getElementById('fPais');
// Los filtros solo ofrecen empresas y países que tienen pozos en el mapa con la vista actual:
// en "Operador", los que operan algún pozo que produjo en 2025; en "Dueños", los dueños (dic-2025).
let vistaFiltros = null;
function llenarFiltros() {
  if (vistaFiltros === S.view) return;
  vistaFiltros = S.view;
  const enMapa = new Set();
  pozosVis.filter(p => p.pet25 + p.gas25 > 0).forEach(p => {
    if (S.view === 'dueno') duenosDe(p).forEach(([gi]) => enMapa.add(gi));
    else enMapa.add(p.op);
  });
  const grupos = G.filter(g => enMapa.has(g.i)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const paises = [...new Set(grupos.map(g => g.pais).filter(Boolean))].sort();

  selEmp.length = 1;
  grupos.forEach(g => selEmp.add(new Option(g.nombre, g.nombre)));
  selPais.length = 1;
  paises.forEach(pais => selPais.add(new Option(pais, pais)));

  // si lo elegido ya no está en la lista, se saca el filtro
  if (!grupos.some(g => g.nombre === S.filtro.emp)) S.filtro.emp = '';
  if (!paises.includes(S.filtro.pais)) S.filtro.pais = '';
}
selEmp.addEventListener('change', () => {
  S.filtro.emp = selEmp.value;
  render();
  zoomAlFiltro();
});
selPais.addEventListener('change', () => {
  S.filtro.pais = selPais.value;
  render();
  zoomAlFiltro();
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

// acerca el mapa a los pozos que pasan el filtro; sin filtro, vuelve a la vista del paso
function zoomAlFiltro() {
  if (!hayFiltro()) {
    const v = PASOS[S.paso].mapa.vista;
    map.flyTo({ ...v, zoom: v.zoom - (pantallaAngosta() ? 0.9 : 0), duration: 1000 });
    return;
  }
  const elegidos = pozosVis.filter(p => parteFiltro(p) > 0);
  if (!elegidos.length) return;
  const lons = elegidos.map(p => p.lon);
  const lats = elegidos.map(p => p.lat);
  const caja = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
  map.fitBounds(caja, { padding: 80, maxZoom: 10, duration: 1000 });
}

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
// al cambiar el zoom se rehacen las rayas (solo si se ven)

window.addEventListener('resize', () => map.resize());
