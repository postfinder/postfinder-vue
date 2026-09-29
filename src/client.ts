import { CATEGORIES, type Category, type NearbyPlace, type SearchHit } from "./types";

export const VERSION = "0.1.0";
export const DEFAULT_BASE_URL = "https://api.postfinder.io";

/** The service answers an empty list below this, so there is nothing to ask. */
export const MIN_QUERY = 2;

/**
 * What the API said when it refused.
 *
 * The service answers RFC 7807 problem documents: a title and a detail written
 * for a person to read. Collapsing that into "HTTP 400" throws away the only
 * part of the answer that says what to do about it.
 */
export class PostFinderError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;

  constructor(status: number, title = "", detail = "") {
    super([title || `HTTP ${status}`, detail].filter(Boolean).join(": "));
    this.name = "PostFinderError";
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

export interface ClientOptions {
  /** Point somewhere else: a proxy of your own, or a test server. */
  baseUrl?: string;
  /** Your own fetch, for a custom transport or for testing. */
  fetch?: typeof globalThis.fetch;
}

export interface NearbyQuery {
  lat: number;
  lng: number;
  category: Category;
  /** The country slug the site's URLs use: `australia`, `new-zealand`. */
  country: string;
}

export interface Client {
  /** Suburbs and locations matching what somebody has typed. */
  search(term: string, options?: { limit?: number; signal?: AbortSignal }): Promise<SearchHit[]>;
  /** The closest locations of one category to a point, nearest first. */
  nearby(query: NearbyQuery, options?: { signal?: AbortSignal }): Promise<NearbyPlace[]>;
}

/**
 * A client for the two calls a widget makes.
 *
 * Deliberately small: this package exists to make a search box and a nearby list
 * work properly, and carrying the whole read surface into every bundle that
 * wants one would be paid for by every visitor. The rest of the API is
 * `@postfinder/client`.
 *
 * No key: the API is free, keyless and cached at the edge. Nothing here needs an
 * origin allow list, so nothing here can be spent by somebody who copies your
 * page.
 */
export function createClient(options: ClientOptions = {}): Client {
  const baseUrl = checkBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const impl = options.fetch ?? globalThis.fetch;
  if (typeof impl !== "function") {
    throw new Error("postfinder: no fetch in this runtime. Pass one: createClient({ fetch })");
  }
  const fetchImpl = options.fetch ? impl : impl.bind(globalThis);

  async function get<T>(path: string, params: Record<string, string | number>, signal?: AbortSignal): Promise<T> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      if (key === "limit" && typeof value === "number" && (!Number.isInteger(value) || value < 0)) {
        throw new Error(`postfinder: limit must be a whole number, not ${value}`);
      }
      query.set(key, String(value));
    }

    const response = await fetchImpl(`${baseUrl}${path}?${query}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
      // Nothing here is authenticated, and a cookie on a cacheable GET is how a
      // shared cache comes to hold something that belongs to one visitor.
      credentials: "omit",
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const envelope = (body && typeof body === "object" ? body : {}) as {
      data?: T;
      title?: string;
      detail?: string;
    };

    // The status decides, never the body: a 500 carrying a cheerful payload is
    // still a 500.
    if (!response.ok) {
      throw new PostFinderError(response.status, envelope.title ?? "", envelope.detail ?? "");
    }
    return (envelope.data ?? ([] as unknown)) as T;
  }

  return {
    async search(term, { limit, signal } = {}) {
      const q = (term ?? "").trim();
      if (q.length < MIN_QUERY) return [];
      const data = await get<SearchHit[]>("/v1/search", limit === undefined ? { q } : { q, limit }, signal);
      return data ?? [];
    },

    async nearby(query, { signal } = {}) {
      if (!(CATEGORIES as readonly string[]).includes(query.category)) {
        throw new Error(
          `postfinder: ${String(query.category)} is not a category; use one of ${CATEGORIES.join(", ")}`,
        );
      }
      // Written as a range check NaN cannot pass, rather than as a NaN test.
      if (!(query.lat >= -90 && query.lat <= 90) || !(query.lng >= -180 && query.lng <= 180)) {
        throw new Error(
          `postfinder: (${query.lat}, ${query.lng}) is not a point on the globe; lat -90..90, lng -180..180`,
        );
      }
      const data = await get<NearbyPlace[]>(
        "/v1/nearby",
        {
          lat: query.lat,
          lng: query.lng,
          category: query.category,
          country: encodeURIComponent(String(query.country ?? "").trim()),
        },
        signal,
      );
      return data ?? [];
    },
  };
}

/**
 * Refuse a base URL that would put the request somewhere it should not go.
 *
 * https always, and plaintext http only to loopback, which is what a local proxy
 * and a test server need. There is no key to leak here, but a query does carry
 * what somebody typed into your form.
 */
function checkBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`postfinder: base URL ${raw} is not absolute`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      `postfinder: base URL ${raw} carries credentials, and the host it would reach is not the one it reads as`,
    );
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname);
  if (parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback)) {
    return raw.replace(/\/+$/, "");
  }
  if (parsed.protocol === "http:") {
    throw new Error(
      `postfinder: base URL ${raw} is plaintext http to a public host, which would send what people type in the clear`,
    );
  }
  throw new Error(`postfinder: base URL ${raw} has scheme ${parsed.protocol}, want https`);
}
