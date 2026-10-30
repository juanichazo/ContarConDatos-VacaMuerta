// Carga los JSON que genera scripts/07_export_web.py y arma las tablas que
// usa el resto de la web. Acá no hay nada de estado ni de DOM.
import * as d3 from 'd3';
import { CAT_COLORS, GRUPO_COLORS } from './theme.js';
import P from './data/pozos.json';
import AREAS from './data/areas.geojson?raw';
import AREAS_PROPS from './data/areas_props.json';
import DUCTOS from './data/ductos.geojson?raw';
import META_JSON from './data/meta.json';
import QUEMA from './data/quema.json';

export const META = META_JSON;

// "LOMA CAMPANA" -> "Loma Campana", "LA RIBERA I Y II" -> "La Ribera I y II"
export function tc(s) {
  return String(s)
    .toLowerCase()
    .replace(/(^|[\s(-])([a-záéíóúñ])/g, (a, b, c) => b + c.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y|El)\b/g, w => w.toLowerCase())
    .replace(/^./, c => c.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Vi|Vii)\b/g, w => w.toUpperCase());
}

export const areasGJ = JSON.parse(AREAS);
areasGJ.features.forEach(f => {
  f.properties.nombre = tc(f.properties.nombre);
});
export const ductosGJ = JSON.parse(DUCTOS);

export const G = META.grupos; // [{i, nombre, cat, pais}], se accede por índice
export const AP = AREAS_PROPS.map(a => ({ ...a, nombre: tc(a.nombre) })); // por índice de área
export const DIN = META.dinero;
export const PR = DIN.precios; // pet_usd_bbl, gas_usd_mmbtu, gas_mmbtu_m3
export const R = META.propiedad;

// valor en USD de una producción (barriles de petróleo, millones de m³ de gas)
export function usdPozo(bbl, mmm3) {
  const pet = (bbl || 0) * PR.pet_usd_bbl;
  const gas = (mmm3 || 0) * 1e6 * PR.gas_mmbtu_m3 * PR.gas_usd_mmbtu;
  return pet + gas;
}

// pozos.json viene por columnas; lo paso a una lista de objetos
export const pozos = P.id.map((id, i) => {
  const p = {
    id,
    i,
    sigla: P.sigla[i],
    lon: P.lon[i],
    lat: P.lat[i],
    area: P.area[i],
    op: P.op[i],
    tipo: P.tipo[i],
    ini: P.ini[i],
    ult: P.ult[i],
    pet25: P.pet25[i] || 0,
    gas25: P.gas25[i] || 0,
    petAc: P.petAc[i],
    gasAc: P.gasAc[i],
    pet26: P.pet26[i],
    arena: P.arena[i],
    agua: P.agua[i],
    etapas: P.etapas[i],
    rama: P.rama[i],
    frac: P.frac[i],
    pet12: P.pet12[i],
  };
  p.usd25 = usdPozo(p.pet25, p.gas25);
  return p;
});

// los 54 pozos que nunca produjeron no se dibujan
export const pozosVis = pozos.filter(p => p.ini);

export const quema = QUEMA.vol.map((vol, i) => ({
  lon: QUEMA.lon[i],
  lat: QUEMA.lat[i],
  vol,
  area: QUEMA.area[i],
  campo: QUEMA.campo[i],
}));

export const nodos = Object.fromEntries(META.nodos.map(n => [n.id, n]));
export const libro = Object.fromEntries(DIN.libro.map(l => [l.clave, l]));
export const gIdx = Object.fromEntries(G.map(g => [g.nombre, g.i]));

export const colorGrupo = gi => GRUPO_COLORS[G[gi].nombre] || CAT_COLORS[G[gi].cat] || '#888';
export const colorCat = c => CAT_COLORS[c] || '#888';

export const FOTOS = {
  '2020-12': 'dic-2020',
  '2023-12': 'dic-2023',
  '2025-12': 'dic-2025',
  '2026-10': 'oct-2026',
};

// categorías con sede fuera de Argentina
export const EXT = ['EE.UU.', 'Europa', 'Asia y Medio Oriente', 'Latinoamérica', 'Otros'];


// ---------- totales para el panel ----------
export const TOT = {
  pet: d3.sum(pozos, p => p.pet25),
  gas: d3.sum(pozos, p => p.gas25),
};
export const VAL = {
  pet: TOT.pet * PR.pet_usd_bbl,
  gas: TOT.gas * 1e6 * PR.gas_mmbtu_m3 * PR.gas_usd_mmbtu,
};

export const porArea = d3
  .rollups(
    pozos,
    v => ({ pet: d3.sum(v, p => p.pet25), gas: d3.sum(v, p => p.gas25) }),
    p => p.area,
  )
  .map(([a, v]) => ({ a, nombre: AP[a].nombre, ...v, usd: usdPozo(v.pet, v.gas) }));

export const porFoto = f => R.por_participacion.filter(r => r.foto === f);
export const catFoto = f => R.categoria_por_foto.filter(r => r.foto === f);

// % del petróleo (o gas, con k = 'gas_own') que tienen las categorías `cats` en la fecha f
export function shareCat(f, cats, k = 'pet_own') {
  const filas = catFoto(f).filter(r => cats.includes(r.cat));
  return d3.sum(filas, r => r[k]);
}
