# Well & Well Log Rendering Pipeline

## Overview

Wells are rendered as translucent yellow cylinders. Each well can optionally display a well log curve (e.g. PHIE, VSH, SWE) as a coloured tube offset horizontally from the well center. Both the well geometry and well log curves are placed in the **same 3D coordinate frame** as the seismic bounding box, inline/crossline planes, faults, and horizons.

---

## 1. Application Initialization

Entry point: `APP_init()` at `app.js:3214`.

```
APP_init()
  ├── SCENE_init()                 # Three.js scene, camera, renderer, lighting, bounding box
  ├── API_isAvailable()            # Check if backend is reachable
  ├── SEISMIC_PLANE_createInline() # Load inline slice plane
  ├── SEISMIC_PLANE_createCrossline()
  ├── DATA_loadAll()               # Fetch all backend data in parallel(-ish)
  │     ├── fetch("api/horizon")   # Horizons
  │     ├── fetch("api/well")      # Wells ←
  │     ├── fetch("api/well-log/{type}/{name}")  # Well logs ←
  │     └── fetch("api/fault")     # Faults
  ├── UI_initControls()            # Wire up slider/button/well-panel UI
  └── SCENE_startRenderLoop()
```

---

## 2. Well Data Loading (`WELL_loadFromJson`)

**Backend endpoint:** `GET /api/well`

**API response type** (`WellApiPayload`, line 1979):
```js
{
  wells: [
    {
      well_name: string,   // e.g. "WELL-001"
      inline: number,      // inline index (0-based, offset already subtracted)
      crossline: number,   // crossline index (0-based)
      top: number,         // TWT top of well
      bottom: number       // TWT bottom of well
    },
    ...
  ],
  count: number
}
```

The `WellApiData` fields (`inline`, `crossline`, `top`, `bottom`) are **already in normalized/index space** — the backend has presumably subtracted `inlineOffset`/`crosslineOffset`. (Compare `HELPER_COORD_realInlineToX` at line 176 which subtracts offsets, vs `inlineToX` at line 161 which works on raw indices.)

For each well in the payload:
1. Skip if `well_name` is missing or already loaded (`GLOBAL_WELL_MAP`).
2. Call `WELL_create(wellData)` → creates 3D mesh and builds the `Well` object.
3. Store in `GLOBAL_WELL_ITEMS[]` and `GLOBAL_WELL_MAP`.

When all wells are loaded, fires `GLOBAL_WELL_ON_LOADED` callback → triggers `UI_populateWellPanel()`.

---

## 3. Well Mesh Creation (`WELL_create`, line 1689)

```js
WELL_create(wellData)
```

### 3.1 Position computation

All coordinate conversions are performed by `HELPER_COORD_*` helpers (lines 161–207) which map seismic index space into a 3D world volume bounded by:

| Axis | Index Range                    | World Range        | Conversion                                                                 |
|------|--------------------------------|--------------------|----------------------------------------------------------------------------|
| X    | inline 0 … (inlineCount−1)    | [0, imageWidth]    | `inlineToX(i) = (i / (count−1)) * imageWidth`                             |
| Y    | TWT (time/depth)               | ~[200, 1600]       | `timeToY(t) = −t + (timeSize + 200)` = `−t + 1600` (inverts so depth↑)   |
| Z    | crossline 0 … (crosslineCount−1)| [0, imageWidth]   | `crosslineToZ(i) = (i / (count−1)) * imageWidth`                          |

Constants (from `GLOBAL_CONFIG_SEISMIC`, line 1):
- `imageWidth = 2790`, `imageHeight = 2800`
- `timeSize = 1400`
- `yTop = 200`, `yBottom = 1600` (derived from timeSize)

The well position is computed as:
```
x  = HELPER_COORD_inlineToX(wellData.inline)     // line 1711
z  = HELPER_COORD_crosslineToZ(wellData.crossline) // line 1712
yTop    = timeToY(wellData.top)       // line 1714
yBottom = timeToY(wellData.bottom)    // line 1715
height  = abs(yTop - yBottom)         // line 1717
centerY = (yTop + yBottom) / 2        // line 1718
```

### 3.2 Mesh

A `CylinderGeometry` with:
- `radiusTop = radiusBottom = wellRadius (10)` (`GLOBAL_CONFIG_STYLE.wellRadius`, line 49)
- `height = computed height` (vertical extent of well)
- `radialSegments = 32`
- Semi-transparent yellow: `color = 0xffff00`, `opacity = 0.4`, `depthWrite = false`

Positioned at `(x, centerY, z)`. `renderOrder = 0` (behind log curves).

### 3.3 Label

`WELL_createLabel()` (line 1542) creates a `THREE.Sprite` placed above the well top:
- Canvas-backed texture with rounded-rect background and well name text.
- Sprite scale: height 15 world-units, width proportional to text aspect ratio.
- Position: `(mesh.x, mesh.y + height/2 + 20, mesh.z)`.
- `renderOrder = 100` (always on top).

---

## 4. Well Log Data Loading

**Backend endpoints:** `GET /api/well-log/{logType}/{wellName}`

Per-well, per-log-type call. The loading is orchestrated in `DATA_loadAll()` at lines 2461–2545:

```
For each logType in ['phie', 'swe', 'vsh']:
  For each wellName in wellNames (in parallel via Promise.allSettled):
    fetch("api/well-log/{logType}/{wellName}")
    → WELL_LOG_addSingleWellData(wellName, logType.toUpperCase(), data.entries)

Then:
  WELL_attachLogData()    // attach log data to wells, extend cylinder height
```

### 4.1 API response type (`WellLogApiItem`, line 1411)

```js
{
  entries: [
    { twt: number, value: number | null },
    ...
  ]
}
```

Where `twt` is two-way travel time (depth) and `value` is the log measurement at that depth. Null values represent gaps in the log.

### 4.2 Storage

`WELL_LOG_addSingleWellData()` (line 1447) stores entries in `GLOBAL_WELL_LOG_MAP`, a `Map<wellName, WellLogDataInstance>`. Each `WellLogDataInstance` is a key-value store per log type (`{ PHIE: [...], VSH: [...], SWE: [...] }`).

### 4.3 Attaching log data to wells

`WELL_attachLogData()` (line 2039) iterates all wells, looks up their log data in `GLOBAL_WELL_LOG_MAP`, and calls `well.setLogData(logData)`.

`well.setLogData` (line 1907):
1. Stores the `logData` reference.
2. Calls `extendToLogRange()` — rebuilds the cylinder geometry to cover the full TWT range found in the log entries (union of well top/bottom + min/max TWT from all log types).
3. Calls `label.updatePosition()` — repositions the sprite to sit above the new (possibly taller) cylinder.

---

## 5. Well Log Curve Rendering (`WELL_LOG_create`, line 1274)

Triggered when the user selects a log type from the UI dropdown, which calls `well.setLogType(logType)` → `WELL_LOG_create(well, entries, logType)`.

### 5.1 Configuration

Each log type has a config in `GLOBAL_CONFIG_WELL_LOG.logTypes` (line 67):

| Type | Color     | Value Range | Fill        |
|------|-----------|-------------|-------------|
| PHIE | `0x00ff88`| [0, 0.4]   | yes, right  |
| VSH  | `0x8b4513`| [0, 1]     | yes, right  |
| SWE  | `0x4169e1`| [0, 1]     | yes, right  |
| None | `0xffffff`| [0, 1]     | no          |

### 5.2 Curve geometry

1. **Segment splitting** (`HELPER_WERLL_LOG_splitIntoSegments`, line 1073): Log entries are split into contiguous segments wherever `value === null`. Each segment is rendered as a separate tube.

2. **Point generation** (`HELPER_WELL_LOG_segmentToPoints`, line 1122): For each entry in a segment:
   ```
   y = timeToY(abs(twt))                          // same Y mapping as the well
   normalizedValue = clamp((value - min) / (max - min), 0, 1)
   offset = (normalizedValue * 2 - 1) * maxLogWidth(10)
   x = wellX + offset                              // lateral offset from well center
   z = wellZ                                       // same Z as the well
   ```
   The offset ranges from `−maxLogWidth` to `+maxLogWidth` (i.e. −10 to +10), placing the log curve to the left or right of the well depending on the log value.

3. **Tube creation**: `CatmullRomCurve3` through the points, wrapped in `TubeGeometry` with:
   - `tubeRadius = 1` (`GLOBAL_CONFIG_WELL_LOG.tubeRadius`)
   - `curveSegments = 12`
   - `renderOrder = 1` (drawn after the well cylinder)
   - Coloured per log type config, 95% opacity

### 5.3 Fill mesh

If `config.fill.enabled` is true (PHIE, VSH, SWE), a **fill mesh** is created via `HELPER_WELL_LOG_createFillMesh` (line 1173):

- For each curve point `(x, y, z)`, adds the curve vertex AND a corresponding vertex at `(refX, y, z)` where `refX = wellX + maxLogWidth` (for `direction: 'right'`).
- Generates triangle indices to form a ribbon. 
- Material: same colour as the log, semi-transparent (`opacity = 0.35`), `depthWrite = false`.
- `renderOrder = 0.5` (between well cylinder and tube).

This creates a shaded "curtain" between the well center line and the log curve, making the log value easier to visually interpret.

---

## 6. Coordinate System & Reference Frame

**Wells and well logs are aligned to the same coordinate system as everything else in the scene.** The coordinate space is defined by the seismic data grid:

```
X (east? / inline): [0, imageWidth=2790]
Y (vertical/depth):  ~[200, 1600]   (inverted TWT: higher Y = shallower)
Z (north? / crossline): [0, imageWidth=2790]
```

This is a single, unified world-space coordinate frame. There is no separate well coordinate system or scaling transform. The bounding box wireframe at `(0,0,0)` to `(2790,2800,2790)` is the visual reference.

### Positioning summary

| Object       | X                                      | Y                           | Z                                       |
|--------------|----------------------------------------|-----------------------------|-----------------------------------------|
| Well center  | `inlineToX(inline)`                   | `(yTop+yBottom)/2`          | `crosslineToZ(crossline)`              |
| Well log curve| `wellX ± [−10,+10]` (based on log value)| `timeToY(twt)` same as well | `wellZ`                                |
| Well label   | same as well X                         | `wellTopY + 20`             | same as well Z                          |
| Bounding box | [0, 2790]                              | [0, 2800]                   | [0, 2790]                               |
| Inline plane | `indexToPosition(index, inlineCount)`  | 0 (plane geometry translated to center) | 0                                      |
| Crossline plane| 0                                     | 0 (plane geometry translated to center) | `indexToPosition(index, crosslineCount)`|
| Horizon points| `realInlineToX(inline)`               | `timeToY(z)` (horizon's `z` = TWT) | `realCrosslineToZ(crossline)`     |
| Fault panels | `seismicToWorld({inline_n, crossline_n, time})` | same | same                         |

All coordinate converters ultimately map indices or real-world coordinates into `[0, imageWidth]` for X/Z and `[200, 1600]` for Y. The origin of the world is at the minimum corner of the bounding box.

### Well extension to log range

When log data is attached, `extendToLogRange()` (line 1775) finds the minimum and maximum TWT across all log entries for that well, merges that range with the original `top`/`bottom` from the API, then recalculates the Y extent and rebuilds the cylinder:
```
newYTop    = timeToY(minTWT)       // min TWT → highest Y (shallowest)
newYBottom = timeToY(maxTWT)       // max TWT → lowest Y (deepest)
newHeight  = abs(newYTop - newYBottom)
newCenterY = (newYTop + newYBottom) / 2
```

This ensures the well cylinder visually spans the full depth range where log data exists, not just the well's top/bottom from the well API.

---

## 7. Interaction & UI

- **Hover**: Raycaster checks well cylinder meshes on mousemove. Hovered well is highlighted (darker yellow) and a tooltip shows the well name.
- **Visibility toggle**: Per-well checkbox or global "Hide All / Show All" button. Toggles cylinder, log tube, fill mesh, and label visibility.
- **Log type selector**: Per-well dropdown (`None`, `PHIE`, `VSH`, `SWE`) or global "Set All..." select. Changing the log type calls `well.setLogType()` which disposes old log meshes and creates new ones via `WELL_LOG_create()`.
