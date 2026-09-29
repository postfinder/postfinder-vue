import { describe, expect, it, vi } from "vitest";

import { DEFAULT_BASE_URL, PostFinderError, createClient } from "./index";

/**
 * The embedded transport, and the controls on it.
 *
 * What passes through here is what a visitor typed into your form, which in a
 * location product is often their own address. So the destination cannot be moved
 * off https, a slug cannot walk out of its path prefix, and a page's cookies
 * never ride along with a keyless read.
 */

function recorder(body: unknown = { data: [] }, status = 200) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  });
  return {
    calls,
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
    get url() {
      return calls[calls.length - 1]!.url;
    },
    get init() {
      return calls[calls.length - 1]!.init!;
    },
  };
}

describe("where requests may go", () => {
  it("defaults to https", () => {
    expect(DEFAULT_BASE_URL.startsWith("https://")).toBe(true);
  });

  it("refuses plaintext http to a public host, and another scheme entirely", () => {
    expect(() => createClient({ baseUrl: "http://api.postfinder.io" })).toThrow(/clear/);
    expect(() => createClient({ baseUrl: "ftp://api.postfinder.io" })).toThrow();
    expect(() => createClient({ baseUrl: "not-a-url" })).toThrow();
  });

  it("refuses a base URL carrying credentials", () => {
    expect(() => createClient({ baseUrl: "https://api.postfinder.io:pass@evil.example" })).toThrow(
      /credentials/,
    );
  });

  it("allows loopback over http, for a dev proxy", () => {
    expect(() => createClient({ baseUrl: "http://localhost:8080" })).not.toThrow();
  });
});

describe("what reaches the wire", () => {
  it("encodes the query rather than interpolating it", async () => {
    const rec = recorder();
    await createClient({ fetch: rec.fetch }).search("coburg&limit=9999");

    expect(rec.url).toContain("q=coburg%26limit%3D9999");
    expect(rec.url).not.toContain("&limit=9999");
  });

  it("sends no credential and no cookies", async () => {
    const rec = recorder();
    await createClient({ fetch: rec.fetch }).search("coburg");

    expect(new Headers(rec.init.headers).get("Authorization")).toBeNull();
    expect(rec.init.credentials).toBe("omit");
  });

  it("costs no request below two characters", async () => {
    const rec = recorder();
    expect(await createClient({ fetch: rec.fetch }).search("c")).toEqual([]);
    expect(rec.calls).toEqual([]);
  });

  it("refuses a category or a coordinate the endpoint would reject", async () => {
    const rec = recorder();
    const pf = createClient({ fetch: rec.fetch });

    await expect(
      // @ts-expect-error a bad category is a type error too; this is the runtime half
      pf.nearby({ lat: -37.7, lng: 144.9, category: "postboxes", country: "australia" }),
    ).rejects.toThrow(/post-boxes/);
    await expect(
      pf.nearby({ lat: -91, lng: 144.9, category: "post-offices", country: "australia" }),
    ).rejects.toThrow();
    await expect(
      pf.nearby({ lat: NaN, lng: 144.9, category: "post-offices", country: "australia" }),
    ).rejects.toThrow();
    expect(rec.calls).toEqual([]);
  });
});

describe("what comes back", () => {
  it("lets the status decide whether it failed, not the body", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [{ name: "surprise" }] }), { status: 500 })) as unknown as typeof globalThis.fetch;

    await expect(createClient({ fetch: fetchImpl }).search("coburg")).rejects.toBeInstanceOf(PostFinderError);
  });

  it("survives a body that is not an object", async () => {
    for (const raw of ["[1,2,3]", '"gotcha"', "", "{"]) {
      const fetchImpl = (async () => new Response(raw, { status: 200 })) as unknown as typeof globalThis.fetch;
      await expect(createClient({ fetch: fetchImpl }).search("coburg")).resolves.toEqual([]);
    }
  });

  it("carries the service's own words on an error", async () => {
    const rec = recorder({ title: "invalid nearby search", detail: "Choose a category." }, 400);
    await createClient({ fetch: rec.fetch })
      .search("coburg")
      .catch((err: PostFinderError) => {
        expect(err.status).toBe(400);
        expect(err.title).toBe("invalid nearby search");
        expect(err.detail).toBe("Choose a category.");
      });
    expect.assertions(3);
  });
});
