import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";

import { createClient, type Client, type ClientOptions } from "./client";
import type { Category, NearbyPlace } from "./types";

/** One value rather than several booleans that can contradict each other. */
export type NearbyStatus = "idle" | "loading" | "results" | "empty" | "unavailable";

export interface UseNearbyOptions extends ClientOptions {
  /**
   * Where to look from. A ref, a getter or a plain number, so this follows a map
   * centre or a geolocation watch without any wiring.
   *
   * Left undefined, nothing is asked: that is the state a page is in before
   * somebody shares their location, and it is not an error.
   */
  lat?: MaybeRefOrGetter<number | undefined>;
  lng?: MaybeRefOrGetter<number | undefined>;
  category: MaybeRefOrGetter<Category>;
  /** The country slug the site's URLs use: `australia`, `new-zealand`. */
  country: MaybeRefOrGetter<string>;
  /** Set false to hold off, for a list behind a button or a closed panel. */
  enabled?: MaybeRefOrGetter<boolean>;
  /** An existing client, if you already made one. */
  client?: Client;
}

export interface UseNearby {
  /** Nearest first, within 50km, at most 30 rows. */
  places: Ref<NearbyPlace[]>;
  status: Ref<NearbyStatus>;
  /** The error behind `status === "unavailable"`, for logging. */
  error: Ref<unknown>;
  /** Ask again for the same point, for a list with a refresh. */
  reload(): void;
}

/**
 * What is nearest a coordinate, kept in step with the coordinate.
 *
 * Looks again when the point or the category changes, cancels the request it
 * replaces, and never reports an abort as a failure. An empty answer is an
 * answer: there is nothing of that kind within 50km.
 */
export function useNearby(options: UseNearbyOptions): UseNearby {
  const { client: given, baseUrl, fetch: fetchImpl } = options;
  const client = given ?? createClient({ baseUrl, fetch: fetchImpl });

  const places = ref<NearbyPlace[]>([]) as Ref<NearbyPlace[]>;
  const status = ref<NearbyStatus>("idle");
  const error = ref<unknown>(undefined);
  const attempt = ref(0);

  // Which request is current. An answer whose number is no longer this one
  // belongs to a point the visitor has already moved away from.
  let current = 0;
  let inFlight: AbortController | undefined;

  function reload() {
    attempt.value += 1;
  }

  watch(
    () => [
      toValue(options.lat),
      toValue(options.lng),
      toValue(options.category),
      toValue(options.country),
      toValue(options.enabled) ?? true,
      attempt.value,
    ] as const,
    ([lat, lng, category, country, enabled]) => {
      inFlight?.abort();
      inFlight = undefined;

      if (!enabled || typeof lat !== "number" || typeof lng !== "number") {
        current += 1;
        status.value = "idle";
        places.value = [];
        error.value = undefined;
        return;
      }

      const mine = ++current;
      const controller = new AbortController();
      inFlight = controller;
      status.value = "loading";

      void (async () => {
        try {
          // A refused category or an impossible coordinate is reported here
          // rather than thrown during setup, which would take the page down
          // instead of the list.
          const found = await client.nearby({ lat, lng, category, country }, { signal: controller.signal });
          if (mine !== current) return;
          places.value = found;
          status.value = found.length ? "results" : "empty";
          error.value = undefined;
        } catch (err) {
          if (controller.signal.aborted || (err as Error)?.name === "AbortError") return;
          if (mine !== current) return;
          places.value = [];
          status.value = "unavailable";
          error.value = err;
        }
      })();
    },
    { immediate: true },
  );

  // A component that goes away mid-request should take it along.
  onScopeDispose(() => {
    current += 1;
    inFlight?.abort();
  });

  return { places, status, error, reload };
}
