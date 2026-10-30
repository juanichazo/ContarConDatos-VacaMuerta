// Los 8 pasos del panel derecho. Cada paso tiene:
//   t:      título corto (tooltip del botón)
//   mapa:   cómo se pone el mapa al entrar al paso
//   html:   texto del panel (se recalcula cuando cambia un control)
//   charts: dibuja los gráficos dentro de los <div> que dejó html
import * as d3 from 'd3';
import { barras, dumbbell, apiladas, barriles, iconos, leyenda, sankey, num, fmt } from './charts.js';
import { AZUL, VIOLETA, ROJO } from './theme.js';
import {
  META, DIN, PR, R, AP, TOT, VAL, FOTOS, EXT, libro, gIdx, porArea, porFoto, shareCat, colorCat,
} from './datos.js';
import { S, colorDe, VISTA_CUENCA, VISTA_PAIS } from './estado.js';

const SOLO_AREAS = { areas: true, ductos: false, quema: false };

// resaltado de cifras en el texto (azul, violeta o rojo)
const az = t => `<span class="m-az">${t}</span>`;
const vi = t => `<span class="m-vi">${t}</span>`;
const ro = t => `<span class="m-ro">${t}</span>`;

// % operado y % por participación de cada grupo, en la fecha elegida
function operadoYDueno() {
  const op = Object.fromEntries(R.operado.map(r => [r.grupo, r.pet]));
  const ow = Object.fromEntries(porFoto(S.foto).map(r => [r.grupo, r.pet_own]));
  return { op, ow };
}


// ---------- 1. Producción por área ----------
const produccion = {
  t: 'Pozos y producción 2025',
  mapa: { view: 'operador', capas: SOLO_AREAS, vista: VISTA_CUENCA },

  html: () => {
    const usd = S.unit === 'usd';
    const top = [...porArea].sort((a, b) => b.pet - a.pet);
    const top3 = d3.sum(top.slice(0, 3), d => d.pet) / TOT.pet * 100;

    const total = usd
      ? `${az(fmt.mmusd(VAL.pet))} en petróleo y ${vi(fmt.mmusd(VAL.gas))} en gas`
      : `${az(num(TOT.pet / 1e6, 1) + ' MMbbl')} de petróleo y ${vi(num(TOT.gas / 1e3, 1) + ' bcm')} de gas`;
    const titulo = usd
      ? 'Valor de la producción 2025 por área, USD'
      : 'Petróleo 2025 por área, millones de barriles';
    const precios = usd
      ? `Petróleo a ${num(PR.pet_usd_bbl, 2)} USD/bbl (precio implícito de exportación 2025, IAE) y gas a ${num(PR.gas_usd_mmbtu, 1)} USD/MMBTU.`
      : '';

    return `<h2>Pozos y producción 2025</h2>
      <p class="dato">${num(DIN.kpi.pozos_activos)} pozos de Vaca Muerta produjeron en 2025: ${total}.</p>
      <p class="dato">${top.slice(0, 3).map(d => d.nombre).join(', ')}: ${az(num(top3, 0) + '%')} del petróleo.</p>
      <h3>${titulo} (10 primeras)</h3>
      <div class="ch" id="ch1"></div>
      <p class="nota">Fuente: Capítulo IV (Secretaría de Energía), filtro formación = Vaca Muerta. ${precios}</p>`;
  },

  charts: () => {
    const usd = S.unit === 'usd';
    const top = [...porArea]
      .sort((a, b) => (usd ? b.usd - a.usd : b.pet - a.pet))
      .slice(0, 10);
    const filas = top.map(d => ({
      label: d.nombre,
      value: usd ? d.usd : d.pet,
      color: AZUL,
      text: usd ? fmt.musd(d.usd) : num(d.pet / 1e6, 1),
    }));
    barras('#ch1', filas, { labelW: 190 });
  },
};


// ---------- 2. Operador vs dueño ----------
const operadorDueno = {
  t: 'Operador y dueño',
  mapa: { view: 'dueno', capas: SOLO_AREAS, vista: VISTA_CUENCA, foto: '2025-12' },

  html: () => {
    const { op, ow } = operadoYDueno();
    const graficoUsd = S.unit === 'usd'
      ? `<h3>Valor de la producción que le corresponde a cada grupo, USD (petróleo + gas)</h3><div class="ch" id="ch2b"></div>`
      : '';

    return `<h2>Operador y dueño</h2>
      <p class="dato">Chevron opera ${az(num(op.Chevron, 1) + '%')} del petróleo de 2025 y le corresponde ${vi(num(ow.Chevron, 1) + '%')} por participación.</p>
      <p class="dato">YPF opera ${az(num(op.YPF, 1) + '%')} y le corresponde ${vi(num(ow.YPF, 1) + '%')}. Vista: ${az(num(op.Vista, 1) + '%')} → ${vi(num(ow.Vista, 1) + '%')}.</p>
      <h3>Petróleo 2025, % del total: operado vs por participación (dueños a ${FOTOS[S.foto]})</h3>
      <div class="ch" id="ch2"></div>
      ${graficoUsd}
      <p class="nota">Operado: lo que cada empresa declara como operadora (Capítulo IV). Por participación: producción de cada área × porcentaje de cada socio (capa Areas de Neuquén, corregida con las ventas 2024–2026; ver data/curated/historia_propiedad.csv). En el mapa, el sombreado de cada área es su dueño principal y el color de cada pozo, su operador. El reparto completo entre socios aparece al pasar el mouse por el área.</p>`;
  },

  charts: () => {
    const { op, ow } = operadoYDueno();

    // grupos con al menos 1,4% operado o por participación
    const grupos = [...new Set([...Object.keys(op), ...Object.keys(ow)])]
      .filter(g => Math.max(op[g] || 0, ow[g] || 0) >= 1.4)
      .sort((a, b) => (ow[b] || 0) - (ow[a] || 0));
    const filas = grupos.map(g => ({
      label: g,
      a: op[g] || 0,
      b: ow[g] || 0,
      color: colorDe(gIdx[g]),
    }));
    dumbbell('#ch2', filas);

    if (S.unit === 'usd') {
      const enUsd = porFoto(S.foto)
        .map(r => ({ g: r.grupo, usd: r.pet_own / 100 * VAL.pet + r.gas_own / 100 * VAL.gas }))
        .sort((a, b) => b.usd - a.usd)
        .slice(0, 10);
      const barrasUsd = enUsd.map(r => ({
        label: r.g,
        value: r.usd,
        color: colorDe(gIdx[r.g]),
        text: fmt.musd(r.usd),
      }));
      barras('#ch2b', barrasUsd, { labelW: 130 });
    }
  },
};


// ---------- 3. Cambios de dueño ----------
const ORDEN_CAT = ['Argentina', 'Mixto', 'EE.UU.', 'Europa', 'Asia y Medio Oriente', 'Latinoamérica'];

const cambiosDueno = {
  t: 'Cambios de dueño 2020–2026',
  mapa: { view: 'dueno', capas: SOLO_AREAS, vista: VISTA_CUENCA },

  html: () => {
    const ext20 = shareCat('2020-12', EXT);
    const ext26 = shareCat('2026-10', EXT);
    const mix20 = shareCat('2020-12', ['Mixto']);
    const mix26 = shareCat('2026-10', ['Mixto']);
    const arg20 = shareCat('2020-12', ['Argentina']);
    const arg26 = shareCat('2026-10', ['Argentina']);

    return `<h2>Cambios de dueño 2020–2026</h2>
      <p class="dato">Mismo petróleo (el de 2025), distintos dueños. Con los dueños de dic-2020, empresas con sede fuera de Argentina tenían ${ro(num(ext20, 1) + '%')}; con los de oct-2026, ${ro(num(ext26, 1) + '%')}.</p>
      <p class="dato">Capital argentino: ${az(num(arg20, 1) + '%')} → ${az(num(arg26, 1) + '%')}. Vista y PAE (gestión argentina, capital mixto): ${vi(num(mix20, 1) + '%')} → ${vi(num(mix26, 1) + '%')}.</p>
      <h3>Petróleo 2025 por origen del dueño, según la fecha, %</h3>
      <div class="ch" id="ch3"></div>
      <h3>Ventas que explican el cambio</h3>
      <ul class="tx">
        <li><b>dic-2024</b> ExxonMobil → Pluspetrol (Bajo del Choique, Los Toldos I Sur y II Oeste, Pampa de las Yeguas I)</li>
        <li><b>ene-2025</b> ExxonMobil y QatarEnergy → YPF (Sierra Chata, 54,45%)</li>
        <li><b>abr-2025</b> Petronas → Vista (La Amarga Chica, 50%)</li>
        <li><b>ago-2025</b> TotalEnergies → YPF (La Escalonada y Rincón La Ceniza, 45%)</li>
        <li><b>sep-2025</b> Pluspetrol → GeoPark (Loma Jarillosa Este, Puesto Silva Oeste)</li>
        <li><b>nov-2025</b> Pluspetrol → Continental Resources, EE.UU. (Los Toldos II Oeste, 90%)</li>
        <li><b>may-2026</b> Equinor → Vista (Bandurria Sur 30%, Bajo del Toro Norte 50%); PAE → Continental (18–20% en tres áreas)</li>
      </ul>
      <p class="nota">Clasificación: Vista (sede legal en México) y PAE (BP 50% + Bridas) van como "mixto"; Tecpetrol (Techint) como argentina. Con otro criterio los porcentajes cambian; ver reports/controles_propiedad.md.</p>`;
  },

  charts: () => {
    // una barra por fecha, partida por categoría
    const filas = Object.keys(FOTOS).map(f => {
      const partes = ORDEN_CAT
        .map(c => ({ key: c, value: shareCat(f, [c]), color: colorCat(c) }))
        .filter(p => p.value > 0);
      return { key: f, label: FOTOS[f], parts: partes };
    });
    apiladas('#ch3', filas, { sel: S.foto });
    leyenda('#ch3', ORDEN_CAT.map(c => ({ label: c, color: colorCat(c) })));
  },
};


// ---------- 4. A dónde va el valor de la producción ----------
const COLOR_SANKEY = {
  arena: '#C7801F',
  inversion: '#E7B866',
  vm: '#222',
  petroleo: AZUL,
  gas: '#9DB8E8',
  exp: '#2C56A8',
  int: '#7FA3DD',
};

// arma los nodos y bandas del Sankey, todo en USD de 2025
function datosSankey() {
  const pet = libro.petroleo.usd;
  const gas = libro.gas.usd;

  // parte exportada (supuesto: el mismo % que toda la Cuenca Neuquina)
  const petExp = pet * libro.pet_export.fisico / libro.petroleo.fisico;
  const gasExp = gas * libro.gas_export.fisico / libro.gas.fisico;
  const petInt = pet - petExp;
  const gasInt = gas - gasExp;
  const exp = petExp + gasExp;
  const int = petInt + gasInt;
  const total = pet + gas;

  const regalias = libro.regalias.usd;
  const inversion = libro.inversion.usd;
  // la arena es parte de la inversión (se paga al completar cada pozo)
  const arena = libro.arena.usd;
  const otraInversion = inversion - arena;

  const fis = S.unit !== 'usd';
  const nodos = [
    // 1. lo que entra
    { id: 'arena', label: 'Arena', sub: fmt.musd(arena), color: COLOR_SANKEY.arena },
    { id: 'inversion', label: 'Otra inversión', sub: fmt.musd(otraInversion), color: COLOR_SANKEY.inversion },
    // 2. Vaca Muerta
    { id: 'vm', label: 'Vaca Muerta', sub: '', color: COLOR_SANKEY.vm },
    // 3. lo que sale
    { id: 'petroleo', label: 'Petróleo', sub: fis ? `${num(libro.petroleo.fisico / 1e6, 1)} M bbl` : fmt.musd(pet), color: COLOR_SANKEY.petroleo },
    { id: 'gas', label: 'Gas', sub: fis ? `${num(libro.gas.fisico / 1e9, 1)} mil M m³` : fmt.musd(gas), color: COLOR_SANKEY.gas },
    // 4. a dónde va
    { id: 'exp', label: 'Exportación', sub: fmt.musd(exp), color: COLOR_SANKEY.exp },
    { id: 'int', label: 'Mercado interno', sub: fmt.musd(int), color: COLOR_SANKEY.int },
  ];

  // Lo que entra (inversión) y lo que sale (valor de la producción) no tienen
  // por qué ser iguales: la barra de Vaca Muerta mide lo que sale y las bandas
  // de entrada ocupan solo una parte.
  const links = [
    { source: 'arena', target: 'vm', value: arena },
    { source: 'inversion', target: 'vm', value: otraInversion },
    { source: 'vm', target: 'petroleo', value: pet },
    { source: 'vm', target: 'gas', value: gas },
    { source: 'petroleo', target: 'exp', value: petExp },
    { source: 'petroleo', target: 'int', value: petInt },
    { source: 'gas', target: 'exp', value: gasExp },
    { source: 'gas', target: 'int', value: gasInt },
  ];

  return { nodos, links, pet, gas, total, regalias, arena, inversion };
}

const libroContable = {
  t: 'Qué entra, qué sale y a dónde va',
  mapa: { view: 'operador', capas: { areas: false, ductos: true, quema: false }, vista: VISTA_PAIS },

  html: () => {
    const d = datosSankey();

    return `<h2>Qué entra, qué sale y a dónde va, 2025</h2>
      <p class="dato">En 2025 entraron ${vi(fmt.musd(d.inversion))} de inversión (${fmt.musd(d.arena)} solo en arena) y salieron ${az(fmt.musd(d.total))} en petróleo y gas.</p>
      <p class="dato">El ${num(d.pet / d.total * 100, 0)}% del valor es petróleo. De lo producido, las regalías a Neuquén fueron ${fmt.musd(d.regalias)}: el ${az(num(d.regalias / d.total * 100, 1) + '%')}.</p>
      <h3>Millones de USD de 2025</h3>
      <div class="ch" id="ch4"></div>
      <p class="nota">Entra: inversión 2025 prevista según el IAE Mosconi; la arena (Adjunto IV × US$ 145/t puesta en pozo) se toma como parte de esa inversión. La inversión de un año produce durante muchos años, así que entrada y salida no se restan: sirven para ver el tamaño de cada una. Sale: producción del Capítulo IV × ${num(PR.pet_usd_bbl, 2)} USD/bbl y ${num(PR.gas_usd_mmbtu, 1)} USD/MMBTU. A dónde va: se aplica a Vaca Muerta el % exportado de toda la Cuenca Neuquina (IAE: 29,4% del petróleo y 5,5% del gas); es un supuesto, no un dato de Vaca Muerta. Regalías: IAE. Mapa: trazados esquemáticos; cada línea muestra la capacidad publicada del ducto, no cuánto pasó por él.</p>`;
  },

  charts: () => {
    const d = datosSankey();
    sankey('#ch4', d.nodos, d.links, { w: 420, h: 330, margenDer: 105, titulos: ['ENTRA', '', 'SALE', 'A DÓNDE VA'], fmtValor: fmt.musd });
  },
};


// ---------- 5. Reparto del barril ----------
const COLOR_BARRIL = { neuquen: AZUL, nacion: VIOLETA, empresa: '#DCD9D0' };
const PARTES_BARRIL = ['neuquen', 'nacion', 'empresa'];
const REGIMENES = [['int', 'Mercado interno'], ['exp', 'Exportación'], ['rigi', 'RIGI']];

const barril = {
  t: 'Reparto de cada barril',
  mapa: { view: 'operador', capas: SOLO_AREAS, vista: VISTA_CUENCA },

  html: () => {
    const b = DIN.barril;
    // parte del Estado (Neuquén + Nación) en %
    const estado = r => (b[r].neuquen + b[r].nacion) / b[r].fob * 100;
    const titulo = S.unit === 'usd'
      ? 'USD por cada 1.000 barriles (FOB US$ 80.500)'
      : 'Barriles equivalentes de cada 1.000';
    const regaliasPct = 1450e6 / (VAL.pet + VAL.gas) * 100;

    return `<h2>Reparto de cada 1.000 barriles según destino y régimen</h2>
      <p class="dato">Estado (Neuquén + Nación): ${az(num(estado('int'), 1) + '%')} si el barril va al mercado interno, ${az(num(estado('exp'), 1) + '%')} si se exporta y ${az(num(estado('rigi'), 1) + '%')} si el proyecto está en el RIGI.</p>
      <p class="dato">A Neuquén le deja más el mercado interno (US$ ${num(b.int.neuquen)}); a la Nación, la exportación (US$ ${num(b.exp.nacion)}).</p>
      <h3>${titulo}</h3>
      <div class="ch" id="ch5"></div>
      <p class="nota">Fuente: modelo del Ministerio de Economía de Neuquén (Brent US$ 85, FOB US$ 80,5), vía El Economista, 13/8/2026. Es el escenario de una de las partes; el informe original no está publicado. La parte de la empresa incluye costos, inversión y ganancia, sin desagregar. En 2025, las regalías de Vaca Muerta fueron ~US$ 1.450 M según el IAE: ${num(regaliasPct, 1)}% del valor de la producción calculado acá.</p>`;
  },

  charts: () => {
    const b = DIN.barril;
    const filas = REGIMENES.map(([k, label]) => ({
      key: k,
      label,
      parts: PARTES_BARRIL.map(p => ({
        key: p,
        value: b[k][p] / b[k].fob * 100,
        color: COLOR_BARRIL[p],
        texto: p === 'neuquen' ? '#fff' : '#222',
      })),
    }));
    barriles('#ch5', filas);
    leyenda('#ch5', [
      { label: 'Neuquén', color: COLOR_BARRIL.neuquen },
      { label: 'Nación', color: COLOR_BARRIL.nacion },
      { label: 'Empresa (costos + inversión + ganancia)', color: COLOR_BARRIL.empresa },
    ]);

    // tabla con los valores exactos
    const tabla = d3.select('#ch5').append('table').attr('class', 'libro');
    filas.forEach(r => {
      const tr = tabla.append('tr');
      tr.append('td').text(r.label);
      PARTES_BARRIL.forEach(p => {
        const v = b[r.key][p];
        const texto = S.unit === 'usd' ? 'US$ ' + num(v) : num(v / b[r.key].fob * 1000) + ' bbl';
        tr.append('td').attr('class', 'r').text(texto);
      });
    });
    tabla.insert('tr', ':first-child').html('<th></th><th>Neuquén</th><th>Nación</th><th>Empresa</th>');
  },
};


// ---------- 6. Arena y agua ----------
const PILETA_OLIMPICA_M3 = 2500; // 50 × 25 × 2 m

// 3.6 -> "×3,6"
const veces = v => '×' + num(v, 1);

const arenaAgua = {
  t: 'Arena y agua de fractura',
  mapa: { view: 'operador', capas: SOLO_AREAS, vista: VISTA_CUENCA, tam: 'arena' },

  html: () => {
    const serie = META.fractura_anual;
    const ini = serie[0];
    const fin = serie[serie.length - 1];

    const camiones = libro.camiones.fisico;
    const piletas = fin.agua_m3 / PILETA_OLIMPICA_M3;
    const masArena = (fin.arena_t / fin.pozos) / (ini.arena_t / ini.pozos) * 100 - 100;
    const masAgua = (fin.agua_m3 / fin.pozos) / (ini.agua_m3 / ini.pozos) * 100 - 100;

    const costo = S.unit === 'usd'
      ? `<p class="dato">Puesta en el pozo, esa arena costó ${fmt.musd(libro.arena.usd)} (US$ ${num(DIN.precios.arena_usd_t)} por tonelada; en la cantera vale US$ 22).</p>`
      : '';

    return `<h2>Arena y agua de fractura ${fin.anio}</h2>
      <p class="dato">${num(fin.pozos)} pozos fracturados en ${fin.anio} usaron ${vi(num(fin.arena_t / 1e6, 1) + ' millones de toneladas')} de arena y ${az(num(fin.agua_m3 / 1e6, 1) + ' millones de m³')} de agua.</p>
      <p class="dato">La arena equivale a ${num(camiones)} viajes de camión de 38 t, ${num(camiones / 365)} por día. Con el agua se llenan ${num(piletas)} piletas olímpicas.</p>
      ${costo}
      <p class="dato">Desde ${ini.anio} los pozos fracturados se multiplicaron por ${num(fin.pozos / ini.pozos, 1)}, pero la arena por ${num(fin.arena_t / ini.arena_t, 1)}: cada pozo usa ${vi(num(masArena, 0) + '% más arena')} y ${az(num(masAgua, 0) + '% más agua')} que en ${ini.anio}.</p>
      <h3>${fin.anio} comparado con ${ini.anio}: cada ícono es lo que se usó en ${ini.anio}</h3>
      <div class="ch" id="ch6"></div>
      <h3>Por pozo fracturado</h3>
      <div class="ch" id="ch6b"></div>
      <p class="nota">Fuente: Adjunto IV (Secretaría de Energía), fracturas con inicio en cada año, sin duplicados de carga. Camiones: arena ÷ 38 t por viaje (${libro.camiones.fuente}). Pileta olímpica: 50 × 25 × 2 m = 2.500 m³. En el mapa, el tamaño de cada pozo es la arena de todas sus fracturas.</p>`;
  },

  charts: () => {
    const serie = META.fractura_anual;
    const ini = serie[0];
    const fin = serie[serie.length - 1];

    const filas = [
      { label: 'Pozos fracturados', value: fin.pozos / ini.pozos, icono: 'pozo', color: '#8A877E' },
      { label: 'Etapas de fractura', value: fin.etapas / ini.etapas, icono: 'etapa', color: '#8A877E' },
      { label: 'Arena (camiones)', value: fin.arena_t / ini.arena_t, icono: 'camion', color: VIOLETA },
      { label: 'Agua', value: fin.agua_m3 / ini.agua_m3, icono: 'gota', color: AZUL },
    ];
    iconos('#ch6', filas);

    // tabla: arena, agua y etapas por pozo en el primer y el último año
    const porPozo = [
      ['Arena (t)', a => a.arena_t / a.pozos],
      ['Agua (m³)', a => a.agua_m3 / a.pozos],
      ['Etapas', a => a.etapas / a.pozos],
    ];
    const tabla = d3.select('#ch6b').append('table').attr('class', 'libro');
    tabla.append('tr').html(`<th></th><th>${ini.anio}</th><th>${fin.anio}</th><th>Cambio</th>`);
    porPozo.forEach(([nombre, calc]) => {
      const tr = tabla.append('tr');
      tr.append('td').text(nombre);
      tr.append('td').attr('class', 'r').text(num(calc(ini)));
      tr.append('td').attr('class', 'r').text(num(calc(fin)));
      tr.append('td').attr('class', 'r').text('+' + num(calc(fin) / calc(ini) * 100 - 100, 0) + '%');
    });
  },
};


// ---------- 7. Quema ----------
// valor en USD de un volumen de gas en millones de m³
const usdGas = mmm3 => mmm3 * 1e6 * PR.gas_mmbtu_m3 * PR.gas_usd_mmbtu;

// áreas ordenadas por gas quemado en 2025
function areasPorQuema() {
  return AP
    .filter(a => a.quema25 > 0)
    .sort((a, b) => b.quema25 - a.quema25);
}

const quema = {
  t: 'Quema de gas',
  mapa: { view: 'operador', capas: { areas: true, ductos: true, quema: true }, vista: VISTA_CUENCA, color: 'neutro' },

  html: () => {
    const s = META.quema_serie.find(r => r.Year === META.anio);
    const top = areasPorQuema()[0];

    const valor = S.unit === 'usd'
      ? ` A ${num(PR.gas_usd_mmbtu, 1)} USD/MMBTU, ese gas valía ${ro(fmt.musd(usdGas(s.vol_mm3)))}.`
      : '';

    return `<h2>Gas quemado en antorchas, ${META.anio}</h2>
      <p class="dato">En ${META.anio} se quemaron ${ro(num(s.vol_mm3) + ' millones de m³')} de gas en antorchas cerca de pozos de Vaca Muerta.${valor}</p>
      <p class="dato">El área que más quemó fue ${top.nombre}: ${ro(num(top.quema25, 1) + ' millones de m³')}.</p>
      <h3>Gas quemado por área, ${S.unit === 'usd' ? 'millones de USD' : 'millones de m³'} (12 primeras)</h3>
      <div class="ch" id="ch7"></div>
      <p class="nota">Quema: Banco Mundial (Global Flare Monitoring) a partir del satélite VIIRS. No es un dato declarado por las empresas: el satélite mide de noche el calor de cada antorcha y el Banco Mundial lo convierte en volumen. Cada antorcha se asigna al área del pozo de Vaca Muerta más cercano (a menos de 3 km); puede incluir instalaciones convencionales. Ductos de la capa de Neuquén (solo dentro de la provincia).</p>`;
  },

  charts: () => {
    const usd = S.unit === 'usd';
    const filas = areasPorQuema().slice(0, 12).map(a => {
      return {
        label: a.nombre,
        value: usd ? usdGas(a.quema25) : a.quema25,
        color: ROJO,
        text: usd ? fmt.musd(usdGas(a.quema25)) : num(a.quema25, 1),
      };
    });
    barras('#ch7', filas, { labelW: 180 });
  },
};


// ---------- 8. Datos que faltan ----------
const faltantes = {
  t: 'Datos que faltan',
  mapa: { view: 'operador', capas: SOLO_AREAS, vista: VISTA_CUENCA },

  html: () => `<h2>Datos que faltan o no son públicos</h2>
      <ul class="tx">
        <li>Cuánto de la parte "empresa" del barril es costo, inversión o ganancia: no hay datos abiertos por área.</li>
        <li>Dividendos y utilidades giradas al exterior por empresa: solo hay un total del sector.</li>
        <li>Tránsito real de camiones de arena por ruta: solo estimaciones de la cámara del sector.</li>
        <li>Emisiones de gases de efecto invernadero por área: Neuquén las recibe desde sep-2026 y no las publica.</li>
        <li>Destino por país del petróleo de Vaca Muerta (solo hay datos de la cuenca o del país).</li>
        <li>Participaciones de cada socio vigentes día a día: la capa oficial no siempre refleja las ventas recientes.</li>
        <li>Fracturas de jun–sep 2026: todavía no están cargadas; por eso el año base es 2025.</li>
      </ul>
      <p class="nota">Explorá libremente: hacé clic en un pozo para ver su ficha o en un área para ver sus dueños.</p>`,

  charts: () => {},
};


export const PASOS = [
  produccion,
  operadorDueno,
  cambiosDueno,
  libroContable,
  barril,
  arenaAgua,
  quema,
  faltantes,
];
