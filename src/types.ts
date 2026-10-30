export type Position = [number, number];
export type Line = { id: string; name: string; color: string };
export type Station = { id: string; name: string; lat: number; lon: number; lineIds: string[] };
export type Departure = {
  id: string;
  stationId: string;
  stationName: string;
  lineId: string;
  lineName: string;
  lineColor: string;
  platform: string | null;
  platformName: string;
  platformCandidates?: string[];
  label: string;
  signedBearing: number;
  bearing: number;
  deviation: number;
  nextStationId: string;
  nextStationName: string;
  confidence: 'mapped' | 'estimated';
  coordinates: Position[];
  departureReference: 'platform-end' | 'stop-position' | 'station-projection';
  sources: {
    labelUrl: string;
    trackUrl: string;
    note?: string;
    evidenceUrls?: string[];
  };
};
export type Network = {
  meta: {
    generatedAt: string;
    dataDate: string;
    dataMode: 'curated-static';
    measurementMethod: 'departure-tangent';
    methodology: string;
    referenceMethods: Record<Departure['departureReference'], string>;
    limitations: string[];
    sources: { name: string; url: string }[];
  };
  lines: Line[];
  stations: Station[];
  departures: Departure[];
  tracks: GeoJSON.FeatureCollection;
};
