import { onScopeDispose, ref, watch, type Ref } from "vue";

import { createClient, type Client, type ClientOptions } from "./client";
import type { SearchHit } from "./types";

/**
 * How long a pause means somebody has stopped typing.
 *
 * Long enough that a burst of typing is one request, short enough that it still
 * feels like it is keeping up. The API is free, and it stays free by callers not
 * firing on every keystroke.
 */
export const DEFAULT_DEBOUNCE_MS = 250;

/**
 * Below this a prefix matches most of the table and the answer means nothing.
 * The service refuses under two characters anyway.
 */
export const DEFAULT_MIN_LENGTH = 2;

/**
 * What the box has to say, as one value rather than several booleans that can
 * contradict each other.
 */
export type SearchStatus = "idle" | "searching" | "results" | "empty" | "unavailable";

export interface UseLocationSearchOptions extends ClientOptions {
  /**
   * The term, if something else already owns it: a `v-model` on your own input,
   * or a query parameter. Left out, one is made here.
   */
  term?: Ref<string>;
  /** Milliseconds of quiet before a request. Default 250. */
  debounceMs?: number;
  /** Characters before anything is requested. Default 2. */
  minLength?: number;
  /** How many rows to ask for. The service default applies when unset. */
  limit?: number;
  /** An existing client, if you already made one. */
  client?: Client;
}

export interface UseLocationSearch {
  /** What is in the box. Writable: bind it with `v-model`. */
  term: Ref<string>;
  hits: Ref<SearchHit[]>;
  status: Ref<SearchStatus>;
  /** The error behind `status === "unavailable"`, for logging. */
  error: Ref<unknown>;
  /** Forget the rows without clearing the box: use after a selection. */
  clear(): void;
}

/**
 * The typeahead, without any opinion about how it looks.
 *
 * Everything that is easy to get wrong lives here: debouncing, cancelling a
 * superseded request, dropping an answer that arrived after a later one, and
 * telling an empty result apart from a failed one. Build whatever markup you
 * like on top, or use `<LocationSearch />` for an accessible default.
 */
export function useLocationSearch(options: UseLocationSearchOptions = {}): UseLocationSearch {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    minLength = DEFAULT_MIN_LENGTH,
    limit,
    client: given,
    baseUrl,
    fetch: fetchImpl,
  } = options;

  // One client for the life of the scope. Rebuilding it per keystroke would
  // re-run the base URL check every time and defeat any transport a caller keeps
  // state in.
  const client = given ?? createClient({ baseUrl, fetch: fetchImpl });

  const term = options.term ?? ref("");
  const hits = ref<SearchHit[]>([]) as Ref<SearchHit[]>;
  const status = ref<SearchStatus>("idle");
  const error = ref<unknown>(undefined);

  // Which request is the current one. An answer whose number is no longer this
  // one is stale: without that check, typing "coburg" then "brunswick" can leave
  // Coburg's rows on screen under Brunswick's query, because the first answer
  // came back last.
  let current = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: AbortController | undefined;

  function stop() {
    clearTimeout(timer);
    inFlight?.abort();
    inFlight = undefined;
  }

  function clear() {
    current += 1;
    hits.value = [];
    status.value = "idle";
    error.value = undefined;
  }

  watch(
    term,
    (next) => {
      stop();
      const q = (next ?? "").trim();

      if (q.length < minLength) {
        // Forget what was found for a longer term: leaving it on screen shows
        // rows that do not match what the box now says.
        clear();
        return;
      }

      // Said from the keystroke rather than when the timer fires, so the box does
      // not sit there looking idle while a request is pending.
      status.value = "searching";

      const mine = ++current;
      const controller = new AbortController();
      inFlight = controller;

      timer = setTimeout(async () => {
        try {
          const found = await client.search(q, { limit, signal: controller.signal });
          if (mine !== current) return;
          hits.value = found;
          status.value = found.length ? "results" : "empty";
          error.value = undefined;
        } catch (err) {
          // An abort is this component's own doing, not a failure to report.
          if (controller.signal.aborted || (err as Error)?.name === "AbortError") return;
          if (mine !== current) return;
          hits.value = [];
          status.value = "unavailable";
          error.value = err;
        }
      }, debounceMs);
    },
    { immediate: true },
  );

  // A component that goes away mid-debounce should take its request with it.
  onScopeDispose(() => {
    current += 1;
    stop();
  });

  return { term, hits, status, error, clear };
}
