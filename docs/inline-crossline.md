# Inline / Crossline Image Rendering & Sizing

## Overview

The seismic inline and crossline images are rendered as flat `PlaneGeometry` meshes in a Three.js scene, with textures fetched from a backend API. There is **no surface fitting or geometry deformation** -- the planes are simple vertical slices moved through a 3D volume via slider controls.

---

## Sizing Configuration

All sizing is determined by the hardcoded config in `GLOBAL_CONFIG_SEISMIC` (`app.js:1-23`):

| Property | Value | Purpose |
|---|---|---|
| `imageWidth` | 2790 | Horizontal extent of the seismic volume (X and Z axes) |
| `imageHeight` | 2800 | Vertical extent of the plane geometry (Y axis) |
| `inlineCount` | 1092 | Number of inline slices (drives slider max and position interpolation) |
| `crosslineCount` | 549 | Number of crossline slices |
| `timeSize` | 1400 | Used in `getVerticalOffset()` but **not** used for plane geometry sizing |
| `depthStep` | 1100 | Defined but unused anywhere |
| `inlineOffset` | 10000 | Offset for converting real inline numbers → indices (used for wells/horizons only) |
| `croslineOffset` | 996 | Offset for converting real crossline numbers → indices |

**Key point:** `imageHeight` (2800) used for the plane geometry does **not** match `timeSize` (1400). The planes use `imageHeight` directly, while time-to-Y coordinate transforms use `timeSize + 200` as a vertical offset. This means the plane's pixel dimensions are independent of the logical time/depth coordinate system.

---

## Image Data Fetching

API paths are defined in `GLOBAL_CONFIG_PATH` (`app.js:54-64`):

```
GET http://127.0.0.1:5000/api/inlineMJB/{index+1}/image
GET http://127.0.0.1:5000/api/crosslineMJB/{index+1}/image
```

When a slider changes the index, `setIndex()` is called on the plane, which:
1. Moves the plane to the new position along the volume axis
2. Loads the new texture from the backend via `TextureLoader.load()`
3. Swaps the texture on the existing mesh's material (disposing the old one)

---

## Plane Creation & Placement

### `HELPER_SEISMIC_PLANE_createMesh()` (`app.js:908`)

```js
const geometry = new THREE.PlaneGeometry(imageWidth, imageHeight) // 2790 x 2800
geometry.translate(imageWidth / 2, 0, 0) // shift so left edge is at x=0
// returns MeshBasicMaterial with texture
```

The plane is always `imageWidth` x `imageHeight` in size. It is translated in X by `imageWidth/2` so that its left edge starts at the origin rather than being centered there.

### Inline Plane (`SEISMIC_PLANE_createInline`, `app.js:957`)

```
Rotation:  rotation.y = -Math.PI / 2  (90° around Y axis)
Result:    plane stands in the YZ plane (depth × time), perpendicular to X
Position:  position.x changes with inline index, position.y=0, position.z=0
```

The inline image is a vertical slice in the YZ plane. Changing the inline index slides this plane along the X axis from `x=0` to `x=imageWidth` (2790).

### Crossline Plane (`SEISMIC_PLANE_createCrossline`, `app.js:1011`)

```
Rotation:  rotation.y = 0 (no rotation)
Result:    plane stands in the XY plane (inline × time), perpendicular to Z
Position:  position.z changes with crossline index, position.x=0, position.y=0
```

The crossline image is a vertical slice in the XY plane. Changing the crossline index slides this plane along the Z axis from `z=0` to `z=imageWidth` (2790).

### Index-to-Position Mapping (`HELPER_COORD_indexToPosition`, `app.js:171`)

```js
position = (index / (maxCount - 1)) * imageWidth
```

This linearly maps index `[0, maxCount-1]` to position `[0, imageWidth]`. The same formula is used for both inline (X position) and crossline (Z position).

---

## Is the sizing fitted/aligned to a surface or geometry?

**No.** The inline/crossline images are **not** fitted, aligned, or deformed to any surface (horizons, faults, etc.).

Evidence:

1. **Flat `PlaneGeometry`:** The images are rendered on a flat `THREE.PlaneGeometry`. There is no vertex displacement, no mesh deformation, no custom shader that would map the texture onto any 3D surface.

2. **No surface reference in creation:** Neither `SEISMIC_PLANE_createInline` nor `SEISMIC_PLANE_createCrossline` references any horizon, fault, or well data. They operate independently of all geological data.

3. **Sizing is static:** The plane dimensions (`imageWidth`, `imageHeight`) are hardcoded constants. They are not derived from or adjusted to match the extent of any loaded horizon surface, bounding box of well data, or fault panel boundaries.

4. **Bounding box is separate:** The bounding box (`HELPER_SCENE_creteBoundingBox`, `app.js:226`) is a wireframe drawn around the same `imageWidth x imageHeight x imageWidth` volume, purely visual. It does not influence plane sizing.

5. **Other entities map into the same coordinate system:** Wells, horizons, and faults all convert their data points into this same world space using the `HELPER_COORD_*` functions. They align *to the volume*, not the other way around.

---

## Complete Initialization Flow

```
APP_init()                                     (app.js:3214)
  │
  ├─ UI_LOADING_init()                        Setup loading screen UI
  │
  ├─ SCENE_init()                             (app.js:496)
  │   ├─ Create Scene, Camera, Renderer
  │   ├─ HELPER_SCENE_setupLighting()
  │   ├─ HELPER_SCENE_creteBoundingBox()       Wireframe box (imageW × imageH × imageW)
  │   ├─ HELPER_SCENE_setupCameraControls()    Orbit/pan/zoom
  │   ├─ HELPER_SCENE_setupResizeHandler()
  │   └─ HELPER_SCENE_updateCameraPosition()
  │
  ├─ API_isAvailable()                        Check backend health
  │
  ├─ SEISMIC_PLANE_createInline()             (app.js:957)
  │   ├─ Load texture: /api/inlineMJB/1/image
  │   ├─ Create PlaneGeometry(2790, 2800)
  │   ├─ Rotate Y: -π/2  → YZ plane (perpendicular to X)
  │   └─ Position at (0, 0, 0)
  │   → Returns { setIndex, dispose }
  │
  ├─ SEISMIC_PLANE_createCrossline()          (app.js:1011)
  │   ├─ Load texture: /api/crosslineMJB/1/image
  │   ├─ Create PlaneGeometry(2790, 2800)
  │   └─ Position at (0, 0, 0)  → XY plane (perpendicular to Z)
  │   → Returns { setIndex, dispose }
  │
  ├─ DATA_loadAll()                           (app.js:2385)
  │   ├─ Fetch /api/horizon  → HORIZON_addFromJson()
  │   ├─ Fetch /api/well     → WELL_loadFromJson()
  │   ├─ Fetch /api/well-log/* → WELL_LOG_addSingleWellData()
  │   └─ Fetch /api/fault    → FAULT_loadSurfacesFromJson()
  │
  ├─ UI_initControls()                        (app.js:2933)
  │   ├─ Sliders for inline/crossline → call setIndex()
  │   └─ Toggle buttons for horizons/faults/wells
  │
  └─ SCENE_startRenderLoop()                  Animation loop
```

---

## Coordinate System Reference

```
       Y (time/depth, up)
       │
       │    imageHeight = 2800
       │    yTop=200, yBottom=1600
       │
       └─────────────► X (inline direction, imageWidth=2790)
      /
     /
    Z (crossline direction, imageWidth=2790)
```

- **Inline plane:** YZ plane at a given X, facing ±X
- **Crossline plane:** XY plane at a given Z, facing ±Z
- **timeToY:** `y = -time + (timeSize + 200)` — negates so deeper time = lower Y
- **inlineToX / crosslineToZ:** `normalized * imageWidth` — linear mapping
