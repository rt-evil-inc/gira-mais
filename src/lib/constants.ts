import { dev } from '$app/environment';

export const LOCK_DISTANCE_m = 35;
export const MIN_TRAVEL_DISTANCE_m = 20;

export const GIRA_AUTH_URL = 'https://login.emel.pt';
export const GIRA_API_URL = 'https://emel-consumerapp.vaimoo.com';
// VAIMOO tenant that scopes GIRA data in the shared Firestore project and API
export const GIRA_TENANT = 'P1/EML/EML/';

export const GIRA_MAIS_API_URL = dev ? '/__dev-proxy/gira-mais/api' : 'https://gira-mais.app/api';

export const ROUTING_API_URL = 'https://routing.gira-mais.app';
export const TILES_URL = 'https://tiles.gira-mais.app';
// Area covered by the routing/geocoding server (minLon,minLat,maxLon,maxLat)
export const ROUTING_BBOX = [-9.55, 38.55, -8.85, 38.95] as const;