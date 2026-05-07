# Horizon Rendering Pipeline

## Overview

Horizons represent geological surfaces (top and bottom of a formation) reconstructed from seismic interpretation. They are rendered as **color-coded point clouds** (`THREE.Points`) in the same 3D coordinate frame as the seismic bounding box, inline/crossline planes, wells, and faults.

Each horizon point cloud consists of thousands of individual points, each positioned at its inline/crossline location and colored based on its TWT (two-way travel time) depth value.

---

## 1. Application Initialization

Entry point: `APP_init()` at `app.js:3214`.

```
APP_init()
  ├── SCENE_init()                 # Three.js scene, camera, renderer, lighting, bounding box
  ├── API_isAvailable()            # Check if backend is reachable
  ├── SEISMIC_PLANE_createInline() # Load inline slice plane
  ├── SEISMIC_PLANE_createCrossline()
  ├── DATA_loadAll()               # Fetch all backend data
  │     ├── fetch("api/horizon")   # Horizons ←
  │     ├── fetch("api/well")      # Wells
  │     ├── fetch("api/well-log/{type}/{name}")  # Well logs
  │     └── fetch("api/fault")     # Faults
  ├── UI_initControls()            # Wire up slider/button UI
  └── SCENE_startRenderLoop()
```

---

## 2. Backend API Endpoint

**Endpoint:** `GET /api/horizon` — fetched at `app.js:2406` via `API_fetchJson('horizon')`.

### 2.1 API Response Type (`HorizonApiPayload`, `app.js:2370`)

```js
{
  horizons: RawHorizon[],  // array of raw horizon records
  count: number            // total point count
}
```

### 2.2 Raw Record Type (`RawHorizon`, `app.js:2291`)

```js
{
  Inline: number,         // real inline number (e.g. 10001–11092)
  Crossline: number,      // real crossline number (e.g. 997–1545)
  top: number | null,     // TWT value for top surface (null or 0 = no point)
  bottom: number | null   // TWT value for bottom surface (null or 0 = no point)
}
```

Each record contains both `top` and `bottom` fields as a "wide" row. A single record can contribute a point to the Top horizon, the Bottom horizon, both, or neither.

The inline/crossline values are **real** (not 0-based indices) — the `inlineOffset` (10000) and `crosslineOffset` (996) are subtracted during coordinate conversion (see Section 5).

---

## 3. Data Transformation (`HELPER_DATA_transformHorizon`)

**Location:** `app.js:2300`

This function converts the raw API payload (`RawHorizon[]`) into one or two `HorizonData` objects:

```js
HELPER_DATA_transformHorizon(rawHorizons)
  → HorizonData[]
```

### 3.1 Processing Logic

For each `RawHorizon` record:

1. If `horizon.top != null && horizon.top !== 0`:
   - Create a `TopHorizonPoint`:
     ```
     { inline: horizon.Inline, crossline: horizon.Crossline, z: horizon.top }
     ```
   - Track `topMin` / `topMax` across all top points.

2. If `horizon.bottom != null && horizon.bottom !== 0`:
   - Create a `BottomHorizonPoint`:
     ```
     { inline: horizon.Inline, crossline: horizon.Crossline, z: horizon.bottom }
     ```
   - Track `bottomMin` / `bottomMax` across all bottom points.

### 3.2 Output Type (`HorizonData`, `app.js:737`)

```js
{
  name: "Top" | "Bottom",
  points: HorizonPoint[],
  z_min: number,   // minimum TWT value across points
  z_max: number    // maximum TWT value across points
}
```

### 3.3 HorizonPoint Type (`app.js:730`)

```js
{
  inline: number,    // real inline number (matches RawHorizon.Inline)
  crossline: number, // real crossline number (matches RawHorizon.Crossline)
  z: number          // TWT time value (= top or bottom from raw record)
}
```

> **Important:** In the horizon domain, the field named `z` holds the **TWT (time/depth)** value, NOT the 3D Z coordinate. This `z` field is mapped to the Y axis in the 3D world (see Section 5).

---

## 4. Scene Insertion (`HORIZON_addFromJson` → `HORIZON_create`)

**Location:** `app.js:893`, `app.js:762`

After transformation, each `HorizonData` is passed into the rendering pipeline:

```js
for (const horizon of transformedHorizons) {
  HORIZON_addFromJson(horizon)
}
```

`HORIZON_addFromJson` calls `HORIZON_create(horizonData)` and pushes the result into `GLOBAL_HORIZON_ITEMS[]` for lifecycle management (visibility toggling, disposal).

### 4.1 `HORIZON_create` (app.js:762)

1. **Compute inline/crossline ranges** (lines 830–843):
   - Iterates all `horizonData.points` to find `minInline`, `maxInline`, `minCrossline`, `maxCrossline`.
   - These ranges (along with `z_min`/`z_max` from the API data) form a `HorizonRange` object.

2. **Call `HELPER_HORIZON_createPointCloud(points, ranges)`** (line 845).

3. **Return visibility/dispose interface:**
   ```js
   { setVisible(v), dispose() }
   ```
   This allows the UI to toggle visibility (`HORIZON_setAllVisible`) and clean up resources.

### 4.2 Point Cloud Creation (`HELPER_HORIZON_createPointCloud`, `app.js:771`)

This is the core rendering function. For each point, it computes 3D position and color, builds a `THREE.BufferGeometry`, and creates a `THREE.Points` mesh.

**Position computation** (lines 783–788):
```js
const x = HELPER_COORD_realInlineToX(point.inline)    // inline → X
const z = HELPER_COORD_realCrosslineToZ(point.crossline) // crossline → Z
const y = HELPER_COORD_timeToY(point.z)                // TWT → Y
positions.push(x, y, z)
```

**Color computation** (lines 790–803):
```js
const zRange = ranges.z.max - ranges.z.min   // TWT span
const normalizedZ = (point.z - ranges.z.min) / (zRange / 2)  // [0, 2]
color.setHSL(normalizedZ * 0.7, 1.0, 0.5)   // hue ∈ [0, 0.7] (red → green)
```

The color is purely depth-based: shallower points (lower TWT) appear redder, deeper points (higher TWT) appear greener.

**Mesh construction** (lines 805–825):
```js
geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
geometry.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3))

new THREE.Points(
  geometry,
  new THREE.PointsMaterial({
    size: GLOBAL_CONFIG_STYLE.horizonPointSize,  // = 2
    vertexColors: true
  })
)
```

The resulting `THREE.Points` object is added to the scene via `SCENE_add`.

---

## 5. Coordinate System & Reference Frame

Horizons are placed in the **same unified world-space coordinate frame** as all other scene objects. The coordinate space is defined by the seismic data grid:

| Axis | Seismic Domain        | World Range        | Conversion                                                                               |
|------|-----------------------|--------------------|---------------------------------------------------------------------------------------   |
| X    | Inline (real, e.g. 10001–11092) | [0, imageWidth=2790] | `realInlineToX(realInline) = ((realInline − inlineOffset) / (inlineCount−1)) × imageWidth` |
| Y    | TWT time/depth        | ~[200, 1600]       | `timeToY(t) = −t + (timeSize + 200)` = `−t + 1600` (inverts: higher TWT → lower Y)     |
| Z    | Crossline (real, e.g. 997–1545) | [0, imageWidth=2790]  | `realCrosslineToZ(realCrossline) = ((realCrossline − crosslineOffset) / (crosslineCount−1)) × imageWidth` |

### 5.1 Coordinate Converters Used by Horizons

| Converter (`app.js` line)          | Purpose                                                        |
|------------------------------------|----------------------------------------------------------------|
| `HELPER_COORD_realInlineToX` (176) | Subtracts `inlineOffset` (10000), normalizes by `inlineCount`, scales by `imageWidth` |
| `HELPER_COORD_realCrosslineToZ` (182) | Subtracts `crosslineOffset` (996), normalizes by `crosslineCount`, scales by `imageWidth` |
| `HELPER_COORD_timeToY` (188)       | `return -time + (timeSize + 200)` — inverts TWT so depth increases downward in Y |

### 5.2 Why `realInlineToX` vs `inlineToX`?

The horizon API returns **real inline/crossline numbers** (e.g. inline 10001 instead of index 0). Therefore `realInlineToX` is used — it subtracts the offset first:

```
realInlineToX(10001) → (10001 - 10000) / 1091 * 2790 ≈ 0
realInlineToX(11092) → (11092 - 10000) / 1091 * 2790 ≈ 2790
```

In contrast, wells use `inlineToX` directly because the well API returns **0-based index values** (offsets already subtracted by the backend).

### 5.3 Why `point.z` Maps to Y (Not Z)

The horizon data model uses `z` to store the **TWT time/depth** value (geological convention). In the 3D scene:

- The Y axis represents depth (inverted TWT).
- The Z axis represents crossline position.

Therefore `point.z` (TWT) → `HELPER_COORD_timeToY(point.z)` → 3D Y coordinate.

This is the same pattern used by faults: `faultPoint.time` → `HELPER_COORD_timeToY(time)` → 3D Y.

### 5.4 Alignment to the Bounding Box

The bounding box spans `(0,0,0)` to `(2790, 2800, 2790)` in world space. Horizon X and Z values are mapped to `[0, imageWidth=2790]` — they lie flat within the box's XZ footprint. Horizon Y values fall within `[yTop=200, imageHeight−200=1600]`, matching the bounding box's vertical extent.

**Horizons are aligned to the bounding box, not to any specific inline/crossline plane.** The depth step (1100) defined in `GLOBAL_CONFIG_SEISMIC` is NOT used by horizon rendering — it's only referenced in the config and not consumed by any horizon coordinate converter.

---

## 6. Key Parameters

| Parameter                              | Value | Source                          | Effect                                     |
|----------------------------------------|-------|---------------------------------|--------------------------------------------|
| `horizonPointSize`                     | 2     | `GLOBAL_CONFIG_STYLE` (line 50) | Size of each rendered point in world units |
| `imageWidth`                           | 2790  | `GLOBAL_CONFIG_SEISMIC` (line 5) | Max X and Z extent of the bounding box     |
| `imageHeight`                          | 2800  | `GLOBAL_CONFIG_SEISMIC` (line 6) | Max Y extent of the bounding box           |
| `inlineOffset`                         | 10000 | `GLOBAL_CONFIG_SEISMIC` (line 10) | Subtracted from real inline values         |
| `crosslineOffset` (sic, `croslineOffset`) | 996  | `GLOBAL_CONFIG_SEISMIC` (line 11) | Subtracted from real crossline values   |
| `inlineCount`                          | 1092  | `GLOBAL_CONFIG_SEISMIC` (line 2) | Total inline lines (for normalization)     |
| `crosslineCount`                       | 549   | `GLOBAL_CONFIG_SEISMIC` (line 3) | Total crossline lines (for normalization)  |
| `timeSize`                             | 1400  | `GLOBAL_CONFIG_SEISMIC` (line 4) | TWT range → `getVerticalOffset() = 1600`   |

---

## 7. Visibility & Lifecycle

### 7.1 Toggling

The UI "Show Horizon / Hide Horizon" button (`toggleHorizonBtn`, `app.js:2960`) calls:
```
HORIZON_setAllVisible(visible)
```
which iterates `GLOBAL_HORIZON_ITEMS[]` and sets `pointCloud.visible` on each `THREE.Points` mesh.

### 7.2 Disposal

Not currently called during normal operation, but each `HorizonComponent` exposes a `dispose()` method that:
1. Removes the points mesh from the scene (`SCENE_remove`)
2. Disposes `geometry` and `material` to free GPU memory
3. Nullifies the local `pointCloud` reference

The global array `GLOBAL_HORIZON_ITEMS` is not cleared on disposal of individual items — dispose only frees Three.js resources. Full cleanup would require iterating and disposing all items plus clearing the array.

---

## 8. Color Mapping Detail

The HSL hue ranges from **0 (red)** to **0.7 (green)** mapped linearly across the TWT range:

```
normalized = (pointTWT - z_min) / ((z_max - z_min) / 2)
hue = normalized * 0.7
```

Note the divisor is `zRange / 2`, not `zRange`. This means:
- Points near `z_min` get `normalized ≈ 0`, `hue ≈ 0` → **red**
- Points near the midpoint get `normalized ≈ 1`, `hue ≈ 0.7` → **green**
- Points near `z_max` get `normalized ≈ 2`, `hue ≈ 1.4` → wraps back to cyan/blue-green

So the full TWT range maps to approximately red → green → cyan, giving a visual depth gradient. Using `zRange / 2` instead of `zRange` stretches the hue range, producing more color contrast across the horizon surface.

---

## 9. Complete Rendering Flow Summary

```
DATA_loadAll()
  │
  ├── API_fetchJson('horizon')
  │     → GET http://127.0.0.1:5000/api/horizon
  │     → HorizonApiPayload { horizons: RawHorizon[], count }
  │
  ├── HELPER_DATA_transformHorizon(rawHorizons)
  │     │
  │     ├── Separates top ≠ null → TopHorizonData { name:"Top", points, z_min, z_max }
  │     └── Separates bottom ≠ null → BottomHorizonData { name:"Bottom", points, z_min, z_max }
  │
  └── For each HorizonData:
        └── HORIZON_addFromJson(horizonData)
              └── HORIZON_create(horizonData)
                    │
                    ├── Computes inline/crossline min/max ranges
                    │
                    ├── HELPER_HORIZON_createPointCloud(points, ranges)
                    │     │
                    │     ├── For each point:
                    │     │     x = realInlineToX(point.inline)    → [0, 2790]
                    │     │     y = timeToY(point.z)              → [200, 1600]
                    │     │     z = realCrosslineToZ(point.crossline) → [0, 2790]
                    │     │     color = HSL((point.z - zMin)/(zRange/2) * 0.7, 1, 0.5)
                    │     │
                    │     ├── BufferGeometry with position + color attributes
                    │     └── THREE.Points(geometry, PointsMaterial{size:2, vertexColors:true})
                    │
                    └── Returns HorizonComponent { setVisible, dispose }
```
