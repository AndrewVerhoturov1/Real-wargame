# View and Memory Heatmap — final verification note

- Temporary branch: `feat/view-memory-heatmap-temp`.
- Final exact visual SHA: `d254e471ed789790123302e466ac8fd3dd5c3e11`.
- Full expanded validation: run `29210607097`, success.
- Focused awareness movement reproduction: run `29210481011`, `3/3` passed.
- System-Chrome Playwright: run `29210611840`, `20/20` passed in `10.6 minutes`.
- Screenshot count: `29`.
- Screenshot artifact: `sha256:80842bc74ae0947fb74672a68de5ee65003dd1b43344982ae462dbcb7daa96ea`.
- Playwright artifact: `sha256:423f0cb603563c431cc7290fee0cf7e19d4083412c2d22548615c5a8f0496982`.
- Raw log: `sha256:65243b16d311e8cd1f4483f0dea9ca9d43ae7c83cc6ae8fbd8c59a4062704f76`.

The earlier `19/20` result was traced to a browser assertion that mixed movement with legitimate live threat-memory quantization updates. Movement stability is now checked deterministically through both the awareness field key and raster render key; real knowledge changes still invalidate the raster. No performance limit was weakened.

Manual review confirmed readable march, engage and search heatmaps, no rotating focus ray, a single `Обзор и память` tab, no panel overlap, readable profile/node controls, an unchanged legacy node-editor layout, and a selectable moving newly placed fighter.

No merge from this temporary branch into `real-wargame-preview` or `main` was performed by this workstream. During verification, preview changed externally and now contains matching implementation files; compare both trees before any future merge or cleanup.
