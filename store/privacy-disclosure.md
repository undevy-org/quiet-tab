# Chrome Web Store Privacy Disclosure — Quiet Tab

Drafted from `docs/privacy.md` and `manifest.json` as of this repository's
`0.1.0` tag. Re-check both files before reusing this draft for a future
version.

## Single purpose

Quiet Tab replaces the new tab page with a personal favorites toolbar and a
local weather panel.

## Permission justification

- `storage`: persists favorites and the chosen weather city
  (`chrome.storage.sync`) and a short-lived weather forecast cache
  (`chrome.storage.local`).
- `favicon`: displays each favorite's site favicon via the Manifest V3
  `_favicon` endpoint.
- `declarativeNetRequestWithHostAccess`: sets one request header, `User-Agent:
  QuietTab (+https://github.com/undevy-org/quiet-tab)`, on requests to
  `nominatim.openstreetmap.org`, which the extension makes when the user taps
  **use your location**. OpenStreetMap's Nominatim usage policy requires an
  application to identify itself, and Chrome does not allow an extension page
  to set `User-Agent` through `fetch`. It is one static rule
  (`rules/nominatim-user-agent.json`) limited to that host (only the
  `User-Agent` header, only `xmlhttprequest`/`other` requests); it cannot
  block, redirect or read any request or response, and it matches no other
  site. Suggested wording for the Web
  Store field: "Adds an identifying User-Agent header to the extension's own
  reverse-geocoding requests to nominatim.openstreetmap.org, as that
  service's usage policy requires. Not used for anything else."
- Host permissions (`api.open-meteo.com`, `air-quality-api.open-meteo.com`,
  `geocoding-api.open-meteo.com`, `nominatim.openstreetmap.org`): fetch
  weather, air quality, and city coordinates for the city the user sets, and
  reverse-geocode rounded coordinates when the user taps **use your location**
  in the city flows. Open-Meteo's endpoints are public and keyless — no API
  key or account. Nominatim is OpenStreetMap's reverse-geocoding service.

## Remote code

No. The extension ships no `eval`/`new Function`/`document.write`, and the
only `<script>` tag in `src/newtab.html` loads a local, packaged file
(`./newtab.js`) — nothing is loaded from a remote host. All host-permission
network requests (`api.open-meteo.com`, `air-quality-api.open-meteo.com`,
`geocoding-api.open-meteo.com`, `nominatim.openstreetmap.org`) fetch JSON data
only, never executable code.
Answer "No, I am not using Remote code" — no justification field needed.

## Data usage disclosure

- **Personally identifiable information:** not collected.
- **Health information:** not collected.
- **Financial and payment information:** not collected.
- **Authentication information:** not collected.
- **Personal communications:** not collected.
- **Location:** when the user types a city, the name goes to Open-Meteo's
  geocoding API; when the user taps **use your location**, the browser's
  geolocation API runs only for that tap (Chrome's permission prompt), and
  rounded coordinates are sent once to Nominatim to resolve a city name.
  The chosen city (name, country, rounded coordinates) is stored in
  `chrome.storage.sync`, so Chrome's own sync carries it to the user's other
  signed-in browsers. Weather requests use those stored coordinates.
  Declare as: location data used only to show weather for the city the user
  chose, never sold or used for advertising; OpenStreetMap data via Nominatim
  when **use your location** is used.
- **Web history:** not collected.
- **User activity:** not collected.
- **Website content:** favorite URLs/labels the user explicitly saves are
  stored (via Chrome's own sync infrastructure, not a project-run server)
  and are never transmitted anywhere except to Chrome's own sync.

## Certifications

- Does not sell or transfer user data to third parties outside approved use
  cases: true.
- Does not use or transfer user data for purposes unrelated to the
  extension's single purpose: true.
- Does not use or transfer user data to determine creditworthiness or for
  lending purposes: true.
