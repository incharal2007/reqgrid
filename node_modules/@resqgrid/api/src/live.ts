const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

export async function getWeather(lat: number, lon: number) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,wind_speed_10m,wind_gusts_10m',
    hourly: 'precipitation_probability,precipitation,rain',
    forecast_days: '1', timezone: 'Asia/Kolkata'
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Weather source returned ${response.status}`);
  const data: any = await response.json();
  return {
    source: 'Open-Meteo',
    dataMode: 'LIVE_PUBLIC_API',
    lastUpdated: new Date().toISOString(),
    coordinates: { lat, lon },
    current: data.current,
    hourly: data.hourly ? {
      time: data.hourly.time?.slice(0, 8),
      precipitationProbability: data.hourly.precipitation_probability?.slice(0, 8),
      precipitation: data.hourly.precipitation?.slice(0, 8)
    } : null,
    note: 'Weather context only. This is not a verified emergency report or official warning.'
  };
}

export async function getFacilities(lat: number, lon: number, radius = 5000) {
  const query = `[out:json][timeout:20];(node["amenity"~"hospital|clinic|shelter|fire_station|police"](around:${radius},${lat},${lon});way["amenity"~"hospital|clinic|shelter|fire_station|police"](around:${radius},${lat},${lon});relation["amenity"~"hospital|clinic|shelter|fire_station|police"](around:${radius},${lat},${lon}););out center tags;`;
  const response = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'RESQGRID-student-prototype/0.1' },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(`OpenStreetMap Overpass returned ${response.status}`);
  const data: any = await response.json();
  return {
    source: 'OpenStreetMap Overpass API',
    dataMode: 'LIVE_PUBLIC_API',
    lastUpdated: new Date().toISOString(),
    note: 'Mapped facilities only; existence, opening status, capacity and emergency availability are not verified.',
    facilities: (data.elements || []).map((e: any) => ({
      id: `${e.type}/${e.id}`,
      name: e.tags?.name || e.tags?.['name:en'] || 'Unnamed facility',
      type: e.tags?.amenity || 'facility',
      lat: e.lat ?? e.center?.lat,
      lon: e.lon ?? e.center?.lon,
      address: [e.tags?.['addr:street'], e.tags?.['addr:city']].filter(Boolean).join(', ') || null
    })).filter((x: any) => Number.isFinite(x.lat) && Number.isFinite(x.lon)).slice(0, 100)
  };
}
