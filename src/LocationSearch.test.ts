import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import LocationSearch from "./LocationSearch.vue";
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
    state: "VIC",
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
  return (async () =>
    new Response(JSON.stringify({ data: hits, generated_at: "now" }), { status })) as unknown as typeof globalThis.fetch;
}

function open(props: Record<string, unknown> = {}) {
  return mount(LocationSearch, { props: { fetch: answering(), debounceMs: 0, ...props } });
}

async function type(wrapper: ReturnType<typeof open>, term: string) {
  const input = wrapper.get("input");
  await input.setValue(term);
  // Wait for the answer, not for the box to say it is searching: "Searching…"
  // appears on the keystroke, so waiting for any status at all would race.
  await vi.waitUntil(() => {
    if (wrapper.findAll("[role=option]").length > 0) return true;
    const status = wrapper.find("[role=status]");
    return status.exists() && !/searching/i.test(status.text());
  });
  return input;
}

describe("LocationSearch", () => {
  it("renders a labelled combobox", () => {
    const wrapper = open();
    const input = wrapper.get("input");

    expect(input.attributes("role")).toBe("combobox");
    expect(input.attributes("aria-expanded")).toBe("false");
    // Off, or the browser's own saved entries cover the list with a dropdown of
    // their own.
    expect(input.attributes("autocomplete")).toBe("off");
    expect(wrapper.get("label").text()).toBe("Search");
    expect(wrapper.get("label").attributes("for")).toBe(input.attributes("id"));
  });

  it("takes a label of its own", () => {
    expect(open({ label: "Find a post office" }).get("label").text()).toBe("Find a post office");
  });

  it("offers what was found, once something is typed", async () => {
    const wrapper = open();
    const input = await type(wrapper, "coburg");

    const options = wrapper.findAll("[role=option]");
    expect(options).toHaveLength(2);
    expect(options[0]!.text()).toContain("Coburg");
    expect(input.attributes("aria-expanded")).toBe("true");
  });

  it("says what a row is, so a suburb and a post office are not the same line", async () => {
    const wrapper = open();
    await type(wrapper, "coburg");

    const first = wrapper.findAll("[role=option]")[0]!;
    expect(first.text()).toContain("3058");
    expect(first.text()).toMatch(/suburb/i);
  });

  it("moves through the list with the arrow keys and picks with Enter", async () => {
    const wrapper = open();
    const input = await type(wrapper, "coburg");

    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });

    const picked = wrapper.emitted("select");
    expect(picked).toHaveLength(1);
    expect((picked![0]![0] as SearchHit).name).toBe("Coburg Post Office");
    expect((input.element as HTMLInputElement).value).toBe("Coburg Post Office");
  });

  it("picks with a click, and hands over the page path beside the row", async () => {
    const wrapper = open();
    await type(wrapper, "coburg");

    await wrapper.findAll("[role=option]")[0]!.trigger("click");

    const picked = wrapper.emitted("select")!;
    expect((picked[0]![0] as SearchHit).name).toBe("Coburg");
    expect(picked[0]![1]).toBe("/en/australia/victoria/coburg/");
  });

  it("closes on Escape without picking anything", async () => {
    const wrapper = open();
    const input = await type(wrapper, "coburg");

    await input.trigger("keydown", { key: "Escape" });

    expect(input.attributes("aria-expanded")).toBe("false");
    expect(wrapper.emitted("select")).toBeUndefined();
  });

  it("says so when nothing matched", async () => {
    const wrapper = open({ fetch: answering([]) });
    await type(wrapper, "zzzzz");

    expect(wrapper.get("[role=status]").text()).toMatch(/nothing/i);
    expect(wrapper.findAll("[role=option]")).toHaveLength(0);
  });

  it("says so when the service is down, without blaming the visitor", async () => {
    const wrapper = open({ fetch: answering([], 503) });
    await type(wrapper, "coburg");

    expect(wrapper.get("[role=status]").text()).toMatch(/unavailable/i);
  });

  it("keeps the list out of the accessibility tree until there is one", () => {
    expect(open().find("[role=listbox]").exists()).toBe(false);
  });

  it("gives the list its own accessible name, not the field's", async () => {
    const wrapper = open({ label: "Find a post office" });
    await type(wrapper, "coburg");

    expect(wrapper.get("[role=listbox]").attributes("aria-label")).toBe("Find a post office suggestions");
  });

  it("sets a 16px input so iOS does not zoom the page on focus", () => {
    expect(open().get("input").attributes("style")).toContain("font-size: 16px");
  });

  it("takes class names of its own", async () => {
    const wrapper = open({ classNames: { input: "pf-input", option: "pf-option" } });
    expect(wrapper.get("input").classes()).toContain("pf-input");

    await type(wrapper, "coburg");
    expect(wrapper.findAll("[role=option]")[0]!.classes()).toContain("pf-option");
  });

  it("drops every inline style when asked for bare markup", () => {
    expect(open({ styled: false }).get("input").attributes("style")).toBeUndefined();
  });

  it("supports v-model on the term", async () => {
    const wrapper = open({ modelValue: "" });
    await wrapper.get("input").setValue("coburg");

    expect(wrapper.emitted("update:modelValue")!.at(-1)![0]).toBe("coburg");
  });
});
