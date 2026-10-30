// Estado de la web: qué está elegido en los controles y en qué paso estamos.
// render() en main.js lee esto para dibujar el mapa.
import { AP, G, colorCat, colorGrupo } from './datos.js';
import { NEUTRO } from './theme.js';

export const S = {
  unit: 'fis',          // 'fis' (unidades físicas) o 'usd'
  view: 'operador',     // color de los pozos: 'operador' o 'dueno'
  color: 'cat',         // 'cat' (origen del capital), 'grupo' (empresa) o 'neutro' (todos grises)
  foto: '2025-12',      // fecha de los dueños
  tam: 'pet',           // tamaño de los pozos: 'pet', 'gas', 'usd' o 'arena'
  filtro: { emp: '', pais: '' }, // '' = sin filtro
  capas: { areas: true, ductos: false, quema: false },
  paso: 0,
  sel: null,            // pozo seleccionado (id)
  hover: null,
};

export const VISTA_CUENCA = { center: [-68.95, -38.3], zoom: 7.4 };
export const VISTA_PAIS = { center: [-64.8, -37.6], zoom: 4.7 };

// en pantallas angostas el mapa arranca un poco más alejado
export const pantallaAngosta = () => window.innerWidth < 860;

// dueños del área del pozo en la fecha elegida: [[grupo, share], ...]
export function duenosDe(p) {
  const f = AP[p.area]?.fotos?.[S.foto];
  if (f && f.length) return f;
  return [[p.op, 1]];
}

export function colorDe(gi) {
  if (S.color === 'neutro') return NEUTRO;
  if (S.color === 'cat') return colorCat(G[gi].cat);
  return colorGrupo(gi);
}

// ---------- filtro por empresa / país ----------
export const hayFiltro = () => S.filtro.emp !== '' || S.filtro.pais !== '';

function grupoPasa(gi) {
  const g = G[gi];
  if (S.filtro.emp && g.nombre !== S.filtro.emp) return false;
  if (S.filtro.pais && g.pais !== S.filtro.pais) return false;
  return true;
}

// Qué parte del pozo le toca a las empresas del filtro (0 a 1).
// Vista operador: 1 si el operador pasa el filtro, 0 si no.
// Vista dueño: la suma de las participaciones de los dueños que pasan.
export function parteFiltro(p) {
  if (!hayFiltro()) return 1;
  if (S.view !== 'dueno') return grupoPasa(p.op) ? 1 : 0;
  let parte = 0;
  for (const [gi, share] of duenosDe(p)) {
    if (grupoPasa(gi)) parte += share;
  }
  return parte;
}
