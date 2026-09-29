/**
 * PostFinder for Vue: find post offices, parcel lockers and post boxes.
 *
 * ```vue
 * <script setup>
 * import { LocationSearch, useNearby } from "@postfinder/vue";
 * </script>
 * ```
 *
 * Free and keyless. Data from OpenStreetMap (ODbL) and GeoNames (CC BY 4.0);
 * publishing what you get back means carrying those credits. See
 * postfinder.io/en/legal/.
 */

export { default as LocationSearch } from "./LocationSearch.vue";

export {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_MIN_LENGTH,
  useLocationSearch,
  type SearchStatus,
  type UseLocationSearch,
  type UseLocationSearchOptions,
} from "./useLocationSearch";

export { useNearby, type NearbyStatus, type UseNearby, type UseNearbyOptions } from "./useNearby";

export {
  DEFAULT_BASE_URL,
  MIN_QUERY,
  PostFinderError,
  VERSION,
  createClient,
  type Client,
  type ClientOptions,
  type NearbyQuery,
} from "./client";

export {
  CATEGORIES,
  hitPath,
  localityPath,
  metres,
  nearbyPath,
  placePath,
  type Category,
  type NearbyPlace,
  type SearchHit,
} from "./types";
