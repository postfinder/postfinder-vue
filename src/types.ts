/**
 * The shapes this package reads, exactly as the API sends them.
 *
 * Field names are the wire's own, snake_case included: renaming them would mean
 * a second vocabulary to learn beside the docs, and a bug the first time the
 * service adds a field the map does not know.
 *
 * Only the two shapes a widget needs are here. The whole read surface, with
 * postcodes, suburbs, regions and category hubs, is `@postfinder/client`.
 */

/** The categories a nearby search accepts. */
export const CATEGORIES = [
  "post-offices",
  "post-boxes",
  "express-post-boxes",
  "parcel-lockers",
  "drop-off-points",
  "collection-points",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** One row of the typeahead: a suburb or a location. */
export interface SearchHit {
  kind: "locality" | "place" | "address";
  slug: string;
  name: string;
  country: string;
  region: string;
  locality?: string;
  /** The suburb's name as text, for a row whose suburb has no page yet. */
  locality_name?: string;
  state?: string;
  postcode?: string;
  place_count?: number;
  lat?: number;
  lng?: number;
  score: number;
}

/** A location, with how far it is from the point that was asked about. */
export interface NearbyPlace {
  /** Permanent. Minted once, never derived from a source record: store this. */
  public_id: string;
  slug: string;
  name: string;
  /** A key, not prose: `australia-post`, or `unbranded`. */
  brand: string;
  category: string;
  address?: string;
  lat: number;
  lng: number;
  /** As the source published them. Most post boxes have none. */
  hours?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  last_verified_at?: string;
  closed_at?: string;
  country: string;
  region: string;
  locality: string;
  distance_km: number;
}

/** The site serves one language today and its paths carry the prefix. */
const LANG = "en";

/** The suburb page: `/en/australia/victoria/coburg/`. */
export function localityPath(country: string, region: string, locality: string): string {
  if (!country || !region || !locality) return "";
  return `/${LANG}/${country}/${region}/${locality}/`;
}

/**
 * The location page, which carries the brand as a segment.
 *
 * A place with no brand is filed under `unbranded`, which is what the server
 * stores rather than a special case invented here.
 */
export function placePath(
  country: string,
  region: string,
  locality: string,
  brand: string,
  slug: string,
): string {
  if (!country || !region || !locality || !slug) return "";
  return `/${LANG}/${country}/${region}/${locality}/${brand || "unbranded"}/${slug}/`;
}

/**
 * The page a typeahead row links to.
 *
 * A suburb row links to its own page. A place row links to its suburb: a
 * location's path carries a brand segment that a search row does not carry.
 */
export function hitPath(hit: SearchHit): string {
  if (hit.kind === "locality") return localityPath(hit.country, hit.region, hit.slug);
  if (hit.kind === "place") return localityPath(hit.country, hit.region, hit.locality ?? "");
  return "";
}

/** The page a nearby row links to, which this row has everything for. */
export function nearbyPath(place: NearbyPlace): string {
  return placePath(place.country, place.region, place.locality, place.brand, place.slug);
}

/** Metres, rounded. What a list prints: "420 m", not "0.42 km". */
export function metres(distanceKm: number): number {
  return Math.round(distanceKm * 1000);
}
