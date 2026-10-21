# Privacy

## Data Sent

The extension sends requests to Open-Meteo's public, keyless APIs to fetch weather
for the city you choose, and may send one reverse-geocoding request per activation
of **use your location** in the city flows:

```text
https://api.open-meteo.com/v1/forecast
https://air-quality-api.open-meteo.com/v1/air-quality
https://geocoding-api.open-meteo.com/v1/search
https://nominatim.openstreetmap.org/reverse
```

The city name you type is sent to Open-Meteo's geocoding endpoint to resolve
coordinates. When you tap **use your location**, the extension asks the browser
for your position (`navigator.geolocation`, Chrome's own permission prompt). Only
after you allow it, the rounded coordinates (two decimal places, about 1 km) are
sent once to Nominatim (OpenStreetMap) to resolve a city name. Weather requests
then use the stored rounded coordinates, as before. Nominatim and Open-Meteo see
your IP address on those HTTPS requests, like any public API.

For favorites, the extension may ask Chromium for a site's favicon through
the Manifest V3 `_favicon` endpoint. Custom image URLs, if configured by the
user, are loaded by the new tab page so they can be displayed as tile icons.
The check that replaces Chromium's default grey globe with a letter runs locally
on the page and still requests only `_favicon`.

Location data is not sold or used for advertising.

## Data Stored

The extension stores the following in `chrome.storage.local`, scoped to this
browser profile only:

- a short-lived weather forecast cache;
- one flag recording that you closed the first-run city prompt on this device
  (it holds no personal data and is not synced).

The extension stores the following in `chrome.storage.sync`:

- the weather city you chose (its name, country, and your rounded coordinates
  from typing, choosing a suggestion, or **use your location**);
- your favorite links' saved URLs;
- labels;
- domains;
- icon mode and optional custom image URLs;
- tile background colors and tile size;
- each tile's position and size on the grid, and whether a weather tile is shown or hidden;
- creation and update timestamps.

`chrome.storage.sync` is Chrome's own built-in sync feature, not a
project-run service: if the browser is signed into a Google account with
sync enabled, favorites and the chosen city follow the user to their other
signed-in Chromium browsers running this same extension. There is no synchronization service,
project backend, telemetry, or analytics endpoint operated by this
extension — sync, when it happens, is entirely Chrome's own infrastructure.
If sync is off or unavailable, favorites and the chosen city still work
locally, just without cross-device propagation.

## Background Activity

There is no background polling and no scheduled network activity: nothing is
polled or repeated on a timer, and once a tab has loaded, a hidden tab starts no
request. A weather request happens only in these cases: when a new tab opens
with a chosen city and no saved weather for it from the last 30 minutes; when
you come back to a tab that is already open and its weather failed to load or
is 30 minutes old or more; when the browser reports that the network is back
while the tab is visible and its weather is in that state; when you press a
weather tile to try again; or when you explicitly change the city. These
requests go to the same Open-Meteo endpoints listed under Data Sent, for the
city you chose, and send nothing new. A Nominatim request happens only when you
activate **use your location** and the browser returns a position.

Removing the extension through the browser's extension manager removes its
local extension storage according to the browser's normal extension-data
behavior.

## OpenStreetMap

City names from **use your location** come from OpenStreetMap data via
[Nominatim](https://nominatim.openstreetmap.org/). © OpenStreetMap contributors.
