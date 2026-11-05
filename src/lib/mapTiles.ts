/**
 * Mapa base. CARTO ya exige llave y pinta "API KEY REQUIRED" sobre el mapa; usamos los mosaicos
 * de OpenStreetMap y los oscurecemos con CSS (clase .tl-dark-tiles en index.css).
 */
export const BASE_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const BASE_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const BASE_TILE_CLASS = 'tl-dark-tiles';
