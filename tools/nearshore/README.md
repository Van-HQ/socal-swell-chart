# Nearshore wave transform (experiment, not used by the app yet)

`trace.js` traces waves backward from each surf spot to deep water over real sea-floor depth
(Terrarium tiles, fetched by `.github/workflows/fetch-bathymetry.yml` onto the `data` branch)
and over breakwaters (OpenStreetMap, `fetch-structures.yml`). `k_table.json` holds, for every spot,
the fraction of swell height reaching it (x100) for 72 swell directions (5 deg steps) at periods 7, 10, 13, 16, 20 s.

Status: sanity-checked against known behaviour (Seal Beach loses northwest swell, Malibu loses west/northwest,
Blacks loses southwest), but it does not explain Surfline's smaller Seal Beach surf, and it disagrees with the
hand-set windows at many spots (for example the Santa Barbara channel and Trestles on south swell). Not wired in
until it can be checked against more real observations.

Run: copy `t.npy` (bathymetry) and `struct.json` (structures) from the `data` branch next to `trace.js`, then `node runall.js 0 1`.
