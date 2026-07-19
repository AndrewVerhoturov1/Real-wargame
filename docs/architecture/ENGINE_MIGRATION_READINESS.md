# Engine Migration Readiness

Long-term target: keep the browser prototype as the executable reference for a later Unreal Engine 5/6 implementation. Do not start a parallel Unreal port without a separate user task.

Mandatory rules for new or changed systems:

- core simulation and AI must run without PixiJS, DOM, browser UI or renderer state;
- inputs, outputs and saved scenarios must be versioned, serializable data with stable IDs;
- simulation uses explicit metres, seconds and separate grid coordinates; pixels and Unreal centimetres belong only to adapters;
- gameplay is deterministic: fixed logical steps, seeded randomness and no FPS-dependent decisions;
- authoritative tactical values stay in the core; renderers, textures and shaders only visualize them;
- major mechanics need headless reference fixtures with expected results and decision diagnostics;
- model domain concepts, not Unreal classes: future Actors, Components, Mass or Scene Graph remain adapter choices.

Do not over-engineer the current prototype solely for migration. Preserve clear boundaries and reference tests, then port one subsystem at a time later.
