import type { Departure, Network, Station } from './types';

export type ResolvedRoute = {
  view: 'explore' | 'findings';
  stationId?: string;
  departureId?: string;
  canonicalPath?: string;
  notFound?: boolean;
};

const slug = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const stationSlug = (station: Station) => slug(station.name.replace(/ Underground Station$/i, '').replace(/ Station$/i, ''));
const pathKey = (path: string) => `/${path.split('/').filter(Boolean).map(part => decodeURIComponent(part).toLowerCase()).join('/')}`;

export function createRoutes(network: Network, base = '/') {
  const rootPath = base.endsWith('/') ? base : `${base}/`;
  const statsPath = `${rootPath}stats`;
  const stationPathById = new Map<string, string>();
  const stationByPath = new Map<string, Station>();
  const departurePathById = new Map<string, string>();
  const departureByPath = new Map<string, Departure>();
  const departureById = new Map<string, Departure>();
  const defaultDepartureByStation = new Map<string, Departure>();
  const stations = new Map(network.stations.map(station => [station.id, station]));
  const stationGroups = new Map<string, Station[]>();
  for (const station of network.stations) {
    const name = stationSlug(station);
    stationGroups.set(name, [...(stationGroups.get(name) || []), station]);
  }
  for (const [name, group] of stationGroups) {
    for (const station of group) {
      const path = `${rootPath}${name}${group.length > 1 ? `-${slug(station.id)}` : ''}`;
      stationPathById.set(station.id, path);
      stationByPath.set(pathKey(path), station);
    }
  }

  const departureGroups = new Map<string, Departure[]>();
  for (const departure of network.departures) {
    if (!Number.isFinite(departure.bearing) || !(departure.coordinates?.length >= 2)) continue;
    const station = stations.get(departure.stationId);
    if (!station) continue;
    departureById.set(departure.id, departure);
    if (!defaultDepartureByStation.has(station.id)) defaultDepartureByStation.set(station.id, departure);
    const name = [
      station.lineIds.length > 1 ? slug(departure.lineId) : '',
      slug(departure.label || 'direction'),
      departure.platform != null ? `platform-${slug(String(departure.platform))}` : '',
    ].filter(Boolean).join('-');
    const path = `${stationPathById.get(station.id)}/${name}`;
    departureGroups.set(path, [...(departureGroups.get(path) || []), departure]);
  }

  for (const [path, group] of departureGroups) {
    // A platform can serve more than one branch. Keep both links unambiguous.
    const branchGroups = new Map<string, Departure[]>();
    for (const departure of group) {
      const next = departure.nextStationName || departure.nextStationId || departure.id;
      const branchPath = group.length > 1 ? `${path}-towards-${slug(next)}` : path;
      branchGroups.set(branchPath, [...(branchGroups.get(branchPath) || []), departure]);
    }
    for (const [branchPath, branches] of branchGroups) {
      for (const departure of branches) {
        const uniquePath = branches.length > 1 ? `${branchPath}-${slug(departure.id)}` : branchPath;
        departurePathById.set(departure.id, uniquePath);
        departureByPath.set(pathKey(uniquePath), departure);
      }
    }
  }

  return { rootPath, statsPath, stationPathById, stationByPath, departurePathById, departureByPath, departureById, defaultDepartureByStation };
}

export function resolveRoute(routes: ReturnType<typeof createRoutes>, pathname: string, hash = ''): ResolvedRoute {
  const fromDeparture = (departure: Departure): ResolvedRoute => ({
    view: 'explore', stationId: departure.stationId, departureId: departure.id,
    canonicalPath: routes.departurePathById.get(departure.id),
  });
  try {
    const key = pathKey(pathname);
    if (key === pathKey(routes.rootPath)) {
      if (hash && hash !== '#') {
        // Preserve previously shared hash links, replacing them with readable paths.
        const departure = routes.departureById.get(decodeURIComponent(hash.slice(1)));
        if (departure) return fromDeparture(departure);
      } else {
        return { view: 'explore', canonicalPath: routes.rootPath };
      }
    }
    if (key === pathKey(routes.statsPath)) return { view: 'findings', canonicalPath: routes.statsPath };
    const departure = routes.departureByPath.get(key);
    if (departure) return fromDeparture(departure);
    const station = routes.stationByPath.get(key);
    if (station) {
      const first = routes.defaultDepartureByStation.get(station.id);
      return first ? fromDeparture(first) : { view: 'explore', stationId: station.id, canonicalPath: routes.stationPathById.get(station.id) };
    }
  } catch {
    // Malformed percent-encoded URLs are handled like other unknown links.
  }
  return { view: 'explore', notFound: true };
}
