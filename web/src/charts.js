// Gráficos chicos del panel, hechos con d3. Cada función recibe un elemento
// (o selector) y una lista de filas, y agrega un <svg> adentro.
import * as d3 from 'd3';
import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyJustify } from 'd3-sankey';

// formato argentino: miles con punto y decimales con coma ("1,234.5" -> "1.234,5")
export const es = s => String(s).replace(/,/g, '§').replace(/\./g, ',').replace(/§/g, '.');
export const num = (v, d = 0) => es(d3.format(`,.${d}f`)(v));

export const fmt = {
  n0: d3.format(',.0f'),
  n1: d3.format(',.1f'),
  pct: v => d3.format('.1f')(v).replace('.', ',') + '%',
  musd: v => 'US$ ' + es(d3.format(',.0f')(v / 1e6)) + ' M',
  mmusd: v => 'US$ ' + es(d3.format(',.1f')(v / 1e9)) + ' mil M',
};

function svgBox(el, w, h) {
  return d3.select(el)
    .append('svg')
    .attr('viewBox', `0 0 ${w} ${h}`)
    .attr('width', '100%')
    .attr('role', 'img');
}


// Barras horizontales. data: [{label, value, color, text}]
export function barras(el, data, { w = 400, row = 22, labelW = 150, max } = {}) {
  const h = data.length * row + 6;
  const svg = svgBox(el, w, h);

  const maximo = max ?? (d3.max(data, d => d.value) || 1);
  // dejo 100 px a la derecha para el texto del valor
  const x = d3.scaleLinear().domain([0, maximo]).range([0, w - labelW - 100]);

  const g = svg.selectAll('g')
    .data(data)
    .join('g')
    .attr('transform', (d, i) => `translate(0,${i * row + 3})`);

  g.append('text')
    .attr('x', labelW - 6)
    .attr('y', row / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'end')
    .attr('class', 'lbl')
    .text(d => d.label);

  g.append('rect')
    .attr('x', labelW)
    .attr('y', 3)
    .attr('height', row - 8)
    .attr('width', d => Math.max(1, x(d.value)))
    .attr('fill', d => d.color || '#777')
    .attr('rx', 2);

  g.append('text')
    .attr('x', d => labelW + x(d.value) + 5)
    .attr('y', row / 2)
    .attr('dy', '0.35em')
    .attr('class', 'val')
    .text(d => d.text);

  return svg;
}


// Dos valores por fila unidos por una línea (operado vs participación).
// data: [{label, a, b, color}]. a = círculo vacío, b = círculo lleno.
export function dumbbell(el, data, {
  w = 400, row = 24, labelW = 120, aLabel = 'Operado', bLabel = 'Por participación',
} = {}) {
  const h = data.length * row + 34;
  const svg = svgBox(el, w, h);

  const max = d3.max(data, d => Math.max(d.a, d.b));
  const x = d3.scaleLinear().domain([0, max * 1.05]).range([labelW, w - 95]);

  // referencias arriba
  const ref = svg.append('g').attr('transform', 'translate(0,10)');
  ref.append('circle').attr('cx', labelW).attr('r', 4).attr('fill', 'white').attr('stroke', '#333');
  ref.append('text').attr('x', labelW + 8).attr('dy', '0.35em').attr('class', 'lbl').text(aLabel);
  ref.append('circle').attr('cx', labelW + 90).attr('r', 5).attr('fill', '#333');
  ref.append('text').attr('x', labelW + 99).attr('dy', '0.35em').attr('class', 'lbl').text(bLabel);

  const g = svg.selectAll('g.r')
    .data(data)
    .join('g')
    .attr('class', 'r')
    .attr('transform', (d, i) => `translate(0,${i * row + 30})`);

  g.append('text')
    .attr('x', labelW - 8)
    .attr('y', row / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'end')
    .attr('class', 'lbl')
    .text(d => d.label);

  g.append('line')
    .attr('x1', d => x(d.a))
    .attr('x2', d => x(d.b))
    .attr('y1', row / 2)
    .attr('y2', row / 2)
    .attr('stroke', d => d.color)
    .attr('stroke-width', 3)
    .attr('opacity', 0.6);

  g.append('circle')
    .attr('cx', d => x(d.a))
    .attr('cy', row / 2)
    .attr('r', 4.5)
    .attr('fill', 'white')
    .attr('stroke', d => d.color)
    .attr('stroke-width', 2);

  g.append('circle')
    .attr('cx', d => x(d.b))
    .attr('cy', row / 2)
    .attr('r', 5.5)
    .attr('fill', d => d.color);

  g.append('text')
    .attr('x', d => x(Math.max(d.a, d.b)) + 9)
    .attr('y', row / 2)
    .attr('dy', '0.35em')
    .attr('class', 'val')
    .text(d => `${num(d.a, 1)} → ${num(d.b, 1)}`);

  return svg;
}


// Barras apiladas al 100%. rows: [{key, label, parts: [{key, value, color}]}]
// Si se pasa `sel`, la fila con esa key queda resaltada y el resto más clara.
export function apiladas(el, rows, { w = 400, row = 30, labelW = 80, sel } = {}) {
  const h = rows.length * row + 4;
  const svg = svgBox(el, w, h);
  const x = d3.scaleLinear().domain([0, 100]).range([labelW, w - 4]);

  rows.forEach((r, i) => {
    const apagada = sel && sel !== r.key;
    const g = svg.append('g')
      .attr('transform', `translate(0,${i * row + 2})`)
      .attr('opacity', apagada ? 0.55 : 1);

    g.append('text')
      .attr('x', labelW - 8)
      .attr('y', row / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('class', 'lbl' + (sel === r.key ? ' sel' : ''))
      .text(r.label);

    let acumulado = 0;
    r.parts.forEach(p => {
      const x0 = x(acumulado);
      const x1 = x(acumulado + p.value);
      acumulado += p.value;

      g.append('rect')
        .attr('x', x0)
        .attr('width', Math.max(0, x1 - x0 - 0.5))
        .attr('y', 3)
        .attr('height', row - 8)
        .attr('fill', p.color)
        .append('title')
        .text(`${p.key}: ${num(p.value, 1)}%`);

      // el porcentaje adentro solo si entra
      if (x1 - x0 > 30) {
        g.append('text')
          .attr('x', (x0 + x1) / 2)
          .attr('y', row / 2)
          .attr('dy', '0.35em')
          .attr('text-anchor', 'middle')
          .attr('class', 'in')
          .text(num(p.value, 0) + '%');
      }
    });
  });

  return svg;
}


// Leyenda de puntos de color. items: [{label, color}]
export function leyenda(el, items) {
  const d = d3.select(el).append('div').attr('class', 'leyenda');
  items.forEach(i => {
    const s = d.append('span');
    s.append('i').style('background', i.color);
    s.append('span').text(i.label);
  });
}


// Diagrama de Sankey (d3-sankey).
// nodos: [{id, label, sub, color}]; links: [{source: id, target: id, value}]
// Las etiquetas van a la derecha de cada nodo; `margenDer` deja lugar para las de la última columna.
// `titulos`: un título por columna (opcional), arriba del diagrama.
export function sankey(el, nodos, links, { w = 400, h = 320, margenDer = 140, titulos = [], fmtValor = v => v } = {}) {
  const svg = svgBox(el, w, h);

  const generador = d3Sankey()
    .nodeId(d => d.id)
    .nodeAlign(sankeyJustify)
    .nodeWidth(10)
    .nodePadding(14)
    .nodeSort(null)
    .extent([[1, titulos.length ? 22 : 6], [w - margenDer, h - 6]]);

  // d3-sankey modifica los objetos: le paso copias
  const grafo = generador({
    nodes: nodos.map(n => ({ ...n })),
    links: links.map(l => ({ ...l })),
  });
  const ultimaColumna = d3.max(grafo.nodes, n => n.depth);

  // títulos de columna, alineados con el borde izquierdo de cada columna
  titulos.forEach((titulo, columna) => {
    const n = grafo.nodes.find(d => d.depth === columna);
    if (!n) return;
    svg.append('text')
      .attr('class', 'val')
      .attr('x', n.x0)
      .attr('y', 11)
      .text(titulo);
  });

  // bandas
  svg.append('g')
    .attr('fill', 'none')
    .selectAll('path')
    .data(grafo.links)
    .join('path')
    .attr('d', sankeyLinkHorizontal())
    // las bandas que llegan a la última columna toman el color de su destino
    .attr('stroke', d => (d.target.depth === ultimaColumna ? d.target.color : d.source.color))
    .attr('stroke-opacity', 0.3)
    .attr('stroke-width', d => Math.max(1, d.width))
    .append('title')
    .text(d => `${d.source.label} → ${d.target.label}: ${fmtValor(d.value)}`);

  // nodos
  const nodo = svg.append('g')
    .selectAll('g')
    .data(grafo.nodes)
    .join('g');

  nodo.append('rect')
    .attr('x', d => d.x0)
    .attr('y', d => d.y0)
    .attr('width', d => d.x1 - d.x0)
    .attr('height', d => Math.max(1, d.y1 - d.y0))
    .attr('fill', d => d.color);

  const texto = nodo.append('text')
    .attr('class', 'lbl')
    .attr('x', d => d.x1 + 6)
    .attr('y', d => (d.y0 + d.y1) / 2)
    // borde blanco alrededor de las letras para que se lean sobre las bandas
    .attr('paint-order', 'stroke')
    .attr('stroke', 'white')
    .attr('stroke-width', 3);

  texto.append('tspan')
    .attr('font-weight', 600)
    .attr('dy', d => (d.sub ? '-0.25em' : '0.35em'))
    .text(d => d.label);
  texto.append('tspan')
    .attr('x', d => d.x1 + 6)
    .attr('dy', '1.15em')
    .text(d => d.sub || '');

  return svg;
}
