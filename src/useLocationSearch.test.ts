import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { useLocationSearch, type UseLocationSearchOptions } from "./useLocationSearch";
import type { SearchHit } from "./types";

const HITS: SearchHit[] = [
  {
    kind: "locality",
    slug: "coburg",
    name: "Coburg",
    country: "australia",
    region: "victoria",
    postcode: "3058",
    place_count: 14,
    score: 0.91,
  },
  {
    kind: "place",
    slug: "coburg-post-office",
    name: "Coburg Post Office",
    country: "australia",
    region: "victoria",
    locality: "coburg",
    postcode: "3058",
    score: 0.74,
  },
];

function answering(hits: SearchHit[] = HITS, status = 200) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ data: hits, generated_at: "now" }), { status });
  });
  return { calls, fetch: fetchImpl as unknown as typeof globalThis.fetch };
}

/**
 * A composable has to run inside a component, so this mounts a bare one and
 * hands its return value back.
 */
function harness(options: UseLocationSearchOptions) {
  let api!: ReturnType<typeof useLocationSearch>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useLocationSearch(options);
        return () => h("div");
      },
    }),
  );
  return { api: () => api, wrapper };
}

describe("useLocationSearch", () => {
  it("starts idle, with nothing typed and nothing asked", () => {
    const service = answering();
    const { api } = harness({ fetch: service.fetch });

    expect(api().term.value).toBe("");
    expect(api().hits.value).toEqual([]);
    expect(api().status.value).toBe("idle");
    expect(service.calls).toEqual([]);
  });

  it("searches once a pause has passed, and reports what it found", async () => {
    vi.useFakeTimers();
    try {
      const service = answering();
      const { api } = harness({ fetch: service.fetch, debounceMs: 200 });

      api().term.value = "coburg";
      await nextTick();
      expect(api().status.value).toBe("searching");
      expect(service.calls).toEqual([]);

      await vi.advanceTimersByTimeAsync(200);
      await nextTick();

      expect(service.calls).toHaveLength(1);
      expect(api().hits.value).toHaveLength(2);
      expect(api().status.value).toBe("results");
    } finally {
      vi.useRealTimers();
    }
  });

  it("spends one request on a burst of typing, not one per keystroke", async () => {
    vi.useFakeTimers();
    try {
      const service = answering();
      const { api } = harness({ fetch: service.fetch, debounceMs: 200 });

      for (const term of ["c", "co", "cob", "cobu", "cobur", "coburg"]) {
        api().term.value = term;
        await nextTick();
        await vi.advanceTimersByTimeAsync(50);
      }
      await vi.advanceTimersByTimeAsync(200);
      await nextTick();

      expect(service.calls).toHaveLength(1);
      expect(service.calls[0]).toContain("q=coburg");
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for nothing below the minimum length, and forgets what it had", async () => {
    vi.useFakeTimers();
    try {
      const service = answering();
      const { api } = harness({ fetch: service.fetch, debounceMs: 100 });

      api().term.value = "coburg";
      await nextTick();
      await vi.advanceTimersByTimeAsync(100);
      await nextTick();
      expect(api().hits.value).toHaveLength(2);

      api().term.value = "c";
      await nextTick();
      await vi.advanceTimersByTimeAsync(100);
      await nextTick();

      expect(service.calls).toHaveLength(1);
      expect(api().hits.value).toEqual([]);
      expect(api().status.value).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says empty when the service found nothing, which is not a failure", async () => {
    const service = answering([]);
    const { api } = harness({ fetch: service.fetch, debounceMs: 0 });

    api().term.value = "zzzzz";
    await nextTick();
    await vi.waitUntil(() => api().status.value === "empty");

    expect(api().error.value).toBeUndefined();
  });

  it("says unavailable when the service broke, and keeps the error for logging", async () => {
    const service = answering([], 503);
    const { api } = harness({ fetch: service.fetch, debounceMs: 0 });

    api().term.value = "coburg";
    await nextTick();
    await vi.waitUntil(() => api().status.value === "unavailable");

    expect(api().error.value).toBeDefined();
  });

  it("drops a slow answer that a later request has already superseded", async () => {
    const seen: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const fetchImpl = (async (url: string | URL) => {
      const term = new URL(String(url)).searchParams.get("q")!;
      seen.push(term);
      if (term === "coburg") {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return new Response(JSON.stringify({ data: [{ ...HITS[0]!, name: term }], generated_at: "now" }), {
        status: 200,
      });
    }) as unknown as typeof globalThis.fetch;

    const { api } = harness({ fetch: fetchImpl, debounceMs: 0 });

    api().term.value = "coburg";
    await nextTick();
    await vi.waitUntil(() => seen.includes("coburg"));

    api().term.value = "brunswick";
    await nextTick();
    await vi.waitUntil(() => api().hits.value[0]?.name === "brunswick");

    releaseFirst?.();
    await nextTick();

    expect(api().hits.value[0]?.name).toBe("brunswick");
  });

  it("clears the rows without clearing the box, for after a selection", async () => {
    const service = answering();
    const { api } = harness({ fetch: service.fetch, debounceMs: 0 });

    api().term.value = "coburg";
    await nextTick();
    await vi.waitUntil(() => api().hits.value.length === 2);

    api().clear();

    expect(api().hits.value).toEqual([]);
    expect(api().term.value).toBe("coburg");
    expect(api().status.value).toBe("idle");
  });

  it("passes a limit through and hits the search endpoint", async () => {
    const service = answering();
    const { api } = harness({ fetch: service.fetch, debounceMs: 0, limit: 5 });

    api().term.value = "coburg";
    await nextTick();
    await vi.waitUntil(() => service.calls.length === 1);

    expect(service.calls[0]).toBe("https://api.postfinder.io/v1/search?q=coburg&limit=5");
  });

  it("asks nothing after the component goes away", async () => {
    vi.useFakeTimers();
    try {
      const service = answering();
      const { api, wrapper } = harness({ fetch: service.fetch, debounceMs: 200 });

      api().term.value = "coburg";
      await nextTick();
      wrapper.unmount();
      await vi.advanceTimersByTimeAsync(500);

      expect(service.calls).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("takes a ref for the term, so a v-model can own it", async () => {
    const service = answering();
    const term = ref("");
    const { api } = harness({ fetch: service.fetch, debounceMs: 0, term });

    term.value = "coburg";
    await nextTick();
    await vi.waitUntil(() => api().hits.value.length === 2);

    expect(api().term.value).toBe("coburg");
  });
});
