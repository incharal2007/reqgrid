export type IncidentType = 'Flood' | 'Fire' | 'Medical' | 'Building collapse' | 'Road blockage' | 'Earthquake' | 'Other';
export type IncidentInput = {
  title: string; description?: string; incidentType: IncidentType; urgency: number;
  peopleAffected: number; locationLabel: string; lat: number; lon: number;
  sourceMode?: 'LIVE_FEED' | 'PROVIDER_REPORTED' | 'USER_REPORTED' | 'SIMULATION';
};
