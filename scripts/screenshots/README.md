# Screenshots

Takes the app's mobile screenshots: the profile, the trip history and three
states of the map, in every language and theme asked for.

```sh
bun run screenshots                                   # Portuguese, light and dark
bun run screenshots -- --locales pt,en --themes dark
bun run screenshots -- --only station,trip --headed
```

| Flag | Default | |
| --- | --- | --- |
| `--locales` | `pt` | `pt`, `en` |
| `--themes` | `light,dark` | `light`, `dark` |
| `--only` | every scene | `profile`, `history`, `station`, `route`, `trip` |
| `--out` | `assets/screenshots` | where the PNGs go |
| `--url` | — | drive an already running dev server instead of starting one |
| `--headed` | off | watch it happen |

The scenes are:

- **profile** — the account page.
- **history** — the list of past trips.
- **station** — a station's sheet with its bikes, one slider held a quarter of
  the way towards unlocking.
- **route** — a walk-bike-walk route across the city.
- **trip** — the navigation view a few minutes into a ride, with a destination.

Screenshots need a phone-sized Chromium (`npx playwright install chromium`) and
run against `vite dev`, which the script starts itself: the scenes use the
development-only map handle (see `Map.svelte`) to place their taps and to know
when the camera and the tiles have settled.

## Mock data

The GIRA APIs, the Gira+ API and the geocoder are all replayed from
`mock-data.json`, so screenshots need no account and always show the same city,
the same bikes and the same trips. Map tiles and routes are still fetched for
real, so a network connection is needed.

Only the station data in there is real, and refreshing it needs a GIRA account:

```sh
GIRA_EMAIL=... GIRA_PASSWORD=... bun run screenshots:mock-data
```

The account it shows — João Silva, his balance, his pass and his trip history —
is made up in `fetch-mock-data.js`, so no real account's data is ever committed
or shown. Re-run it when the fixture goes stale, e.g. when the station the
station scene opens goes out of service (it says so if it does), and check the
screenshots afterwards: which stations have bikes decides what the routes look
like.

The scenes themselves — which station, and where in Lisbon each route starts and
ends — are in `config.js`.