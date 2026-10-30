// Paleta PROVISORIA. Cambiar acá; todo el resto la lee de este archivo.
export const CAT_COLORS = {
  'Argentina': '#2F6DB5',
  'Mixto': '#8C62C4',
  'EE.UU.': '#D2453E',
  'Europa': '#E8A321',
  'Asia y Medio Oriente': '#11998E',
  'Latinoamérica': '#5E9E4E',
  'Otros': '#8A8F94',
};
// Empresas: tonos dentro de la familia de color de su origen
export const GRUPO_COLORS = {
  'YPF': '#1F4E8C', 'Pluspetrol': '#4D8FD6', 'Tecpetrol': '#7FB3E8', 'Pampa Energía': '#3A9BD1', 'Capex': '#9CC3EA', 'GyP (Neuquén)': '#5C7FA6', 'Otras argentinas': '#B5CDE6',
  'Vista': '#7B4FB8', 'PAE': '#B394DE',
  'Chevron': '#C0312B', 'ExxonMobil': '#E07067', 'Continental Resources': '#F2A39C', 'Dow': '#9E2A26', 'ConocoPhillips': '#E8857E',
  'Shell': '#E8A321', 'TotalEnergies': '#C9821A', 'Equinor': '#F2C76B', 'Harbour Energy': '#A86A12', 'Wintershall Dea': '#A86A12', 'Phoenix (Mercuria)': '#F5D99B', 'Interoil': '#D9B25C',
  'Petronas': '#11998E', 'QatarEnergy': '#4CC3B6',
  'GeoPark': '#5E9E4E', 'Petrobras': '#8CC27E',
};
export const UI = {
  bg: '#F4F5F2', panel: '#FFFFFF', ink: '#1B1E22', muted: '#5B636B', line: '#D5D9DC',
  area: [60, 70, 80], quema: [255, 120, 30], ducto_pet: [40, 40, 40], ducto_gas: [0, 140, 150], flujo: [30, 30, 30],
};
export const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
