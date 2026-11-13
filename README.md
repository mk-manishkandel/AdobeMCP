# adobe-mcp

A local, zero-dependency [MCP](https://modelcontextprotocol.io) server that lets Claude drive **Adobe Illustrator 2026**
on macOS: build social posts, posters and banners, fill templates, make size variants, look at the result, and
export. Photoshop (`ps_*` tools) is planned; the structure is ready for it.

- No npm packages: plain Node ≥ 20 (tested on Node 24.22.1, Apple Silicon).
- Talks to Illustrator through its public scripting interface: AppleScript `do javascript` running ExtendScript.
  Nothing inside the Illustrator app bundle or Adobe folders is installed or modified.
- Full UTF-8, including Nepali (Devanagari) text, which is set with Illustrator's World-Ready composer automatically.

## Setup

1. **Requirements:** macOS, Adobe Illustrator 2026 installed (`/Applications/Adobe Illustrator 2026`), and Node.
   The commands below use the absolute Node path `~/node-v24.22.1-darwin-arm64/bin/node`, because MCP clients
   do not load your shell `PATH`.
2. **Check it offline** (no Illustrator needed):

   ```bash
   cd "/Users/mkbook/Desktop/Adobe MCP" && npm test
   ```

3. **Register with Claude Code:**

   ```bash
   claude mcp add adobe -- /Users/mkbook/node-v24.22.1-darwin-arm64/bin/node "/Users/mkbook/Desktop/Adobe MCP/server.mjs"
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
         "command": "/Users/mkbook/node-v24.22.1-darwin-arm64/bin/node",
         "args": ["/Users/mkbook/Desktop/Adobe MCP/server.mjs"]
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
| `ai_open` / `ai_close` / `ai_save` | Open .ai/.pdf/.svg/.eps; close (discard or save); save as .ai or .pdf. |
| `ai_add_artboard` | Add a size variant to the right of the existing artboards. |
| `ai_list_fonts` | Search installed fonts → PostScript names (e.g. `"devanagari"`). |
| `ai_add_text` | Point text, or area text with wrapping when `width` is given; reports overflow. |
| `ai_set_text` | Template filling: replace text/style, keep the anchor, `max_width` / `shrink_to_fit`. |
| `ai_add_shape` | Rectangle, rounded rectangle, ellipse, polygon, star, line. |
| `ai_place_image` | Place a photo/logo into a box: `fill` (crop), `fit`, `stretch`, `none`; linked or embedded. |
| `ai_set_item` | Move, resize, rotate, recolour, opacity, z-order, layer, hide/lock, duplicate (to another artboard), delete. |
| `ai_align` | Align items to the artboard with a margin, individually or as a group. |
| `ai_preview` | Render an artboard to a PNG and return it as an image so Claude can see the design. |
| `ai_export` | Export an artboard to PNG, JPG, SVG or WebP at a given pixel width/height or scale. |
| `ai_undo` | Undo the last N Illustrator steps. |
| `ai_run_script` | Escape hatch: run raw ExtendScript. |

Each tool's full parameter list is in its JSON schema, which Claude sees directly. Typical flow:
`ai_status` → `ai_new_document` / `ai_open` → add and edit items → `ai_preview` → fix → `ai_export`.

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
