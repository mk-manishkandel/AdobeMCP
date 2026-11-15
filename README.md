# adobe-mcp

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-339933)
![macOS](https://img.shields.io/badge/platform-macOS-lightgrey)
![Illustrator 2026](https://img.shields.io/badge/Adobe%20Illustrator-2026-FF9A00)

A local, zero-dependency [MCP](https://modelcontextprotocol.io) server that lets Claude drive **Adobe Illustrator 2026**
on macOS: build social posts, posters and banners, fill templates, make size variants, look at the result, and
export. Photoshop (`ps_*` tools) is planned; the structure is ready for it.

**28 tools**:
- documents, artboards and layers;
- text, with styled runs and Nepali support;
- shapes and Bézier curves;
- gradients, swatches and patterns;
- glow, shadow, blur and blend modes;
- groups, clipping masks and pathfinder;
- symbols and graphic styles;
- warp and other distortions, extrusion;
- image placement and Image Trace;
- live previews that Claude can see;
- PNG, JPG, SVG and WebP export, and print PDFs.

- No npm packages: plain Node ≥ 20 (tested on Node 24.22.1, Apple Silicon).
- Talks to Illustrator through its public scripting interface: AppleScript `do javascript` running ExtendScript.
  Nothing inside the Illustrator app bundle or Adobe folders is installed or modified.
- Full UTF-8, including Nepali (Devanagari) text, which is set with Illustrator's World-Ready composer automatically.

## Setup

1. **Requirements:** macOS, Adobe Illustrator 2026 installed (`/Applications/Adobe Illustrator 2026`), and Node.
   MCP clients do not load your shell `PATH`, so the commands below use absolute paths. Replace
   `/path/to/node` with the output of `which node` (Node 20 or newer) and `/path/to/AdobeMCP` with the folder
   you cloned this repository into.
2. **Check it offline** (no Illustrator needed):

   ```bash
   cd /path/to/AdobeMCP && npm test
   ```

3. **Register with Claude Code:**

   ```bash
   claude mcp add adobe -- /path/to/node /path/to/AdobeMCP/server.mjs
   ```

   This uses the default *local* scope: the server is available when Claude Code runs in this project folder.
   To have it in every folder, add `-s user` after `add`. Check with `claude mcp get adobe`.

4. **Register with the Claude desktop app:** open *Settings → Developer → Edit Config*, which opens
   `~/Library/Application Support/Claude/claude_desktop_config.json`, and add the `adobe` entry under
   `mcpServers` (merge it with any servers already there):

   ```json
   {
     "mcpServers": {
       "adobe": {
         "command": "/path/to/node",
         "args": ["/path/to/AdobeMCP/server.mjs"]
       }
     }
   }
   ```

   Quit and reopen Claude. The `ai_*` tools appear under the tools (slider) menu.

5. **Live check** (launches Illustrator, creates and closes its own test documents, leaves yours alone):

   ```bash
   npm run test:live
   ```

   ```bash
   npm run demo
   ```

   The demo builds a 1080×1080 admission post and a 1080×1920 story and writes `out/admission-post.png`,
   `out/admission-story.png` and `out/admission-2026.ai`. Use your own images with
   `npm run demo -- --photo /abs/campus.jpg --logo /abs/logo.svg`.

### The macOS Automation prompt

The first time the server talks to Illustrator, macOS asks:
**"<app>" wants access to control "Adobe Illustrator.app".** Click **Allow**. The `<app>` is whatever launched the
server: **Claude** for the desktop app, or your terminal (Terminal, iTerm, Ghostty, VS Code…) for Claude Code.

If you clicked *Don't Allow*, tools fail with an error containing `-1743`. Fix it in **System Settings → Privacy &
Security → Automation**: find the app and turn on **Adobe Illustrator** under it. If it isn't listed, run
`tccutil reset AppleEvents` (this only resets Automation permissions) and try again to get the prompt back.

Other errors you might see:

| Error | Meaning |
| --- | --- |
| Illustrator not found (`-1728` / `-10814`) | Not installed, or a different version. Set `AI_APP` (see below). |
| Timed out (`-1712`) | A call took longer than `ADOBE_MCP_TIMEOUT`. The script may still be running inside Illustrator. |
| Illustrator quit (`-600` / `-609`) | Illustrator crashed or was closed during a call. Call again; it relaunches. |

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_APP` | `com.adobe.illustrator` | Bundle id or app name to target |
| `ADOBE_MCP_TIMEOUT` | `600` | Seconds per call before giving up |
| `ADOBE_MCP_DEBUG` | unset | `1` = verbose logging on stderr |
| `ADOBE_MCP_KEEP_TMP` | unset | `1` = keep the generated `.jsx` files in `$TMPDIR/adobe-mcp` |
| `ADOBE_MCP_ALLOW_RUN_SCRIPT` | `1` | `0` = hide `ai_run_script`, so Claude can only use the typed tools |

Pass them in the desktop config as `"env": { "ADOBE_MCP_DEBUG": "1" }`, or with `-e KEY=value` on `claude mcp add`.

## Coordinate conventions

All tools except `ai_run_script` use **design coordinates**:

- Units are **px** (1 px = 1 pt in Illustrator), so a 1080×1080 document exports as 1080×1080 px at 100 %.
- **(0, 0) is the top-left corner of the artboard; x grows right, y grows down.**
- A box is `{x, y, w, h}` with (x, y) its top-left corner. Positions are relative to the item's artboard:
  an item at `x: 80` on the story artboard is 80 px from *that* artboard's left edge.
- Reported boxes are the **visible** bounds: a fill-mode photo reports its crop box, not the hidden image.
- Point text: `y` is the top of the text frame. `x` is the left edge, centre or right edge depending on `align`,
  so `align: "center", x: 540` centres text on a 1080-wide artboard.
- Artboards are numbered from 0. Create tools use the active artboard; edit tools use the item's own artboard.
- Colours are `"#RRGGBB"`. Items are referenced by the `id` a tool returned, or by a unique `name`.

`ai_run_script` runs raw ExtendScript and sees Illustrator's **native** coordinates (y grows up).

## Tool reference

| Tool | What it does |
| --- | --- |
| `ai_status` | Illustrator version and open documents. Call first to check the connection. |
| `ai_get_document_info` | Artboards, layers and every item (id, type, box, text/font/colours, image file…). |
| `ai_new_document` | New document of width × height, optional background colour (on a locked "Background" layer). |
| `ai_open` / `ai_close` / `ai_save` | Open a file, or switch to an open document by name; close (discard or save); save as .ai or .pdf (`overwrite: true` to replace a file). |
| `ai_copy_items` | Copy items (a logo, a whole block) from another open document onto this one, keeping their layout. |
| `ai_add_artboard` | Add a size variant to the right of the existing artboards. |
| `ai_list_fonts` | Search installed fonts → PostScript names (e.g. `"devanagari"`). |
| `ai_add_text` | Point text, or area text with wrapping when `width` is given; reports overflow. `runs` styles parts of the text. |
| `ai_set_text` | Template filling: replace text/style, keep the anchor, `max_width` / `shrink_to_fit`. |
| `ai_add_shape` | Rectangle, rounded rectangle, ellipse, polygon, star, line, or a free path through `vertices` (with Bézier handles for curves). Fills can be gradients or swatches; strokes can be dashed with round/square caps. |
| `ai_place_image` | Place a photo/logo into a box: `fill` (crop), `fit`, `stretch`, `none`; linked or embedded. |
| `ai_set_item` | Move, resize, rotate, recolour (colour or gradient, also whole groups), opacity, z-order, layer, hide/lock, duplicate (to another artboard), delete. `outline` turns text into a shape; `glow`, `shadow` and `blur` add soft effects; `blend_mode` (multiply, screen, overlay…). |
| `ai_group` | Group, ungroup, or make a clipping mask (show items only inside a shape or text). |
| `ai_pathfinder` | Unite, minus front/back, intersect, exclude or divide shapes. |
| `ai_layer` | List, add, rename, show/hide, lock, reorder or delete layers. |
| `ai_swatch` | List swatches or save a colour/gradient as a named swatch; paint with `"swatch:<name>"` (patterns too). |
| `ai_symbol` | Turn artwork into a symbol and place instances of it. |
| `ai_graphic_style` | List graphic styles and apply them to items. |
| `ai_distort` | Warp (15 styles), twirl, roughen, pucker/bloat, and solid 3D-style extrusion. |
| `ai_trace_image` | Image Trace a photo or logo into editable vector paths. |
| `ai_align` | Align items to the artboard with a margin, individually or as a group. |
| `ai_preview` | Render an artboard to a PNG and return it as an image so Claude can see the design. |
| `ai_export` | Export an artboard to PNG, JPG, SVG or WebP at a given pixel width/height or scale (`overwrite: true` to replace a file). |
| `ai_export_pdf` | Print PDF of chosen artboards with a PDF preset, bleed and crop marks; `cmyk: true` for CMYK (PDF/X-1a). |
| `ai_undo` | Undo the last N Illustrator steps. |
| `ai_run_script` | Escape hatch: run raw ExtendScript. Remove it with `ADOBE_MCP_ALLOW_RUN_SCRIPT=0`. |

Each tool's full parameter list is in its JSON schema, which Claude sees directly. Typical flow:
`ai_status` → `ai_new_document` / `ai_open` → add and edit items → `ai_preview` → fix → `ai_export`.

### Paint, effects and text runs

- **Gradients:** anywhere `fill` or `stroke` takes a colour it also takes
  `{"type": "linear", "angle": -90, "stops": [{"color": "#FF2BD6", "position": 0}, {"color": "#00E5FF", "position": 100}]}`.
  `angle` 0 runs left → right; -90 runs top → bottom. `type: "radial"` ignores the angle.
- **Gradient text:** live text cannot show a gradient. Pass `outline: true` in the same `ai_set_item` call; the text
  becomes one shape that keeps its name (it can no longer be edited as text).
- **Glow / shadow:** `ai_set_item` with `glow: {radius, opacity, color}` or `shadow: {x, y, blur, opacity, color}`
  adds a blurred copy directly behind the item, named "*item* glow" / "*item* shadow" and returned as
  `glow_id` / `shadow_id` so it can be moved or deleted. `blur: N` blurs the item itself. Blurs are rendered at
  300 ppi (the document's raster-effect resolution is raised if lower).
- **Curves:** a path vertex can be `{"x": 100, "y": 60, "in": [60, 60], "out": [140, 60]}`; `in`/`out` are the
  Bézier handle positions in the same coordinates.
- **Strokes:** `dash: [12, 6]`, `cap: "round"`, `join: "bevel"` on `ai_add_shape` / `ai_set_item`.
- **Swatches and patterns:** `fill: "swatch:Brand Gold"` uses any document swatch, including pattern swatches.
- **Distortions:** `ai_distort` warp, twirl and roughen are live effects (still editable in Illustrator's Appearance
  panel; `expand: true` flattens them). Illustrator ignores scripted settings for Pucker & Bloat and 3D, so
  `pucker_bloat` reshapes the curves directly and `extrude` builds a solid side from stacked copies.
- **Text runs:** `runs: [{"match": "V5.0", "color": "#FFC20E"}, {"start": 0, "length": 3, "font": "Menlo-Bold"}]`
  on `ai_add_text` / `ai_set_text` styles parts of one text item (colour, font, size, tracking).
- **Fonts:** some fonts appear in `ai_list_fonts` but are not activated (e.g. un-synced Adobe Fonts) and render with
  a fallback. Check with `ai_preview`; system fonts such as Avenir Next, Helvetica Neue and Menlo always work.

### Not available

- **Opacity masks:** Illustrator offers no scripting access (no API and no menu command), so they cannot be made
  through this server. For a fade, use a gradient whose stops have `opacity`.
- **True 3D (Effect > 3D and Materials):** not scriptable; `ai_distort` `extrude` gives a flat-shaded 3D look instead.

## Production behaviour

- **Timeouts:** each call is limited to `ADOBE_MCP_TIMEOUT` seconds; quick read-only tools (`ai_status`,
  `ai_get_document_info`, `ai_list_fonts`, `ai_undo`) use a shorter limit of their own (30–60 s).
- **Cancellation:** when the client cancels a request (`notifications/cancelled`), a call still waiting in the queue
  never runs. A call Illustrator has already started runs to completion (ExtendScript cannot be interrupted from
  outside); its result is dropped, and `ai_undo` reverts it. No reply is sent for a cancelled request, as the MCP
  spec requires.
- **No silent overwrites:** `ai_save` and `ai_export` refuse to replace an existing file unless `overwrite: true`.
- **Input limits:** every argument is validated against its schema before Illustrator is called; JSON-RPC
  messages over 16 MB are rejected.
- **Temp files:** scripts are written to `$TMPDIR/adobe-mcp` with mode `0600`, deleted after each call, and leftovers
  older than a day are removed at start-up.
- **Logging:** stderr only (stdout is the protocol). Each call logs its tool name, duration and outcome; set
  `ADOBE_MCP_DEBUG=1` for more.
- **Shutdown:** SIGINT/SIGTERM or the client closing stdin stops the server cleanly; a broken stdout pipe is
  logged instead of crashing.

## How it works

```
Claude ──stdio JSON-RPC──▶ server.mjs ─▶ src/mcp.mjs ─▶ src/tools.mjs (validate args, serial queue)
                                                          │
                                                          ▼
                     src/bridge.mjs: writes common.jsx + app .jsx + call into a temp UTF-8 file,
                     then osascript → tell application id "com.adobe.illustrator" to do javascript
                                                          │
                                                          ▼
                     jsx/*.jsx run inside Illustrator → {ok, result} JSON → MCP result
```

- `src/apps/index.mjs` is the app registry. Each app is `{id, target, jsxFiles, instructions, tools}`.
- `src/apps/illustrator/*-tools.mjs` hold the tool table (name, description, JSON schema).
- `jsx/common.jsx` is shared by every app (JSON polyfill, error envelope). `jsx/illustrator*.jsx` hold the
  Illustrator functions, one per tool, with the same name as the tool.
- JSX files are read on every call, so editing JSX needs no server restart. Editing `.mjs` files does
  (in Claude Code: `/mcp` → reconnect; in the desktop app: restart Claude).

## Adding a tool

A tool is **a JSX function plus a schema entry with the same name**. Example: `ai_hello`.

1. **JSX function** in the matching `jsx/illustrator-*.jsx` file. ExtendScript is ES3: use `var`, no arrow
   functions, no `JSON`. It receives the validated arguments (defaults filled in) and returns a plain object:

   ```js
   function ai_hello(a) {
     var doc = __requireDoc();                  // fails with a clear message if no document is open
     if (doc.artboards.length > 1 && a.shout) __fail('Shouting only works with one artboard.');  // user-facing error
     var message = 'Hello ' + a.name;
     return { message: a.shout ? message.toUpperCase() : message, document: doc.name };
   }
   ```

   Use the helpers in `jsx/illustrator.jsx`: `__toAi` / `__fromAi` (coordinates), `__findItem` (id or name),
   `__itemInfo`, `__makeColor`, `__bounds`.

2. **Schema entry** in the matching `src/apps/illustrator/*-tools.mjs` array:

   ```js
   const hello = {
     name: 'ai_hello',
     description: 'Say hello (example). Explain what it does and when to use it, for Claude.',
     inputSchema: objectSchema(
       { name: { type: 'string', minLength: 1 }, shout: { type: 'boolean', default: false } },
       ['name'],
     ),
     annotations: { readOnlyHint: true },
   };
   export const documentTools = Object.freeze([/* … */, hello]);
   ```

   Arguments are validated against the schema before Illustrator is called; unknown keys are rejected.
   File-path arguments should use `filePath()` plus `handler: withPaths(['path'])` so `~` is expanded.
   For a tool that needs Node-side work (like `ai_preview` returning an image), add `handler(args, ctx)` and use
   `ctx.call(fnName, args)` to run JSX.

3. **Test:** add the name to `REQUIRED_TOOLS` in `test/tools-catalog.test.mjs` (the test checks every tool has a
   JSX function and a valid schema), run `npm test`, then add a live check to `test/live/live.mjs` and run
   `npm run test:live`.

**Adding Photoshop later:** create `jsx/photoshop.jsx` and `src/apps/photoshop/index.mjs` exporting
`photoshopApp(env)` with `target` (bundle id `com.adobe.Photoshop`), `jsxFiles` and `ps_*` tools, then add it to
`loadApps` in `src/apps/index.mjs`. The bridge, queue, validation and MCP layers are shared.

## Tests

| Command | Needs Illustrator | What it covers |
| --- | --- | --- |
| `npm test` | no | MCP protocol, validation, bridge (fake osascript), JSX parse/ES3 lint, tool catalog |
| `npm run test:coverage` | no | Same, with coverage |
| `npm run test:live` | yes | Every tool through the real server over stdio |
| `npm run demo` | yes | End-to-end admission post + story export |

## License

[MIT](LICENSE)
