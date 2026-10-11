# SoCal Swell Chart

A swell map and surf-spot rater for Southern California, Point Conception to the border. One static page, no backend, no API keys.

## Data

- Base map: MapLibre with OpenFreeMap vector tiles (OpenStreetMap data)
- Swell, wind and water temperature: Open-Meteo marine and weather forecast APIs
- Live buoys: Scripps CDIP (THREDDS realtime files)
- Tides: NOAA CO-OPS predictions

All data is fetched in the browser each time the page loads. The forecast is cached for an hour.

## Files

- `index.html` is the built page that GitHub Pages serves.
- `src/spots.js` holds the spot catalog: location, facing direction, swell windows, gain, ideal size and tide. Tune ratings here.
- `src/app.js` holds the data loading, rating model and map.
- `src/head.html` holds the markup and styles.
- `src/land.json` is a coarse backup coastline (Natural Earth 1:10m), used only if map tiles fail to load.
- `./build.sh` rebuilds `index.html` after editing anything in `src/`.

## Ratings

Ratings are model estimates, not observations. The Method tab in the app explains the scoring.
