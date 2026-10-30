// Colores. Todo el resto los lee de acá.
// Regla: azul primero, violeta segundo, rojo solo para la quema o cuando hace falta un tercer color.
export const AZUL = '#3D6CC4';
export const VIOLETA = '#8462C9';
export const ROJO = '#D0342C';
export const NEUTRO = '#7C879C'; // pozos cuando el tema del paso es otro (por ejemplo, la quema)

export const CAT_COLORS = {
  'Argentina': AZUL,
  'Mixto': VIOLETA,
  // capital con sede afuera: tonos de rojo
  'EE.UU.': ROJO,
  'Europa': '#E5806A',
  'Asia y Medio Oriente': '#982B3B',
  'Latinoamérica': '#F1B2A4',
  'Otros': '#8A8F94',
};

// Empresas: tonos dentro de la familia de color de su origen
export const GRUPO_COLORS = {
  // argentinas: azules
  'YPF': '#2C56A8', 'Pluspetrol': '#5B8FE0', 'Tecpetrol': '#8DB3F0', 'Pampa Energía': '#3F7FCF',
  'Capex': '#A9C6F2', 'GyP (Neuquén)': '#6C86B8', 'Otras argentinas': '#C2D4EE',
  // mixtas: violetas
  'Vista': '#7A55C2', 'PAE': '#B79BE6',
  // extranjeras: rojos
  'Chevron': '#C0312B', 'ExxonMobil': '#E26E62', 'Continental Resources': '#F2A39C', 'Dow': '#8F2420', 'ConocoPhillips': '#E8857E',
  'Shell': '#D9573E', 'TotalEnergies': '#B8452F', 'Equinor': '#F0B9A8', 'Harbour Energy': '#A33A2A', 'Wintershall Dea': '#A33A2A',
  'Phoenix': '#F6CFC4', 'Interoil': '#DA8C79',
  'Petronas': '#982B3B', 'QatarEnergy': '#C45A6A',
  'GeoPark': '#F1B2A4', 'Petrobras': '#E7998A',
};

// colores de la interfaz sobre el mapa oscuro
export const UI = {
  area: [150, 162, 190],
  quema: [255, 86, 56],
  ducto_pet: [215, 220, 232],
  ducto_gas: [110, 165, 235],
  flujo: [215, 220, 232],
  borde_pozo: [10, 14, 25],
};

export const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
