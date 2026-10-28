# RESQGRID — Full-stack prototype

A user-friendly emergency coordination prototype for India with a React frontend, Express API, PostgreSQL/PostGIS schema, live weather context, OpenStreetMap geodata, multi-agent workflow, resource allocation, and coordinator approval.

## Important scope / safety
- This is a student/research prototype, **not an official emergency service** and not connected to government dispatch systems.
- Real-time public context includes Open-Meteo weather and OpenStreetMap/Overpass map features. Public data availability and freshness vary.
- Incidents and provider inventory created in the demo are labelled `SIMULATION` until entered/verified by an authorized user.
- Dispatch is simulated in this version: approving an assignment updates the local database; it does not contact emergency services.
- In India, users should contact official emergency services directly for real emergencies (112). Do not rely on this prototype for urgent assistance.

## Stack
- Frontend: React + Vite + TypeScript + Tailwind-style custom CSS
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + PostGIS (schema included)
- Agents: deterministic tool-backed agents with optional Gemini LLM interpretation
- Live context: Open-Meteo (no key for basic use), OpenStreetMap Overpass (public service, rate-limited)
- Mapping UI: Leaflet + OpenStreetMap tiles

## Quick start
Requirements: Node.js 20+, npm, Docker (recommended).

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
2. Start PostgreSQL/PostGIS:
   ```bash
   docker compose up -d db
   ```
3. Install packages:
   ```bash
   npm install
   ```
4. Initialize the database:
   ```bash
   npm run db:init
   ```
5. Start frontend and API:
   ```bash
   npm run dev
   ```
6. Open `http://localhost:5173`. API health: `http://localhost:4000/api/health`.

If you do not have Docker/PostGIS available, you can run the frontend in demo mode but database-backed API functions require PostgreSQL. The frontend shows a clear demo/data-source label.

## Optional Gemini agent interpretation
Set `GEMINI_API_KEY` in `.env` to enable LLM-assisted extraction of free-text incident reports. The system still uses deterministic validation and scoring; model output is never treated as verified fact. Without the key, a rule-based fallback works.

## Live-data behavior
- Weather endpoint: `GET /api/live/weather?lat=12.9716&lon=77.5946`
- OSM facilities: `GET /api/live/facilities?lat=12.9716&lon=77.5946&radius=5000`
- `lastUpdated`, `source`, and `dataMode` are returned by APIs.
- Public APIs may rate-limit or fail. Failures are surfaced and not represented as live data.
- Provider inventory freshness is based on authorized provider updates, not inferred from OSM.

## Core workflow
Report → validate/structure → geospatial context → impact scoring → inventory query → allocation recommendation → coordinator approval → simulated dispatch status → monitoring/reallocation.

## Project structure
- `apps/web`: React UI
- `apps/api`: Express routes, agent workflow, live-source clients, allocation logic
- `db/schema.sql`: PostgreSQL/PostGIS schema
- `.env.example`: configuration

## Production work still required
Authentication/authorization, audit review, provider verification, rate limiting, monitoring, secure deployment, formal API permissions, resilient queueing, real provider agreements, expert validation, and integration tests. Never connect this prototype to real dispatch without operational approval and extensive safety testing.
