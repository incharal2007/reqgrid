import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IncidentInput } from './types.js';

export type AgentLog = { agent: string; status: string; summary: string; details?: unknown; timestamp: string };
const log = (agent: string, summary: string, details?: unknown): AgentLog =>
  ({ agent, status: 'completed', summary, details, timestamp: new Date().toISOString() });

export async function ingestIncident(input: IncidentInput) {
  let extracted: any = {
    title: input.title.trim(), description: (input.description || '').trim(),
    incidentType: input.incidentType, urgency: input.urgency,
    peopleAffected: input.peopleAffected, locationLabel: input.locationLabel.trim(),
    lat: input.lat, lon: input.lon, sourceMode: input.sourceMode || 'USER_REPORTED'
  };
  let mode = 'RULE_BASED';
  if (process.env.GEMINI_API_KEY && input.description?.trim()) {
    try {
      const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = client.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
      });
      const response = await model.generateContent(
        `Extract a concise summary and possible resource needs from this report. Do not invent facts. Return JSON only with keys summary, possibleNeeds (array), uncertainty (array). The submitted fields are authoritative; do not change coordinates or urgency. Mark inferred items as possible. Report: ${JSON.stringify(input)}`
      );
      const text = response.response.text();
      extracted.aiInterpretation = JSON.parse(text);
      mode = 'GEMINI_ASSISTED';
    } catch (e) {
      extracted.aiInterpretation = { summary: 'AI extraction unavailable; using submitted report.', possibleNeeds: [], uncertainty: ['LLM call failed or returned invalid JSON.'] };
    }
  }
  return { data: extracted, log: log('Incident Ingestion Agent', 'Validated report fields and prepared a structured incident record.', { mode }) };
}

export function assessImpact(incident: any, weather: any | null, nearbyIncidents: any[]) {
  const urgencyFactor = incident.urgency * 6;
  const peopleFactor = Math.min(incident.peopleAffected, 100) * 0.25;
  const typeFactor = incident.incidentType === 'Building collapse' ? 18 : incident.incidentType === 'Flood' ? 12 : incident.incidentType === 'Fire' ? 14 : incident.incidentType === 'Medical' ? 14 : 6;
  const clusterFactor = Math.min(nearbyIncidents.length, 10) * 1.5;
  const weatherRain = Number(weather?.current?.rain ?? weather?.current?.precipitation ?? 0);
  const weatherFactor = incident.incidentType === 'Flood' ? Math.min(weatherRain * 1.5, 8) : 0;
  const score = Math.max(1, Math.min(100, Math.round(urgencyFactor + peopleFactor + typeFactor + clusterFactor + weatherFactor)));
  const factors = [
    { factor: 'Reported urgency', contribution: urgencyFactor },
    { factor: 'People affected', contribution: Number(peopleFactor.toFixed(1)) },
    { factor: 'Incident type', contribution: typeFactor },
    { factor: 'Nearby reports', contribution: Number(clusterFactor.toFixed(1)) },
    { factor: 'Weather context', contribution: Number(weatherFactor.toFixed(1)) }
  ];
  return {
    needScore: score,
    priority: score >= 75 ? 'Critical' : score >= 55 ? 'High' : score >= 30 ? 'Moderate' : 'Low',
    factors,
    caveat: 'Prototype decision-support score, not a validated clinical or official emergency triage score.',
    log: log('Geospatial Impact Assessment Agent', 'Calculated a transparent prototype priority score from submitted facts and available context.', { score, factors })
  };
}

export function recommendResources(incident: any, resources: any[], needScore: number) {
  const requiredTypes: Record<string, string[]> = {
    'Flood': ['Rescue team', 'Transport', 'Shelter beds', 'Water kits', 'Food kits'],
    'Fire': ['Rescue team', 'Medical team', 'Ambulance'],
    'Medical': ['Ambulance', 'Medical team'],
    'Building collapse': ['Rescue team', 'Medical team', 'Ambulance'],
    'Earthquake': ['Rescue team', 'Medical team', 'Shelter beds', 'Food kits', 'Water kits'],
    'Road blockage': ['Rescue team', 'Transport'],
    'Other': ['Rescue team', 'Medical team']
  };
  const needed = requiredTypes[incident.incidentType] || requiredTypes.Other;
  const ranked = resources
    .filter((r: any) => Number(r.quantity_available) > 0 && needed.includes(r.resource_type))
    .map((r: any) => {
      const distanceKm = haversine(incident.lat, incident.lon, Number(r.lat), Number(r.lon));
      const freshnessHours = r.last_verified_at ? (Date.now() - new Date(r.last_verified_at).getTime()) / 3600000 : 9999;
      const freshnessPenalty = freshnessHours > 24 ? 15 : freshnessHours > 6 ? 7 : 0;
      const score = Math.max(0, 100 - Math.min(distanceKm * 2, 60) - freshnessPenalty + (r.verified ? 5 : 0));
      return { ...r, distanceKm: Number(distanceKm.toFixed(2)), recommendationScore: Number(score.toFixed(1)), freshnessHours: Number(freshnessHours.toFixed(1)), fit: needed.includes(r.resource_type) ? 'Suitable type' : 'Not matched' };
    }).sort((a: any, b: any) => b.recommendationScore - a.recommendationScore);
  return {
    needScore,
    candidates: ranked.slice(0, 8),
    unmetNeed: ranked.length === 0,
    explanation: ranked.length ? 'Candidates are ranked using resource-type fit, straight-line distance, verification status and data freshness. Road travel time and capacity constraints are not yet optimized.' : 'No matching available resource found in the current inventory. Add verified providers or widen the search area.',
    log: log('Resource Allocation Agent', `Ranked ${ranked.length} suitable available resource candidates.`, { candidateCount: ranked.length })
  };
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, toRad = (x: number) => x * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
