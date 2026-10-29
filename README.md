# RESQGRID — Full-Stack Prototype

RESQGRID is a user-friendly emergency coordination prototype designed for India. It helps coordinate emergency resources by combining geospatial data, weather context, resource allocation, and coordinator approval in a single platform.

The system includes a React frontend, Express API, PostgreSQL/PostGIS database schema, live weather information, OpenStreetMap geodata, and a multi-agent workflow for incident analysis and resource coordination.

## Important Scope and Safety


 Live public data: Weather information comes from Open-Meteo, while map and facility data may come from OpenStreetMap and Overpass. Availability and freshness can vary.
 
 **Simulated data:** Incidents and provider inventory created in the demo are labelled `SIMULATION` until entered or verified by an authorized user.
 
 **Simulated dispatch:** Approving an assignment updates the local database. It does not contact emergency services or dispatch real responders.
 
 **Emergency assistance:** In India, call **112** for emergencies. Do not rely on this prototype for urgent assistance.

## Technology Stack

 **Frontend:** React, Vite, TypeScript, Tailwind-style custom CSS
 **Backend:** Node.js, Express, TypeScript
 **Database:** PostgreSQL with PostGIS
 **Agent workflow:** Deterministic, tool-backed agents with optional Gemini LLM interpretation
 **Weather data:** Open-Meteo
 **Geospatial data:** OpenStreetMap and Overpass API
 **Mapping interface:** Leaflet and OpenStreetMap tiles
 **Development environment:** npm and Docker

## Features

 Incident reporting and validation
 Geospatial context for emergency incidents
 Live weather context
 Nearby facility discovery using public map data
 Impact scoring and resource allocation recommendations
 Provider inventory management
 Coordinator review and approval
 Simulated dispatch status tracking
 Monitoring and resource reallocation workflow
 Optional AI-assisted extraction of incident details
 Data-source and freshness indicators

## Project Workflow

The core workflow follows these stages:

**Incident Report → Validation and Structuring → Geospatial Context → Impact Scoring → Inventory Query → Allocation Recommendation → Coordinator Approval → Simulated Dispatch Status → Monitoring and Reallocation**

## Project Structure

```text
resqgrid/
├── apps/
│   ├── web/          # React frontend
│   └── api/          # Express API, agents and allocation logic
├── db/
│   └── schema.sql    # PostgreSQL/PostGIS database schema
├── .env.example      # Example environment configuration
├── docker-compose.yml
└── package.json
```

## Prerequisites

 Node.js 20 or later
 npm
