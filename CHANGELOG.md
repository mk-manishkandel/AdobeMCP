# Changelog

## 1.1.0 (2026-11-13)

Nine new tools and richer paint, so most of Illustrator's everyday features have a typed tool.

- `ai_group`: group, ungroup, clipping masks.
- `ai_pathfinder`: unite, minus front, minus back, intersect, exclude, divide.
- `ai_layer`: list, add, rename, show/hide, lock, reorder, delete (with `delete_items` for non-empty layers).
- `ai_swatch`, `ai_symbol`, `ai_graphic_style`: document swatches, symbols and graphic styles (styles merge by default
  so a style like "Drop Shadow" does not erase the item's own fill).
- `ai_distort`: warp (15 styles), twirl, roughen, pucker/bloat, solid extrusion.
- `ai_trace_image`: Image Trace to editable vectors.
- `ai_export_pdf`: print PDFs with presets, bleed, crop marks and CMYK (PDF/X-1a).
- Paths take Bézier handles; strokes take dash, cap and join; fills take `"swatch:<name>"`; `ai_set_item` takes
  `blend_mode`.
- Not possible through scripting, and documented as such: opacity masks, Illustrator's own 3D effect.

## 1.0.0 (2026-11-13)

Production hardening, plus the tools that real poster work showed were missing.

### Reliability
- Client cancellation (`notifications/cancelled`): queued calls are skipped and no reply is sent.
- Per-tool timeouts: quick read-only tools give up after 30–60 s instead of the global limit.
- Oversized JSON-RPC messages (over 16 MB) are rejected with a clear error.
- A broken stdout pipe is logged instead of crashing the server.
- Clean shutdown on SIGINT/SIGTERM. Unhandled rejections are logged; uncaught exceptions are logged before exit.
- Temp scripts are written with mode 0600. Leftovers older than a day are swept at start-up.
- Every call is logged to stderr with its duration and outcome.
- `ai_status` no longer mislabels artboards of inactive documents.
- `ai_get_document_info` tolerates text frames whose attributes cannot be read.

### Safety
- `ai_save` and `ai_export` refuse to overwrite an existing file unless `overwrite: true`.
- `ADOBE_MCP_ALLOW_RUN_SCRIPT=0` hides `ai_run_script`.

### New capabilities
- Gradient fills and strokes (linear or radial, angle, 2–12 stops) on shapes, paths and whole groups.
- `ai_set_item`:
  - `outline` converts text to a single shape, so a gradient can span a word;
  - `glow`, `shadow` and `blur` add soft effects, rendered at 300 ppi.
- `ai_add_shape` with `shape: "path"` draws open or closed paths through `vertices`.
- `runs` on `ai_add_text` / `ai_set_text` styles parts of a text (colour, font, size, tracking).
- `ai_copy_items` copies items from another open document while keeping their layout.
- `ai_open` with `document` switches to a document that is already open.

## 0.1.0

Phases 0–4: stdio MCP server, AppleScript bridge, 18 Illustrator tools, offline and live test suites, demo.
