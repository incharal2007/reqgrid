import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { z } from 'zod';
import { query, pool } from './db.js';
import { getFacilities, getWeather } from './live.js';
import { assessImpact, ingestIncident, recommendResources } from './agents.js';

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
const port = Number(process.env.PORT || 4000);

const incidentSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(5000).optional().default(''),
  incidentType: z.enum(['Flood','Fire','Medical','Building collapse','Road blockage','Earthquake','Other']),
  urgency: z.number().int().min(1).max(10),
  peopleAffected: z.number().int().min(0).max(100000),
  locationLabel: z.string().min(2).max(250),
  lat: z.number().min(6).max(37),
  lon: z.number().min(68).max(98),
  sourceMode: z.enum(['LIVE_FEED','PROVIDER_REPORTED','USER_REPORTED','SIMULATION']).optional().default('USER_REPORTED')
});
const providerSchema = z.object({
  name: z.string().min(2).max(160),
  providerType: z.enum(['Hospital','Shelter','NGO','Rescue team','Food and water','Ambulance','Other']),
  lat: z.number().min(6).max(37), lon: z.number().min(68).max(98),
  resources: z.array(z.object({
    resourceType: z.enum(['Ambulance','Medical team','Shelter beds','Food kits','Water kits','Rescue team','Transport','Other']),
    quantityTotal: z.number().int().min(0).max(100000),
    quantityAvailable: z.number().int().min(0).max(100000)
  })).min(1)
});

app.get('/api/health', async (_req, res) => {
  let database = 'unavailable';
  try { await pool.query('SELECT 1'); database = 'connected'; } catch {}
  res.json({ status: 'ok', service: 'RESQGRID API', database, timestamp: new Date().toISOString() });
});

app.get('/api/overview', async (_req, res) => {
  try {
    const [incidents, providers, resources, allocations] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status NOT IN ('Resolved','Closed'))::int AS active, COUNT(*) FILTER (WHERE urgency >= 8 AND status NOT IN ('Resolved','Closed'))::int AS critical FROM incidents`),
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE verified)::int AS verified FROM providers`),
      query(`SELECT COALESCE(SUM(quantity_available),0)::int AS available FROM resources`),
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status IN ('Approved','Assigned','Accepted','En route'))::int AS active FROM allocations`)
    ]);
    res.json({ incidents: incidents[0], providers: providers[0], resources: resources[0], allocations: allocations[0], dataMode: 'DATABASE' });
  } catch (e: any) { res.status(503).json({ error: 'Database unavailable. Start PostGIS and run npm run db:init.', detail: e.message }); }
});

app.get('/api/incidents', async (_req, res) => {
  try {
    const rows = await query(`SELECT id,title,description,incident_type AS "incidentType",status,urgency,people_affected AS "peopleAffected",location_label AS "locationLabel",lat,lon,source_mode AS "sourceMode",verified,created_at AS "createdAt",updated_at AS "updatedAt" FROM incidents ORDER BY created_at DESC LIMIT 500`);
    res.json({ items: rows, lastUpdated: new Date().toISOString() });
  } catch (e: any) { res.status(503).json({ error: 'Could not load incidents.', detail: e.message }); }
});

app.post('/api/incidents', async (req, res) => {
  const parsed = incidentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid incident report.', issues: parsed.error.flatten() });
  try {
    const input = parsed.data;
    const ingested = await ingestIncident(input);
    const rows = await query(
      `INSERT INTO incidents (title,description,incident_type,urgency,people_affected,location_label,lat,lon,source_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id,title,description,incident_type AS "incidentType",status,urgency,people_affected AS "peopleAffected",location_label AS "locationLabel",lat,lon,source_mode AS "sourceMode",verified,created_at AS "createdAt"`,
      [input.title,input.description,input.incidentType,input.urgency,input.peopleAffected,input.locationLabel,input.lat,input.lon,input.sourceMode]
    );
    const incident = rows[0];
    await query(`INSERT INTO agent_runs (incident_id,agent_name,input_summary,output_summary) VALUES ($1,$2,$3,$4)`,
      [incident.id, ingested.log.agent, JSON.stringify(input), JSON.stringify({ ...ingested.log, interpretation: ingested.data.aiInterpretation || null })]);
    res.status(201).json({ incident, agent: ingested.data.aiInterpretation || null, agentLog: ingested.log, dataMode: input.sourceMode });
  } catch (e: any) { res.status(500).json({ error: 'Incident could not be saved.', detail: e.message }); }
});

app.patch('/api/incidents/:id/status', async (req, res) => {
  const statusSchema = z.object({ status: z.enum(['Reported','Under review','Verified','Allocated','Responding','Resolved','Closed']), verified: z.boolean().optional() });
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid status.' });
  try {
    const rows = await query(`UPDATE incidents SET status=$2, verified=COALESCE($3,verified), updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id, parsed.data.status, parsed.data.verified ?? null]);
    if (!rows.length) return res.status(404).json({ error: 'Incident not found.' });
    res.json({ incident: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/providers', async (_req, res) => {
  try {
    const rows = await query(`SELECT p.id,p.name,p.provider_type AS "providerType",p.lat,p.lon,p.verified,p.source_mode AS "sourceMode",p.updated_at AS "updatedAt",COALESCE(json_agg(json_build_object('id',r.id,'resourceType',r.resource_type,'quantityTotal',r.quantity_total,'quantityAvailable',r.quantity_available,'status',r.status,'lastVerifiedAt',r.last_verified_at)) FILTER (WHERE r.id IS NOT NULL),'[]') AS resources FROM providers p LEFT JOIN resources r ON r.provider_id=p.id GROUP BY p.id ORDER BY p.updated_at DESC`);
    res.json({ items: rows, lastUpdated: new Date().toISOString() });
  } catch (e: any) { res.status(503).json({ error: 'Could not load providers.', detail: e.message }); }
});

app.post('/api/providers', async (req, res) => {
  const parsed = providerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid provider.', issues: parsed.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = parsed.data;
    const pr = await client.query(`INSERT INTO providers (name,provider_type,lat,lon,source_mode) VALUES ($1,$2,$3,$4,'PROVIDER_REPORTED') RETURNING id`, [p.name,p.providerType,p.lat,p.lon]);
    const id = pr.rows[0].id;
    for (const r of p.resources) {
      if (r.quantityAvailable > r.quantityTotal) throw new Error('Available quantity cannot exceed total quantity.');
      await client.query(`INSERT INTO resources (provider_id,resource_type,quantity_total,quantity_available,last_verified_at) VALUES ($1,$2,$3,$4,NOW())`, [id,r.resourceType,r.quantityTotal,r.quantityAvailable]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id, message: 'Provider saved. Availability is provider-reported and should be verified before operational use.' });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(400).json({ error: e.message }); }
  finally { client.release(); }
});

app.get('/api/live/weather', async (req, res) => {
  const lat = Number(req.query.lat ?? 12.9716), lon = Number(req.query.lon ?? 77.5946);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 6 || lat > 37 || lon < 68 || lon > 98) return res.status(400).json({ error: 'Coordinates must be within India.' });
  try { res.json(await getWeather(lat, lon)); } catch (e: any) { res.status(502).json({ error: 'Live weather source unavailable.', detail: e.message, dataMode: 'UNAVAILABLE' }); }
});

app.get('/api/live/facilities', async (req, res) => {
  const lat = Number(req.query.lat ?? 12.9716), lon = Number(req.query.lon ?? 77.5946), radius = Math.min(10000, Math.max(500, Number(req.query.radius ?? 5000)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 6 || lat > 37 || lon < 68 || lon > 98) return res.status(400).json({ error: 'Coordinates must be within India.' });
  try { res.json(await getFacilities(lat, lon, radius)); } catch (e: any) { res.status(502).json({ error: 'Live map data source unavailable.', detail: e.message, dataMode: 'UNAVAILABLE' }); }
});

app.post('/api/incidents/:id/assess', async (req, res) => {
  try {
    const incidents = await query<any>(`SELECT id,title,description,incident_type AS "incidentType",urgency,people_affected AS "peopleAffected",location_label AS "locationLabel",lat,lon,status FROM incidents WHERE id=$1`, [req.params.id]);
    if (!incidents.length) return res.status(404).json({ error: 'Incident not found.' });
    const incident = incidents[0];
    let weather: any = null;
    try { weather = await getWeather(incident.lat, incident.lon); } catch {}
    const nearby = await query<any>(`SELECT id FROM incidents WHERE id<>$1 AND ST_DWithin(geom,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,5000) AND status NOT IN ('Resolved','Closed')`, [incident.id,incident.lon,incident.lat]);
    const impact = assessImpact(incident, weather, nearby);
    const resources = await query<any>(`SELECT r.id,r.resource_type,r.quantity_available,r.quantity_total,r.last_verified_at,p.id AS provider_id,p.name AS provider_name,p.provider_type,p.lat,p.lon,p.verified FROM resources r JOIN providers p ON p.id=r.provider_id WHERE r.quantity_available>0`);
    const allocation = recommendResources(incident, resources, impact.needScore);
    const results = [
      {agent: impact.log.agent, input: {incidentId: incident.id, nearbyCount: nearby.length}, output: impact},
      {agent: 'Resource Allocation Agent', input: {incidentId: incident.id, inventoryCount: resources.length}, output: allocation}
    ];
    for (const r of results) await query(`INSERT INTO agent_runs (incident_id,agent_name,input_summary,output_summary) VALUES ($1,$2,$3,$4)`, [incident.id,r.agent,JSON.stringify(r.input),JSON.stringify(r.output)]);
    res.json({ incident, weather: weather ? { source: weather.source, lastUpdated: weather.lastUpdated, current: weather.current, note: weather.note } : null, nearbyIncidentCount: nearby.length, impact: { needScore: impact.needScore, priority: impact.priority, factors: impact.factors, caveat: impact.caveat }, allocation: { candidates: allocation.candidates, unmetNeed: allocation.unmetNeed, explanation: allocation.explanation }, agentLogs: results.map(r => ({ agent: r.agent, status: 'completed', summary: r.agent === impact.log.agent ? 'Calculated impact score.' : 'Ranked resource candidates.', timestamp: new Date().toISOString() })) });
  } catch (e: any) { res.status(500).json({ error: 'Assessment failed.', detail: e.message }); }
});

app.post('/api/allocations/:id/approve', async (req, res) => {
  const body = z.object({ approvedBy: z.string().min(2).max(100).default('Demo Coordinator') }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Invalid approval.' });
  try {
    const rows = await query<any>(`SELECT a.*,r.quantity_available FROM allocations a JOIN resources r ON r.id=a.resource_id WHERE a.id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Recommendation not found. Save a candidate as an allocation first.' });
    const a = rows[0];
    if (a.quantity > a.quantity_available) return res.status(409).json({ error: 'Resource availability changed. Reassess before approving.' });
    const updated = await query(`UPDATE allocations SET status='Approved',approved_by=$2,updated_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id,body.data.approvedBy]);
    res.json({ allocation: updated[0], dispatchMode: 'SIMULATED', message: 'Approval recorded. No real-world dispatch was sent.' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/allocations', async (req, res) => {
  const schema = z.object({ incidentId: z.string().uuid(), resourceId: z.string().uuid(), quantity: z.number().int().min(1), score: z.number().min(0).max(100), rationale: z.record(z.any()).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid allocation recommendation.' });
  try {
    const r = parsed.data;
    const rows = await query<any>(`SELECT quantity_available FROM resources WHERE id=$1`, [r.resourceId]);
    if (!rows.length) return res.status(404).json({ error: 'Resource not found.' });
    if (r.quantity > rows[0].quantity_available) return res.status(409).json({ error: 'Not enough available quantity.' });
    const saved = await query(`INSERT INTO allocations (incident_id,resource_id,quantity,score,rationale) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [r.incidentId,r.resourceId,r.quantity,r.score,JSON.stringify(r.rationale || {})]);
    res.status(201).json({ allocation: saved[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agent-runs', async (req, res) => {
  try {
    const rows = await query(`SELECT id,incident_id AS "incidentId",agent_name AS "agentName",status,input_summary AS "inputSummary",output_summary AS "outputSummary",created_at AS "createdAt" FROM agent_runs ORDER BY created_at DESC LIMIT 100`);
    res.json({ items: rows });
  } catch (e: any) { res.status(503).json({ error: 'Could not load agent logs.', detail: e.message }); }
});

app.listen(port, () => console.log(`RESQGRID API running at http://localhost:${port}`));
