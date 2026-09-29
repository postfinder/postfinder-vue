<script setup lang="ts">
/**
 * A search box for suburbs and locations, ready to drop in.
 *
 * Implements the ARIA combobox pattern: arrow keys move through the list, Enter
 * picks, Escape closes, and the active row is announced. A search box that only
 * works with a mouse is one that half the people using your site cannot use.
 *
 * Styling is deliberately minimal and entirely optional. Pass `classNames` to use
 * your own, or `:styled="false"` for bare markup: a component that brings a
 * stylesheet is a component that fights whatever you already have.
 */
import { computed, ref, useId, watch, type CSSProperties } from "vue";

import { useLocationSearch, type UseLocationSearchOptions } from "./useLocationSearch";
import { hitPath, type SearchHit } from "./types";

type ClassNames = Partial<Record<"root" | "label" | "input" | "list" | "option" | "meta" | "status", string>>;

const props = withDefaults(
  defineProps<
    UseLocationSearchOptions & {
      /** The visible label. A field without one is unusable with a screen reader. */
      label?: string;
      placeholder?: string;
      /** For `v-model`, when the page owns what is in the box. */
      modelValue?: string;
      classNames?: ClassNames;
      /** Set false to drop the inline styles and take the markup bare. */
      styled?: boolean;
      id?: string;
      name?: string;
      required?: boolean;
    }
  >(),
  {
    label: "Search",
    placeholder: "Suburb, postcode or place",
    styled: true,
  },
);

const emit = defineEmits<{
  /** The row somebody picked, and the path to its page on postfinder.io. */
  select: [hit: SearchHit, path: string];
  "update:modelValue": [term: string];
}>();

const uid = useId();
const inputId = computed(() => props.id ?? `postfinder-${uid}`);
const listId = computed(() => `${inputId.value}-list`);

const { term, hits, status, clear } = useLocationSearch({
  baseUrl: props.baseUrl,
  fetch: props.fetch,
  client: props.client,
  debounceMs: props.debounceMs,
  minLength: props.minLength,
  limit: props.limit,
});

// v-model, both ways, without making the composable care about it.
if (props.modelValue !== undefined) term.value = props.modelValue;
watch(term, (next) => emit("update:modelValue", next));
watch(
  () => props.modelValue,
  (next) => {
    if (next !== undefined && next !== term.value) term.value = next;
  },
);

const active = ref(-1);
const open = ref(false);
let blurTimer: ReturnType<typeof setTimeout> | undefined;

const showList = computed(() => open.value && status.value === "results" && hits.value.length > 0);

const MESSAGES = {
  idle: "",
  searching: "Searching…",
  results: "",
  empty: "Nothing matched that. Try a suburb, a postcode or a place name.",
  unavailable: "Search is unavailable right now. Please try again shortly.",
} as const;

const message = computed(() => MESSAGES[status.value]);

function choose(hit: SearchHit) {
  term.value = hit.name;
  clear();
  open.value = false;
  active.value = -1;
  emit("select", hit, hitPath(hit));
}

function onKeydown(event: KeyboardEvent) {
  if (!showList.value) return;
  const count = hits.value.length;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    active.value = (active.value + 1) % count;
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    active.value = active.value <= 0 ? count - 1 : active.value - 1;
  } else if (event.key === "Enter" && active.value >= 0) {
    event.preventDefault();
    choose(hits.value[active.value]!);
  } else if (event.key === "Escape") {
    open.value = false;
    active.value = -1;
  }
}

function onInput(event: Event) {
  term.value = (event.target as HTMLInputElement).value;
  open.value = true;
  active.value = -1;
}

function onBlur() {
  // Deferred, because a click on a row fires blur first and would otherwise
  // unmount the row before its own click handler ran.
  blurTimer = setTimeout(() => {
    open.value = false;
  }, 120);
}

function keepFocus(event: MouseEvent) {
  event.preventDefault();
  clearTimeout(blurTimer);
}

/**
 * The line under a row's name.
 *
 * A suburb and a post office in the same list look identical without it, and
 * "Coburg" twice is the kind of list nobody can pick from.
 */
function describe(hit: SearchHit): string {
  if (hit.kind === "locality") {
    const where = [hit.state, hit.postcode].filter(Boolean).join(" ");
    const count = hit.place_count ?? 0;
    return [`Suburb${where ? ` · ${where}` : ""}`, count ? `${count} listed` : ""].filter(Boolean).join(" · ");
  }
  return (
    [hit.locality_name || hit.locality, hit.state, hit.postcode].filter(Boolean).join(" ") || "Location"
  );
}

const bare: Record<string, CSSProperties | undefined> = {};

/**
 * A restrained default: enough to be usable out of the box, little enough to be
 * overridden by one class name. Greys only, so it inherits rather than announces
 * itself.
 */
const styles: Record<string, CSSProperties> = {
  root: { position: "relative", display: "flex", flexDirection: "column", gap: "4px" },
  label: { fontSize: "14px", fontWeight: 500 },
  input: {
    font: "inherit",
    fontSize: "16px", // 16px, or iOS zooms the page on focus.
    padding: "10px 12px",
    border: "1px solid #d4d4d8",
    borderRadius: "6px",
    width: "100%",
    boxSizing: "border-box",
  },
  status: { margin: 0, fontSize: "12px", color: "#71717a" },
  list: {
    listStyle: "none",
    margin: "4px 0 0",
    padding: 0,
    border: "1px solid #d4d4d8",
    borderRadius: "6px",
    background: "#fff",
    maxHeight: "280px",
    overflowY: "auto",
  },
  option: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    // Comfortable for a thumb, which is how most of these are used.
    padding: "10px 12px",
    cursor: "pointer",
    fontSize: "14px",
  },
  optionActive: { background: "#f4f4f5" },
  name: { fontWeight: 500 },
  meta: { fontSize: "12px", color: "#71717a" },
};

const s = computed(() => (props.styled ? styles : bare));
</script>

<template>
  <div :class="classNames?.root" :style="s.root">
    <label :class="classNames?.label" :style="s.label" :for="inputId">{{ label }}</label>

    <input
      :id="inputId"
      :name="name"
      :required="required"
      :class="classNames?.input"
      :style="s.input"
      type="text"
      autocomplete="off"
      role="combobox"
      :aria-expanded="showList"
      :aria-controls="listId"
      aria-autocomplete="list"
      :aria-activedescendant="showList && active >= 0 ? `${listId}-${active}` : undefined"
      :placeholder="placeholder"
      :value="term"
      @input="onInput"
      @keydown="onKeydown"
      @focus="open = true"
      @blur="onBlur"
    />

    <p v-if="message" role="status" :class="classNames?.status" :style="s.status">{{ message }}</p>

    <ul
      v-if="showList"
      :id="listId"
      role="listbox"
      :aria-label="`${label} suggestions`"
      :class="classNames?.list"
      :style="s.list"
    >
      <li
        v-for="(hit, i) in hits"
        :key="`${hit.kind}:${hit.country}/${hit.region}/${hit.slug}`"
        :id="`${listId}-${i}`"
        role="option"
        :aria-selected="i === active"
        :class="classNames?.option"
        :style="i === active ? { ...s.option, ...s.optionActive } : s.option"
        @mouseenter="active = i"
        @mousedown="keepFocus"
        @click="choose(hit)"
      >
        <span :style="s.name">{{ hit.name }}</span>
        <span :class="classNames?.meta" :style="s.meta">{{ describe(hit) }}</span>
      </li>
    </ul>
  </div>
</template>
