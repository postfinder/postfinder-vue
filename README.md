# @postfinder/vue

**Find post offices, parcel lockers and post boxes, in Vue.** An accessible
search box you can drop in, and a composable for "what is nearest me".

- Free and keyless. No account, no origin allow list, nothing to configure
- Debounced and cancelled properly, so typing a suburb costs one request rather
  than six
- Implements the ARIA combobox pattern: arrow keys, Enter, Escape, announced rows
- Works on a phone out of the box
- No dependencies beyond Vue

```sh
npm install @postfinder/vue
```

## Quick start

```vue
<script setup lang="ts">
import { LocationSearch } from "@postfinder/vue";
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<template>
  <LocationSearch label="Find a post office" @select="(hit, path) => router.push(path)" />
</template>
```

That is the whole integration. `path` is the page the row belongs to on
postfinder.io, built from the row itself, so linking out takes no second request.

`v-model` works too, when the page wants to own what is in the box:

```vue
<LocationSearch v-model="term" />
```

## What is nearest

```vue
<script setup lang="ts">
import { useNearby, metres, nearbyPath } from "@postfinder/vue";
import { ref } from "vue";

const lat = ref<number | undefined>();
const lng = ref<number | undefined>();

const { places, status, reload } = useNearby({
  lat,
  lng,
  category: "parcel-lockers",
  country: "australia",
});

function locate() {
  navigator.geolocation.getCurrentPosition((p) => {
    lat.value = p.coords.latitude;
    lng.value = p.coords.longitude;
  });
}
</script>

<template>
  <button v-if="status === 'idle'" @click="locate">Use my location</button>
  <p v-else-if="status === 'loading'">Looking…</p>
  <p v-else-if="status === 'empty'">No parcel lockers within 50km.</p>
  <button v-else-if="status === 'unavailable'" @click="reload">Try again</button>

  <ul v-else>
    <li v-for="place in places" :key="place.public_id">
      <a :href="nearbyPath(place)">{{ place.name }}</a> · {{ metres(place.distance_km) }} m
    </li>
  </ul>
</template>
```

`lat` and `lng` take a ref, a getter or a plain number, so this follows a map
centre or a geolocation watch with no wiring. Leaving them undefined is the state
a page is in before somebody shares their location, and that is `idle` rather
than an error. The composable looks again when the point or the category changes,
and cancels the request it replaces.

The six categories are `post-offices`, `post-boxes`, `express-post-boxes`,
`parcel-lockers`, `drop-off-points` and `collection-points`. `Category` is a
union, so a wrong name is a type error.

## Your own markup

`useLocationSearch` is the search box without any opinion about how it looks.
Everything easy to get wrong lives in it: debouncing, cancelling a superseded
request, dropping an answer that arrived after a later one, and telling an empty
result apart from a failed one.

```vue
<script setup lang="ts">
import { useLocationSearch, hitPath } from "@postfinder/vue";

const { term, hits, status, clear } = useLocationSearch({ limit: 8 });
</script>

<template>
  <input v-model="term" />
  <span v-if="status === 'searching'">…</span>
  <a v-for="hit in hits" :key="hit.slug" :href="hitPath(hit)" @click="clear">
    {{ hit.name }} {{ hit.postcode }}
  </a>
</template>
```

`status` is one value rather than several booleans that can contradict each
other: `idle`, `searching`, `results`, `empty`, `unavailable`.

## Styling

The default styles are restrained on purpose: greys, one border, comfortable
padding for a thumb, and a 16px input so iOS does not zoom the page on focus.
Enough to be usable out of the box, little enough to override with one class name.

```vue
<LocationSearch :class-names="{ input: 'input', list: 'card', option: 'row' }" />
```

Or take the markup bare and bring your own everything:

```vue
<LocationSearch :styled="false" :class-names="{ ... }" />
```

## Being a good citizen

The API is free and asks for care in return: around a thousand requests a month
from one address. The defaults here already do most of that, since a 250ms
debounce turns a typed suburb into one request. If you need real volume, say what
you are building at
[postfinder.io/en/contact/](https://postfinder.io/en/contact/).

## Attribution

Locations come from OpenStreetMap (ODbL), localities and postcodes from GeoNames
(CC BY 4.0). If you publish what you get back, you carry those credits with it.
The [sources page](https://postfinder.io/en/legal/) names each one.

## Also available

| | |
|---|---|
| React | [`@postfinder/react`](https://www.npmjs.com/package/@postfinder/react) |
| Everything else the API serves | [`@postfinder/client`](https://www.npmjs.com/package/@postfinder/client) |
| Python | [`postfinder`](https://pypi.org/project/postfinder/) |
| Go | [`postfinder-go`](https://github.com/postfinder/postfinder-go) |

This package carries the two calls a widget makes. Postcodes, suburbs, regions
and category hubs are in `@postfinder/client`, which works in the same places.

Looking for Australian street addresses rather than locations? That is
[Locio](https://locio.com.au): G-NAF address autocomplete, validation and
geocoding, with [`@locio-au/vue`](https://www.npmjs.com/package/@locio-au/vue)
for exactly this job.

## Licence

MIT.
