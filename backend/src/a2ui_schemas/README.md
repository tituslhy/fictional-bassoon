# Pinned A2UI schemas

Unmodified JSON schemas and Apache-2.0 LICENSE copied from the published npm package `@a2ui/web_core@0.10.6`, `src/v1_0/schemas/`, on 1 November 2026. `catalog.json` is copied from `catalogs/basic/catalog.json`.

Source archive: https://registry.npmjs.org/@a2ui/web_core/-/web_core-0.10.6.tgz

Archive SHA-256: `fd3f266e1fae992f5a3928daf1b4ee376a25d2d77617780432058390dfff0d5a`

The renderer implements a restricted v1.0 candidate profile, not the entire standard. Runtime validation registers the basic catalog under its published ID and the envelope's relative `catalog.json` reference; no network resolution is used. Additional component, graph, size, binding, and action restrictions are enforced in `src/interactive_ui.py` and the frontend validator. Only `createSurface` and renderer `action` are supported by this slice; incremental updates, arbitrary functions, and general data-model mutation are not.
