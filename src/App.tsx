import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapInstance } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import networkUrl from '../data/network.json?url';
import { ArrowLeft, ArrowRight, ChevronDown, Compass, ExternalLink, Info, MapPin, Search, X } from 'lucide-react';
import type { Departure, Network, Position, Station } from './types';
import { createRoutes, resolveRoute } from './routes';
import type { ResolvedRoute } from './routes';

maplibregl.setWorkerUrl(workerUrl);

const degrees = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}°` : '—';
const hasBearing = (d: Departure) => typeof d.bearing === 'number' && Number.isFinite(d.bearing) && d.coordinates?.length >= 2;
const valid = (d: Departure) => hasBearing(d) && typeof d.deviation === 'number' && Number.isFinite(d.deviation);
const gapBinSize = 15;
const gapBinCount = 180 / gapBinSize;
const gapBin = (deviation: number) => Math.min(gapBinCount - 1, Math.floor(deviation / gapBinSize));
const discrepancyBands = [
  { label: '0–45°', limit: 45, colour: '#779e91' },
  { label: '45–90°', limit: 90, colour: '#c5b46f' },
  { label: '90–135°', limit: 135, colour: '#dc955c' },
  { label: '135–180°', limit: Infinity, colour: '#cf665b' },
];
const discrepancyColour = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value)
  ? discrepancyBands.find(band => value < band.limit)!.colour
  : '#8b9599';
const stationName = (s?: Station) => s?.name.replace(/ Underground Station$/i, '').replace(/ Station$/i, '') || 'Choose a station';
const colour = (value?: string) => value ? (value.startsWith('#') ? value : `#${value}`) : '#172b42';
const heading = (value: number) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(value / 45) % 8];
const platformNumber = (departure: Departure) => {
  const platform = departure.platform;
  return typeof platform === 'string' || typeof platform === 'number' ? String(platform) : null;
};
const destinationPoint = (origin: Position, bearing: number, displayDistance: number): Position => {
  const radians = Math.PI / 180;
  const angularDistance = displayDistance / 6371008.8;
  const latitude = origin[1] * radians;
  const longitude = origin[0] * radians;
  const direction = bearing * radians;
  const nextLatitude = Math.asin(Math.sin(latitude) * Math.cos(angularDistance) + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(direction));
  const nextLongitude = longitude + Math.atan2(Math.sin(direction) * Math.sin(angularDistance) * Math.cos(latitude), Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude));
  return [((nextLongitude / radians + 540) % 360) - 180, nextLatitude / radians];
};
const directionArrowSize = { signed: 1.2, actual: .9 };
const arrowImage = (fill: string): ImageData => {
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 40;
  const context = canvas.getContext('2d')!;
  context.beginPath();
  context.moveTo(20, 2);
  context.lineTo(35, 36);
  context.lineTo(20, 28);
  context.lineTo(5, 36);
  context.closePath();
  context.fillStyle = fill;
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;
  context.lineJoin = 'round';
  context.stroke();
  context.fill();
  return context.getImageData(0, 0, 40, 40);
};
const departureIdentity = (departure: Departure): string => {
  const platform = platformNumber(departure);
  if (platform) return ` · P${platform.replace(/^Platform\s*/i, '')}`;
  const towards = departure.nextStationName;
  return typeof towards === 'string' && towards ? ` · towards ${towards.replace(/ Underground Station$/i, '')}` : '';
};

function BrandMark() {
  return <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M18 3v7M18 26v7M3 18h7M26 18h7" stroke="currentColor"/><path d="m23 10-3 11-7 5 3-11z" fill="#ec785a"/><path d="m23 10-7 5 4 6z" fill="white"/></svg>;
}

function BearingCompass({ departure }: { departure?: Departure }) {
  const actual = departure && hasBearing(departure) ? departure.bearing : null;
  const signed = departure?.signedBearing;
  const actualColour = discrepancyColour(departure?.deviation);
  const point = (angle: number, radius: number): Position => [120 + Math.sin(angle * Math.PI / 180) * radius, 120 - Math.cos(angle * Math.PI / 180) * radius];
  const actualEnd = actual == null ? null : point(actual, 76);
  const signedEnd = signed == null ? null : point(signed, 77);
  return <svg className="bearing-compass" viewBox="0 0 240 240" role="img" aria-label={`Compass: signed ${degrees(signed)}, measured departure heading ${degrees(actual)}`}>
    <defs><marker id="actual-arrow" markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto"><path d="M0 0 6 3 0 6z" fill={actualColour}/></marker><marker id="signed-arrow" markerWidth="8" markerHeight="8" refX="5.5" refY="3" orient="auto"><path d="M0 0 6 3 0 6z" fill="#243c55"/></marker></defs>
    <circle cx="120" cy="120" r="91" fill="#f8f7f2" stroke="#e5e5dc"/><circle cx="120" cy="120" r="64" fill="none" stroke="#e6e6df" strokeDasharray="2 5"/>
    {Array.from({ length: 72 }, (_, i) => { const a = point(i * 5, i % 6 === 0 ? 84 : 88); const b = point(i * 5, 92); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={i % 6 === 0 ? '#9caaa9' : '#d7dbd3'} strokeWidth={i % 6 === 0 ? 1.3 : .7}/>; })}
    <path d="M120 36v168M36 120h168" stroke="#e0e5dc" strokeWidth=".7"/>
    <text x="120" y="16" textAnchor="middle" className="cardinal north">N</text><text x="226" y="124" textAnchor="middle" className="cardinal">E</text><text x="120" y="232" textAnchor="middle" className="cardinal">S</text><text x="14" y="124" textAnchor="middle" className="cardinal">W</text>
    {actual != null && signed != null && <path d={(() => { const delta = ((actual - signed + 540) % 360) - 180; const start = point(signed, 39); const end = point(actual, 39); return `M${start[0]},${start[1]} A39,39 0 0,${delta >= 0 ? 1 : 0} ${end[0]},${end[1]}`; })()} fill="none" stroke={actualColour} strokeWidth="1.5" opacity=".6"/>}
    {signedEnd && <line x1="120" y1="120" x2={signedEnd[0]} y2={signedEnd[1]} stroke="#243c55" strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#signed-arrow)"/>}
    {actualEnd && <line x1="120" y1="120" x2={actualEnd[0]} y2={actualEnd[1]} stroke={actualColour} strokeWidth="3.3" markerEnd="url(#actual-arrow)"/>}
    <circle cx="120" cy="120" r="5" fill="#fcfbf6" stroke="#18354c" strokeWidth="1.8"/>
  </svg>;
}

function NetworkMap({ network, selected, stationId, onStation, focusVersion }: { network: Network; selected?: Departure; stationId: string; onStation: (id: string) => void; focusVersion: number }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const callback = useRef(onStation);
  callback.current = onStation;
  const stations = useMemo(() => {
    return { type: 'FeatureCollection', features: network.stations.map(s => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { id: s.id, name: stationName(s) } })) } as GeoJSON.FeatureCollection;
  }, [network]);
  const tracks = useMemo(() => ({ ...network.tracks, features: network.tracks.features.map(f => ({ ...f, properties: { ...f.properties, color: colour(f.properties?.color || network.lines.find(l => l.id === f.properties?.lineId)?.color) } })) }), [network]);
  useEffect(() => {
    if (!container.current) return;
    let m: MapInstance;
    try {
      m = new maplibregl.Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/positron', center: [-.125, 51.515], zoom: 10.2, minZoom: 6, maxZoom: 19, attributionControl: { compact: true }, maxBounds: [[-1.3, 51.1], [.7, 52.1]] });
    } catch {
      setMapError(true);
      return;
    }
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
    m.on('error', e => { if (e.error?.message?.includes('Failed to fetch') || e.error?.message?.includes('WebGL')) setMapError(true); });
    m.on('load', () => {
      m.addSource('tube-tracks', { type: 'geojson', data: tracks });
      m.addLayer({ id: 'track-casing', type: 'line', source: 'tube-tracks', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 15, 7], 'line-opacity': .9 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      m.addLayer({ id: 'tracks', type: 'line', source: 'tube-tracks', paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.3, 15, 3.5], 'line-opacity': .78 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      m.addSource('tube-stations', { type: 'geojson', data: stations });
      m.addLayer({ id: 'station-hit', type: 'circle', source: 'tube-stations', paint: { 'circle-radius': 15, 'circle-opacity': 0 } });
      m.addLayer({ id: 'stations', type: 'circle', source: 'tube-stations', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 5], 'circle-color': '#fafaf6', 'circle-stroke-color': '#20384a', 'circle-stroke-width': 1.5 } });
      m.addLayer({ id: 'station-labels', type: 'symbol', source: 'tube-stations', minzoom: 12.7, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12.4, 'text-offset': [0, 1.1], 'text-anchor': 'top' }, paint: { 'text-color': '#263c4a', 'text-halo-color': '#faf9f5', 'text-halo-width': 2 } });
      m.addSource('direction-angle', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'direction-angle-fill', type: 'fill', source: 'direction-angle', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': discrepancyColour(null), 'fill-opacity': .09 } });
      m.addLayer({ id: 'direction-angle-arc', type: 'line', source: 'direction-angle', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': discrepancyColour(null), 'line-width': 1.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      m.addSource('departure', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'departure-halo', type: 'line', source: 'departure', paint: { 'line-color': '#ffffff', 'line-width': 6 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      m.addSource('signed-direction', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'signed-halo', type: 'line', source: 'signed-direction', paint: { 'line-color': '#ffffff', 'line-width': 5.5, 'line-dasharray': [.7, .7] }, layout: { 'line-cap': 'butt' } });
      m.addLayer({ id: 'signed-path', type: 'line', source: 'signed-direction', paint: { 'line-color': '#243c55', 'line-width': 3.5, 'line-dasharray': [1.1, 1.1] }, layout: { 'line-cap': 'butt' } });
      m.addLayer({ id: 'departure-path', type: 'line', source: 'departure', paint: { 'line-color': discrepancyColour(null), 'line-width': 4 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      m.addImage('signed-direction-arrow', arrowImage('#243c55'), { pixelRatio: 2 });
      m.addImage('actual-direction-arrow', arrowImage(discrepancyColour(null)), { pixelRatio: 2 });
      m.addSource('direction-endpoints', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'direction-arrows', type: 'symbol', source: 'direction-endpoints', layout: { 'icon-image': ['match', ['get', 'kind'], 'signed', 'signed-direction-arrow', 'actual-direction-arrow'], 'icon-rotate': ['get', 'bearing'], 'icon-size': ['match', ['get', 'kind'], 'signed', directionArrowSize.signed, directionArrowSize.actual], 'icon-anchor': 'top', 'icon-rotation-alignment': 'viewport', 'icon-pitch-alignment': 'viewport', 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      m.addLayer({ id: 'direction-labels', type: 'symbol', source: 'direction-endpoints', filter: ['==', ['get', 'kind'], 'signed'], layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 13.5, 'text-offset': [1, -1], 'text-anchor': 'left', 'text-rotation-alignment': 'viewport', 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#243c55', 'text-halo-color': '#ffffff', 'text-halo-width': 1.25 } });
      m.addLayer({ id: 'direction-angle-label', type: 'symbol', source: 'direction-angle', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#344d59', 'text-halo-color': '#ffffff', 'text-halo-width': 1.25 } });
      m.addSource('departure-start', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'departure-origin', type: 'circle', source: 'departure-start', paint: { 'circle-radius': 6, 'circle-color': '#172f46', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
      m.on('click', 'station-hit', e => { const id = e.features?.[0]?.properties?.id; if (id) { m.stop(); callback.current(String(id)); } });
      m.on('mouseenter', 'station-hit', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'station-hit', () => { m.getCanvas().style.cursor = ''; });
      const bounds = network.stations.reduce((area, station) => area.extend([station.lon, station.lat]), new maplibregl.LngLatBounds());
      const width = container.current?.clientWidth || 400;
      const height = container.current?.clientHeight || 500;
      m.fitBounds(bounds, { padding: Math.max(12, Math.min(55, width * .1, height * .1)), maxZoom: 10.5, duration: 0 });
      setReady(true);
    });
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container.current);
    return () => { resize.disconnect(); m.remove(); map.current = null; setReady(false); };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const actualColour = discrepancyColour(selected?.deviation);
    m.updateImage('actual-direction-arrow', arrowImage(actualColour));
    m.setPaintProperty('departure-path', 'line-color', actualColour);
    m.setPaintProperty('direction-angle-arc', 'line-color', actualColour);
    m.setPaintProperty('direction-angle-fill', 'fill-color', actualColour);
    const station = network.stations.find(s => s.id === stationId);
    const origin: Position | null = selected?.coordinates[0] || (station ? [station.lon, station.lat] : null);
    const updateArrows = () => {
      const start = origin ? m.project(origin) : null;
      const arrowLength = Math.max(24, Math.min(96, m.getContainer().clientWidth * .3, m.getContainer().clientHeight * .3));
      const endpoint = (bearing: number | null | undefined, iconSize: number) => {
        if (!origin || !start || typeof bearing !== 'number' || !Number.isFinite(bearing)) return null;
        const direction = m.project(destinationPoint(origin, bearing, 1));
        const dx = direction.x - start.x;
        const dy = direction.y - start.y;
        const length = Math.hypot(dx, dy);
        if (!length) return null;
        const end = m.unproject([start.x + dx / length * arrowLength, start.y + dy / length * arrowLength]);
        // The arrow's rear notch is 28 image pixels from its top, at pixelRatio 2.
        // Stop the shaft there so neither its stroke nor its halo reaches the tip.
        const shaftLength = Math.max(0, arrowLength - 14 * iconSize);
        const shaftEnd = m.unproject([start.x + dx / length * shaftLength, start.y + dy / length * shaftLength]);
        return { coordinates: [end.lng, end.lat] as Position, shaftCoordinates: [shaftEnd.lng, shaftEnd.lat] as Position, rotation: Math.atan2(dx, -dy) * 180 / Math.PI };
      };
      const actualEnd = selected && hasBearing(selected) ? endpoint(selected.bearing, directionArrowSize.actual) : null;
      const signedEnd = endpoint(selected?.signedBearing, directionArrowSize.signed);
      const line = (end: ReturnType<typeof endpoint>): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: origin && end ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [origin, end.shaftCoordinates] } }] : [] });
      (m.getSource('departure') as GeoJSONSource).setData(line(actualEnd));
      (m.getSource('signed-direction') as GeoJSONSource).setData(line(signedEnd));
      const angleFeatures: GeoJSON.Feature[] = [];
      if (origin && start && actualEnd && signedEnd) {
        // Draw in screen space, like the arrows, to keep the arc circular at every zoom and pitch.
        const delta = ((actualEnd.rotation - signedEnd.rotation + 540) % 360) - 180;
        const gap = Math.abs(((selected!.bearing! - selected!.signedBearing! + 540) % 360) - 180);
        const radius = arrowLength * .48;
        const arcPoint = (angle: number, distance: number): Position => {
          const radians = angle * Math.PI / 180;
          const point = m.unproject([start.x + Math.sin(radians) * distance, start.y - Math.cos(radians) * distance]);
          return [point.lng, point.lat];
        };
        const steps = Math.max(1, Math.ceil(Math.abs(delta) / 4));
        const arc = Array.from({ length: steps + 1 }, (_, i) => arcPoint(signedEnd.rotation + delta * i / steps, radius));
        if (Math.abs(delta) > .01) {
          angleFeatures.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[origin, ...arc, origin]] } });
          angleFeatures.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: arc } });
        }
        // Move narrow-angle labels beside the rays so they remain readable.
        const labelAngle = signedEnd.rotation + delta / 2 + (Math.abs(delta) < 30 ? (delta < 0 ? -30 : 30) : 0);
        angleFeatures.push({ type: 'Feature', properties: { label: degrees(gap) }, geometry: { type: 'Point', coordinates: arcPoint(labelAngle, radius + 15) } });
      }
      (m.getSource('direction-angle') as GeoJSONSource).setData({ type: 'FeatureCollection', features: angleFeatures });
      const endpoints: GeoJSON.Feature<GeoJSON.Point>[] = [];
      if (signedEnd) endpoints.push({ type: 'Feature', properties: { kind: 'signed', bearing: signedEnd.rotation, label: selected?.label || degrees(selected?.signedBearing) }, geometry: { type: 'Point', coordinates: signedEnd.coordinates } });
      if (actualEnd) endpoints.push({ type: 'Feature', properties: { kind: 'actual', bearing: actualEnd.rotation }, geometry: { type: 'Point', coordinates: actualEnd.coordinates } });
      (m.getSource('direction-endpoints') as GeoJSONSource).setData({ type: 'FeatureCollection', features: endpoints });
      (m.getSource('departure-start') as GeoJSONSource).setData({ type: 'FeatureCollection', features: origin ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: origin } }] : [] });
    };
    updateArrows();
    m.on('move', updateArrows);
    m.on('resize', updateArrows);
    return () => { m.off('move', updateArrows); m.off('resize', updateArrows); };
  }, [selected, stationId, ready, network]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !focusVersion) return;
    const station = network.stations.find(s => s.id === stationId);
    const origin: Position | undefined = selected?.coordinates[0] || (station ? [station.lon, station.lat] : undefined);
    if (!origin) return;
    m.flyTo({ center: origin, duration: 900, essential: true });
  }, [focusVersion, ready]);
  return <><div className="map-canvas" ref={container} aria-label="Interactive geographic map of London Underground tracks and stations"/>{mapError && <div className="map-notice"><Info size={14}/> The map could not fully load. Station search and bearing analysis remain available.</div>}</>;
}

function Methodology({ network, onClose }: { network: Network; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const box = dialog.current;
    box?.querySelector<HTMLButtonElement>('button')?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'Tab' && box) { const items = box.querySelectorAll<HTMLElement>('button,a[href],input,select'); const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } };
    document.addEventListener('keydown', handler); return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="method-modal" role="dialog" aria-modal="true" aria-labelledby="method-title" ref={dialog}>
    <button className="icon-button modal-close" onClick={onClose} aria-label="Close methodology"><X size={21}/></button>
    <h2 id="method-title">About the data</h2>
    <div className="method-links"><a href="https://tfl.gov.uk/info-for/open-data-users/api-documentation" target="_blank" rel="noreferrer">TfL open data <ExternalLink size={13}/></a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap & ODbL <ExternalLink size={13}/></a></div>
    <p className="snapshot-note">Dataset snapshot: {new Date(network.meta.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. </p>
  </div></div>;
}

export default function App() {
  const [network, setNetwork] = useState<Network>();
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedStationId, setSelectedStationId] = useState('');
  const [view, setView] = useState<'explore' | 'findings'>('explore');
  const [showMethod, setShowMethod] = useState(false);
  const [focusVersion, setFocusVersion] = useState(0);
  const [bin, setBin] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<'largest' | 'smallest'>('largest');
  const [routeNotFound, setRouteNotFound] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(networkUrl, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(`Dataset unavailable (${r.status})`); return r.json(); }).then((data: Network) => {
      if (!data.stations || !data.departures || !data.tracks) throw new Error('The network dataset is incomplete.');
      setNetwork(data);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, []);
  const lineMap = useMemo(() => new Map(network?.lines.map(l => [l.id, l])), [network]);
  const stationMap = useMemo(() => new Map(network?.stations.map(s => [s.id, s])), [network]);
  const routes = useMemo(() => network ? createRoutes(network, import.meta.env.BASE_URL) : null, [network]);
  const applyRoute = useCallback((route: ResolvedRoute, focus = false) => {
    setView(route.view);
    setSearch('');
    setRouteNotFound(!!route.notFound);
    if (route.view === 'explore') {
      setSelectedStationId(route.stationId || '');
      setSelectedId(route.departureId || '');
      if (focus && route.stationId) setFocusVersion(version => version + 1);
    }
  }, []);
  useEffect(() => {
    if (!routes) return;
    const restore = () => {
      const route = resolveRoute(routes, window.location.pathname, window.location.hash);
      applyRoute(route, true);
      if (route.canonicalPath && (window.location.pathname !== route.canonicalPath || window.location.hash)) {
        window.history.replaceState(null, '', route.canonicalPath);
      }
    };
    restore();
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', restore);
    };
  }, [routes, applyRoute]);
  const measuredDepartures = useMemo(() => network?.departures.filter(hasBearing) || [], [network]);
  const measured = useMemo(() => measuredDepartures.filter(valid), [measuredDepartures]);
  const stations = useMemo(() => network?.stations.filter(s => stationName(s).toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)) || [], [network, search]);
  const selected = network?.departures.find(d => d.id === selectedId);
  const selectedStation = stationMap.get(selectedStationId);
  const stationDepartures = measuredDepartures.filter(d => d.stationId === selectedStationId);
  const bins = Array.from({ length: gapBinCount }, (_, i) => measured.filter(d => gapBin(d.deviation!) === i).length);
  const maxBin = Math.max(1, ...bins);
  const listedDirections = useMemo(() => measuredDepartures.filter(d => bin == null || valid(d) && gapBin(d.deviation!) === bin).sort((a, b) => {
    if (valid(a) && !valid(b)) return -1;
    if (!valid(a) && valid(b)) return 1;
    if (valid(a) && valid(b)) return (sortOrder === 'largest' ? -1 : 1) * (a.deviation! - b.deviation!);
    return (stationMap.get(a.stationId)?.name || '').localeCompare(stationMap.get(b.stationId)?.name || '');
  }), [measuredDepartures, bin, sortOrder, stationMap]);
  const median = useMemo(() => { const sorted = measured.map(d => d.deviation!).sort((a, b) => a - b); return sorted.length ? sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : null; }, [measured]);
  const opposite = measured.filter(d => d.deviation! > 90).length;
  const measuredStationCount = new Set(measuredDepartures.map(d => d.stationId)).size;
  const stationCount = network?.stations.length || 0;
  const navigate = (path: string, focus = false) => {
    if (!routes) return;
    const route = resolveRoute(routes, path);
    const target = route.canonicalPath || path;
    if (window.location.pathname !== target || window.location.search || window.location.hash) window.history.pushState(null, '', target);
    applyRoute(route, focus);
  };
  const chooseDeparture = (d: Departure, focus = true) => { const path = routes?.departurePathById.get(d.id); if (path) navigate(path, focus); };
  const chooseStation = (id: string, focus = true) => { const path = routes?.stationPathById.get(id); if (path) navigate(path, focus); };
  const clearStation = () => { if (routes) navigate(routes.rootPath); };
  const mapPath = routes?.departurePathById.get(selectedId) || routes?.stationPathById.get(selectedStationId) || import.meta.env.BASE_URL;
  const renderDirections = () => <section className="ranking-panel all-directions">
    <div className="chart-title"><h3>All directions <small>{listedDirections.length}</small></h3><label className="direction-sort"><select aria-label="Sort by discrepancy" value={sortOrder} onChange={e => setSortOrder(e.target.value as 'largest' | 'smallest')}><option value="largest">Largest first</option><option value="smallest">Smallest first</option></select><ChevronDown size={13}/></label></div>
    {bin != null && <button className="text-button list-clear-filter" onClick={() => setBin(null)}>{bin * gapBinSize}–{(bin + 1) * gapBinSize}° · Clear filter <X size={12}/></button>}
    <div className="ranking-list">
      <div className="direction-list-columns"><span>Station / platform</span><span>Discrepancy</span></div>
      {listedDirections.map((d, i) => <button className="ranking-row" key={d.id} onClick={() => chooseDeparture(d, true)}><span className="rank-position">{i + 1}</span><span className="rank-line" style={{ backgroundColor: colour(lineMap.get(d.lineId)?.color) }}/><span className="rank-station"><strong>{stationName(stationMap.get(d.stationId))}</strong><small>{lineMap.get(d.lineId)?.name} · {d.label || 'Direction'}{departureIdentity(d)}</small></span><span className="rank-deviation" style={{ color: discrepancyColour(d.deviation) }}>{degrees(d.deviation)}</span><ArrowRight size={15}/></button>)}
      {!listedDirections.length && <div className="ranking-empty"><p>No directions match this selection.</p></div>}
    </div>
  </section>;
  return <div className={`app-shell ${view === 'explore' ? 'map-view' : 'stats-view'}`}>
    <header className="masthead"><a className="brand" href={mapPath} onClick={e => { e.preventDefault(); navigate(mapPath); }}><BrandMark/><span>TUBE BEARING</span></a><nav aria-label="Main navigation"><button className={view === 'explore' ? 'nav-button active' : 'nav-button'} onClick={() => navigate(mapPath)} disabled={!routes}>Map</button><button className={view === 'findings' ? 'nav-button active' : 'nav-button'} onClick={() => routes && navigate(routes.statsPath)} disabled={!routes}>Stats</button></nav><button className="about-button" aria-label="About the data" onClick={() => setShowMethod(true)} disabled={!network}><Info size={15}/><span>About the data</span></button></header>
    <main>
      {view === 'findings' && <section className="intro"><div><h1>Tube directions</h1><p>Compare platform signs with actual track directions.</p></div></section>}
      {error ? <div className="load-error"><Info size={28}/><h2>We couldn’t load the station dataset.</h2><p>{error}</p><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></div> : !network ? <div className="loading-state"><span className="loading-compass"><Compass size={36}/></span><h2>Loading…</h2><p>Loading London’s tracks and platform directions.</p></div> : <>
      {view === 'findings' && <section className="metrics" aria-label="Measurement coverage"><div><span className="metric-label">STATIONS MEASURED</span><strong>{measuredStationCount}<span>of {stationCount} stations</span></strong></div><div><span className="metric-label">PLATFORM DIRECTIONS MEASURED</span><strong>{measuredDepartures.length}</strong></div><div><span className="metric-label">MEDIAN DISCREPANCY</span><strong>{degrees(median)}</strong></div><div className="opposite-metric"><span className="metric-label">DISCREPANCY OVER 90°</span><strong>{measured.length ? `${Math.round(opposite / measured.length * 100)}%` : '—'}</strong></div></section>}
      <section className="workspace">

        {view === 'explore' ? <div className="explorer"><aside className="station-panel"><div className="station-search"><Search size={17}/><input aria-label="Find a Tube station" placeholder="Find a station…" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="Clear search" className="icon-button" onClick={() => setSearch('')}><X size={14}/></button>}</div>
          {routeNotFound && <div className="route-notice" role="status">That station or departure link wasn’t found.<button onClick={clearStation}>Back to all stations</button></div>}
          {(search || !selectedStation) && <div className="station-results"><span className="small-label">{stations.length} STATIONS</span>{stations.map(s => <button className={s.id === selectedStationId ? 'station-result chosen' : 'station-result'} key={s.id} onClick={() => { chooseStation(s.id); setSearch(''); }}><MapPin size={14}/><span>{stationName(s)}</span><ArrowRight size={14}/></button>)}{!stations.length && <p className="no-results">No stations match “{search}”.</p>}</div>}
          {selectedStation && !search && <div className="selected-station"><button className="station-back" onClick={clearStation} aria-label="Back to all stations"><ArrowLeft size={15}/>All stations</button><div className="selected-heading"><h2>{stationName(selectedStation)}</h2><div className="station-lines">{selectedStation.lineIds.map(id => <span key={id} title={lineMap.get(id)?.name} style={{ backgroundColor: colour(lineMap.get(id)?.color) }}/>)}</div></div><label className="platform-select"><div><select aria-label="Choose platform departure" value={selectedId} onChange={e => { const d = network.departures.find(d => d.id === e.target.value); if (d) chooseDeparture(d, true); }}>{stationDepartures.map(d => <option key={d.id} value={d.id}>{lineMap.get(d.lineId)?.name} · {d.label || 'Direction unknown'}{departureIdentity(d)}</option>)}</select><ChevronDown size={14}/></div></label>
            {selected ? <><BearingCompass departure={selected}/><div className="bearing-values"><div><span><i className="signed-swatch"/> SIGN</span><strong>{selected.label || 'Unknown'}</strong><small>{degrees(selected.signedBearing)}</small></div><div><span><i className="actual-swatch" style={{ borderTopColor: discrepancyColour(selected.deviation) }}/> TRACK</span><strong>{hasBearing(selected) ? heading(selected.bearing!) : 'Unavailable'}</strong><small>{degrees(hasBearing(selected) ? selected.bearing : null)}</small></div></div>
            <div className="gap-callout"><span className="gap-number" style={{ color: discrepancyColour(selected.deviation) }}>{degrees(selected.deviation)}</span><div><strong>discrepancy</strong></div></div>
            </> : <div className="reference-note">No platform direction data available.</div>}
          </div>}

        </aside><div className="map-panel"><NetworkMap network={network} selected={selected} stationId={selectedStationId} onStation={id => chooseStation(id, false)} focusVersion={focusVersion}/><div className="map-legend"><div className="map-arrow-key"><span><b className="map-sign-key"/>Sign</span><span><b className="map-track-key" style={{ borderTopColor: discrepancyColour(selected?.deviation) }}/>Track</span></div></div></div></div> : <div className="findings">
          <div className="findings-heading"><h2>Direction discrepancy</h2></div>
          <div className="findings-grid">
            <section className="histogram-panel">
              <div className="chart-title"><h3>Distribution by angle</h3><span>{measured.length} comparisons</span></div>
              <p className="chart-subtitle">Departures grouped into 15° intervals</p>
              <div className="histogram">
                <div className="histogram-y"><span>{maxBin}</span><span>{Math.round(maxBin / 2)}</span><span>0</span></div>
                <div className="histogram-bars">{bins.map((count, i) => <button key={i} className={`histogram-bin ${bin === i ? 'active' : ''}`} onClick={() => setBin(bin === i ? null : i)} aria-label={`${i * gapBinSize} to ${(i + 1) * gapBinSize} degrees: ${count} departures. Filter ranking.`} aria-pressed={bin === i}>
                  <span className="bar-count" style={{ bottom: `calc(${count / maxBin * 100}% + 6px)` }}>{count}</span>
                  <span className="bar-fill" style={{ height: `${count / maxBin * 100}%`, backgroundColor: discrepancyColour(i * gapBinSize) }}/>
                  <span className="bar-label"><span>{i * gapBinSize}–</span><span>{(i + 1) * gapBinSize}°</span></span>
                </button>)}</div>
              </div>
              <div className="x-axis-label">Discrepancy from signed direction (degrees)</div>
              <div className="chart-footnote discrepancy-legend" aria-label="Discrepancy colour scale">{discrepancyBands.map(band => <span key={band.label}><i style={{ backgroundColor: band.colour }}/>{band.label}</span>)}</div>
              <div className="data-caption">Source: TfL platform labels + OpenStreetMap tracks · {new Date(network.meta.generatedAt).toLocaleDateString('en-GB')} snapshot</div>
            </section>
            {renderDirections()}
          </div>
        </div>}
      </section>
      </>}
    </main>
    {showMethod && network && <Methodology network={network} onClose={() => setShowMethod(false)}/>}
  </div>;
}
