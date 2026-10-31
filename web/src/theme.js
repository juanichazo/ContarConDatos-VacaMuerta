// Colores. Todo el resto los lee de acá.
// Regla: azul primero, violeta segundo, rojo solo para la quema o cuando hace falta un tercer color.
export const AZUL = '#3D6CC4';
export const VIOLETA = '#F0A53A'; // ámbar (el nombre quedó por compatibilidad: es el segundo color)
export const ROJO = '#FF5638';   // quema (naranja brasa)
export const CARMIN = '#B3243A'; // capital con sede afuera
export const NEUTRO = '#7C879C'; // pozos cuando el tema del paso es otro (por ejemplo, la quema)

export const CAT_COLORS = {
  'Argentina': AZUL,
  'Mixto': VIOLETA,
  // capital con sede afuera: un color distinto por región
  'EE.UU.': CARMIN,
  'Europa': '#1F9E89',
  'Asia y Medio Oriente': '#7B52B9',
  'Latinoamérica': '#E89AA6',
  'Otros': '#8A8F94',
};

// Empresas: tonos dentro de la familia de color de su origen
export const GRUPO_COLORS = {
  // argentinas: azules
  'YPF': '#2C56A8', 'Pluspetrol': '#5B8FE0', 'Tecpetrol': '#8DB3F0', 'Pampa Energía': '#3F7FCF',
  'Capex': '#A9C6F2', 'GyP (Neuquén)': '#6C86B8', 'Otras argentinas': '#C2D4EE',
  // mixtas: ámbar
  'Vista': '#E8952A', 'PAE': '#F5C27A',
  // EE.UU.: rojos
  'Chevron': '#B3243A', 'ExxonMobil': '#D4566A', 'Continental Resources': '#E68A99', 'Dow': '#7E1A2E', 'ConocoPhillips': '#C9405A',
  // Europa: verdes azulados
  'Shell': '#1F9E89', 'TotalEnergies': '#157A6A', 'Equinor': '#6CC4B3', 'Harbour Energy': '#0F5C50', 'Wintershall Dea': '#0F5C50',
  'Phoenix': '#A8DDD2', 'Interoil': '#4DB3A0',
  // Asia y Medio Oriente: violetas
  'Petronas': '#5E3A99', 'QatarEnergy': '#9C7AD1',
  'GeoPark': '#E89AA6', 'Petrobras': '#DD8494',
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
