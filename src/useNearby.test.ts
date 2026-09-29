import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useNearby, type UseNearbyOptions } from "./useNearby";
import type { NearbyPlace } from "./types";

const PLACE: NearbyPlace = {
  public_id: "k7m2p9x4",
  slug: "coburg-post-office",
  name: "Coburg Post Office",
  brand: "australia-post",
  category: "post-offices",
  address: "484 Sydney Rd",
  lat: -37.7412,
  lng: 144.9645,
  country: "australia",
  region: "victoria",
  locality: "coburg",
  distance_km: 0.42,
};

function answering(places: NearbyPlace[] = [PLACE], status = 200) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ data: places, generated_at: "now" }), { status });
  });
  return { calls, fetch: fetchImpl as unknown as typeof globalThis.fetch };
}

function harness(options: UseNearbyOptions) {
  let api!: ReturnType<typeof useNearby>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useNearby(options);
        return () => h("div");
      },
    }),
  );
  return { api: () => api, wrapper };
}

describe("useNearby", () => {
  it("asks nothing until it has a coordinate", () => {
    const service = answering();
    const { api } = harness({ category: "post-offices", country: "australia", fetch: service.fetch });

    expect(api().status.value).toBe("idle");
    expect(api().places.value).toEqual([]);
    expect(service.calls).toEqual([]);
  });

  it("looks up what is nearest once it has one", async () => {
    const service = answering();
    const { api } = harness({
      lat: -37.7404,
      lng: 144.9633,
      category: "post-offices",
      country: "australia",
      fetch: service.fetch,
    });

    await vi.waitUntil(() => api().status.value === "results");

    expect(api().places.value[0]!.name).toBe("Coburg Post Office");
    expect(service.calls[0]).toContain("lat=-37.7404");
  });

  it("says empty when there is nothing within range, which is not a failure", async () => {
    const service = answering([]);
    const { api } = harness({
      lat: -37.7404,
      lng: 144.9633,
      category: "parcel-lockers",
      country: "australia",
      fetch: service.fetch,
    });

    await vi.waitUntil(() => api().status.value === "empty");
    expect(api().error.value).toBeUndefined();
  });

  it("says unavailable when the service broke, and keeps the error", async () => {
    const service = answering([], 503);
    const { api } = harness({
      lat: -37.7404,
      lng: 144.9633,
      category: "post-offices",
      country: "australia",
      fetch: service.fetch,
    });

    await vi.waitUntil(() => api().status.value === "unavailable");
    expect(api().error.value).toBeDefined();
  });

  it("reports a category it refuses rather than throwing during setup", async () => {
    const service = answering();
    const { api } = harness({
      lat: -37.7404,
      lng: 144.9633,
      // @ts-expect-error a bad category is a type error too; this is the runtime half
      category: "postboxes",
      country: "australia",
      fetch: service.fetch,
    });

    await vi.waitUntil(() => api().status.value === "unavailable");
    expect(String(api().error.value)).toContain("post-boxes");
    expect(service.calls).toEqual([]);
  });

  it("follows a coordinate that moves, taking refs as well as numbers", async () => {
    const service = answering();
    const lat = ref(-37.7404);
    const lng = ref(144.9633);
    const { api } = harness({ lat, lng, category: "post-offices", country: "australia", fetch: service.fetch });

    await vi.waitUntil(() => api().status.value === "results");

    lat.value = -37.8;
    lng.value = 144.99;
    await nextTick();
    await vi.waitUntil(() => service.calls.length === 2);

    expect(service.calls[1]).toContain("lat=-37.8");
  });

  it("asks again on reload, for a list with a refresh button", async () => {
    const service = answering();
    const { api } = harness({
      lat: -37.7404,
      lng: 144.9633,
      category: "post-offices",
      country: "australia",
      fetch: service.fetch,
    });

    await vi.waitUntil(() => api().status.value === "results");
    api().reload();
    await vi.waitUntil(() => service.calls.length === 2);
  });

  it("holds off while enabled is false", async () => {
    const service = answering();
    const enabled = ref(false);
    const { api } = harness({
      lat: -37.7404,
      lng: 144.9633,
      category: "post-offices",
      country: "australia",
      enabled,
      fetch: service.fetch,
    });

    expect(api().status.value).toBe("idle");
    expect(service.calls).toEqual([]);

    enabled.value = true;
    await nextTick();
    await vi.waitUntil(() => service.calls.length === 1);
  });

  it("asks nothing after the component goes away", async () => {
    const service = answering();
    const { wrapper } = harness({
      lat: -37.7404,
      lng: 144.9633,
      category: "post-offices",
      country: "australia",
      fetch: service.fetch,
    });

    wrapper.unmount();
    await nextTick();
    // Whatever was in flight was aborted; nothing new is started.
    expect(service.calls.length).toBeLessThanOrEqual(1);
  });
});
