# NEMURIUM Toolkit

A hostable catalog of agents, skills, tools, and connectors we are actually building.

This is not the archived AI Toolkit Marketplace. That catalog is in `archive/legacy-marketplace/`. This one is small, honest, and written in the live NEMURIUM voice.

Listings have to earn a place: a real job we already specify, a public GlassGraph promise, an Agent Factory agent we actually run, or a product vein with a repo. Do not dump every GitHub folder.

## Status

`PREVIEW_ONLY`. Generated pages live in `preview/toolkit/` with `noindex`. They are not part of the GlassGraph `dist-site` and will not publish to nemurium.com until we choose that.

## Build

```bash
node scripts/build-toolkit-preview.mjs
node scripts/verify-toolkit-preview.mjs
python3 -m http.server 4174 --directory preview/toolkit --bind 127.0.0.1
```

Edit `toolkit/catalog.json`, then rebuild. Do not add Cursor primitives, vendor MCP badges, or count theater.
