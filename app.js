const GLOBAL_CONFIG_SEISMIC = {
    inlineCount: 1092,
    crosslineCount: 549,
    timeSize: 1400,
    imageWidth: 2790,
    imageHeight: 2800,
    depthStep: 1100,
    yTop: 200,
    yBottom: 1600,
    inlineOffset: 10000,
    croslineOffset: 996,

    getVerticalOffset(){
        return this.timeSize + 200;
    },

    getMaxInlineIndex() {
        return this.inlineCount - 1;
    },

    getMaxCrosslineIndex() {
        return this.crosslineCount - 1
    }
}

const GLOBAL_CONFIG_CAMERA = {
    fov: 45,
    near: 100,
    far: 1000,

    initialRadius: 6000,
    initialTheta: Math.PI / 4,
    initialPhi: Math.PI / 3,

    minRadius: 500,
    maxRadius: 10000,

    rotationSpeed: 0.005,
    panSpeed: 2.0,
    zoomSpeed: 1.5
}

const GLOBAL_CONFIG_STYLE = {
    backgroundColor: 0x111111,
    boundingBoxColor: 0x888888,
    defaultFaultColor: 0xff0000,
    defaultFault3DColor: 0x00ffff,
    defaultWellColor: 0xffff00,
    wellRadius: 10,
    horizonPointSize: 2,
    fault3DOpacity: 0.6
}

const GLOBAL_CONFIG_PATH = {
    apiBase: 'http://127.0.0.1:5000/api',

    getInlinePath(index) {
        return `${this.apiBase}/inline/${index + 1}/image`
    },

    getCrosslinePath(index) {
        return `${this.apiBase}/crossline/${index + 1}/image`
    }
}

const GLOBAL_CONFIG_WELL_LOG = {
    logTypes: {
        'None': {
            min: 0,
            max: 1,
            color: 0xffffff,
            label: 'None'
        },
        'PHIE': {
            min: 0,
            max: 0.4,
            color: 0x00ff88,
            label: 'Effective Porosity',
            fill: {
                enabled: true,
                color: 0x00ff88,
                direction: 'right'
            }
        },
        'VSH': {
            min: 0,
            max: 1,
            color: 0x8b4513,
            label: 'Shale Volume',
            fill: {
                enabled: true,
                color: 0x8b4513,
                direction: 'right'
            }
        },
        'SWE': {
            min: 0,
            max: 1,
            color: 0x4169e1,
            label: 'Water Saturation',
            fill: {
                enabled: true,
                color: 0x4169e1,
                direction: 'right'
            }
        }
    },
    maxLogWidth: 10,
    tubeRadiues: 1,
    curveSegments: 12
}

/** @type {import("three").Scene | null} */
let GLOBAL_SCENE_INSTANCE = null

/** @type {import("three").PerspectiveCamera | null} */
let GLOBAL_SCENE_CAMERA = null

/** @type {import("three").WebGLRenderer | null} */
let GLOBAL_SCENE_RENDERER = null

let GLOBAL_SCENE_ANIM_FRAME_ID = null

let GLOBAL_SCENE_ORBIT_STATE = {
    isDragging: false,
    isPanning: false,
    previousMouse: {
        x: 0,
        y: 0
    },
    theta: GLOBAL_CONFIG_CAMERA.initialTheta,
    phi: GLOBAL_CONFIG_CAMERA.initialPhi,
    radius: GLOBAL_CONFIG_CAMERA.initialRadius,
    targetOffset: {
        x: 0,
        y: 0,
        z: 0
    }
}

/** @type {import("three").Raycaster | null} */
let GLOBAL_SCENE_RAYCASTER = null

/** @type {import("three").Vector2 | null} */
let GLOBAL_SCENE_MOUSE = null

/** @type {HTMLElement | null} */
let GLOBAL_SCENE_TOOLTIP = null

/** @type {import("three").Object3D | null} */
let GLOBAL_SCENE_HOVERED_WELL = null

let GLOBAL_SCENE_LAST_RAYCAST_TIME = 0

const GLOBAL_SCENE_RAYCAST_THROTTLE = 50

// [SAME A]
const HELPER_COORD_inlineToX = (inlineIndex) => {
    const normalized = inlineIndex / (GLOBAL_CONFIG_SEISMIC.inlineCount - 1)
    return normalized * GLOBAL_CONFIG_SEISMIC.imageWidth
}

const HELPER_COORD_crosslineToZ = (crosslineIndex) => {
    const normalized = crosslineIndex / (GLOBAL_CONFIG_SEISMIC.crosslineCount - 1)
    return normalized * GLOBAL_CONFIG_SEISMIC.imageWidth
}

const HELPER_COORD_indexToPosition = (index, maxCount) => {
    const normalized = index / maxCount - 1
    return normalized * GLOBAL_CONFIG_SEISMIC.imageWidth
}

const HELPER_COORD_realInlineToX = (realInline) => {
    const inlineIndex = realInline - GLOBAL_CONFIG_SEISMIC.inlineOffset

    return HELPER_COORD_inlineToX(inlineIndex)
}

const HELPER_COORD_realCrosslineToZ = (realCrossline) => {
    const crosslineIndex = realCrossline - GLOBAL_CONFIG_SEISMIC.croslineOffset

    return HELPER_COORD_crosslineToZ(crosslineIndex)
}

const HELPER_COORD_timeToY = (time) => {
    return -time + GLOBAL_CONFIG_SEISMIC.getVerticalOffset()
}

const HELPER_COORD_normalizeTwt = (twt) => {
    return Math.abs(twt)
}

const HELPER_COORD_seismicToWorld = (point) => {

    const x = HELPER_COORD_inlineToX(point.inline ?? point.inline_n)
    const y = HELPER_COORD_crosslineToZ(point.crossline ?? point.crossline_n)
    const z = HELPER_COORD_timeToY(point.time ?? point.z)

    return new THREE.Vector3(
        x,
        y,
        z
    )
}

const HELPER_COORD_getBoundingBoxCenter = () => {
    return {
        x: GLOBAL_CONFIG_SEISMIC.imageWidth / 2,
        y: GLOBAL_CONFIG_SEISMIC.imageHeight / 2,
        z: GLOBAL_CONFIG_SEISMIC.imageWidth / 2
    }
}

const HELPER_SCENE_setupLighting = () => {
    if (!GLOBAL_SCENE_INSTANCE) {
        throw new Error("Instance dari scene (global) belum diinisialisasi")
    }

    const light = new THREE.AmbientLight(0xffffff)
    GLOBAL_SCENE_INSTANCE.add(light)
}

const HELPER_SCENE_creteBoundingBox = () => {
    if (!GLOBAL_SCENE_INSTANCE) {
        throw new Error("Instance dari scene (global) belum diinisialisasi")
    }

    const { imageWidth, imageHeight } = GLOBAL_CONFIG_SEISMIC

    const boxGeo = new THREE.BoxGeometry(
        imageWidth, // width
        imageHeight, // height
        imageWidth // depth -> why image width (Rehund asking), why not time??
    )

    const edges = new THREE.EdgesGeometry(boxGeo)

    boxGeo.dispose()

    const material = new THREE.LineBasicMaterial({
        color: GLOBAL_CONFIG_STYLE.boundingBoxColor
    })

    const wireframe = new THREE.LineSegments(edges, material)
    wireframe.position.set(
        imageWidth / 2, //x
        0, //y
        imageWidth / 2 //z
    )

    GLOBAL_SCENE_INSTANCE.add(wireframe)
}

const HELPER_SCENE_updateCameraPosition = () => {
    if (!GLOBAL_SCENE_CAMERA) {
        throw new Error("Instance dari scene (global) camera belum diinisialisasi")
    }

    const center = HELPER_COORD_getBoundingBoxCenter()
    const {
        radius,
        phi,
        theta,
        targetOffset
    } = GLOBAL_SCENE_ORBIT_STATE

    const targetX = center.x + targetOffset.x;
    const targetY = center.y + targetOffset.y;
    const targetZ = center.z + targetOffset.z;

    const cameraPosX = targetX + radius * Math.sin(phi) * Math.cos(theta)
    const cameraPosY = targetY + radius * Math.cos(phi)
    const cameraPosZ = targetZ + radius * Math.sin(phi) * Math.sin(theta)

    GLOBAL_SCENE_CAMERA.position.set(cameraPosX, cameraPosY, cameraPosZ)
    GLOBAL_SCENE_CAMERA.lookAt(targetX, targetY, targetZ)
}

const HELPER_SCENE_handlePan = (deltaX, deltaY) => {
    const { theta } = GLOBAL_SCENE_ORBIT_STATE;

    const rightX = -Math.sin(theta)
    const rightZ = Math.cos(theta)
    const horizontalPanDelta = deltaX * GLOBAL_CONFIG_CAMERA.panSpeed
    const verticalPanDelta = deltaY * GLOBAL_CONFIG_CAMERA.panSpeed

    GLOBAL_SCENE_ORBIT_STATE.targetOffset.x += horizontalPanDelta * rightX;
    GLOBAL_SCENE_ORBIT_STATE.targetOffset.z += horizontalPanDelta * rightZ; // Kenapa pake deltaX juga yaa??
    GLOBAL_SCENE_ORBIT_STATE.targetOffset.y += verticalPanDelta;

    HELPER_SCENE_updateCameraPosition();
}

const HELPER_SCENE_handleMouseMove = (e) => {
    const deltaX = e.clientX - GLOBAL_SCENE_ORBIT_STATE.previousMouse.x
    const deltaY = e.clientY - GLOBAL_SCENE_ORBIT_STATE.previousMouse.y

    if (GLOBAL_SCENE_ORBIT_STATE.isPanning) {
        HELPER_SCENE_handlePan(deltaX, deltaY)
        GLOBAL_SCENE_ORBIT_STATE.previousMouse = {
            x: e.clientX,
            y: e.clientY
        }
    }

    if (!GLOBAL_SCENE_ORBIT_STATE.isDragging) return

    const horizontalRotationDelta = deltaX * GLOBAL_CONFIG_CAMERA.rotationSpeed
    const verticalRotationDelta = deltaY * GLOBAL_CONFIG_CAMERA.rotationSpeed

    GLOBAL_SCENE_ORBIT_STATE.theta -= horizontalRotationDelta
    GLOBAL_SCENE_ORBIT_STATE.phi -= verticalRotationDelta

    const EPS = 0.01

    GLOBAL_SCENE_ORBIT_STATE.phi = Math.max(
        EPS,
        Math.min(Math.PI - EPS, GLOBAL_SCENE_ORBIT_STATE.phi)
    )

    HELPER_SCENE_updateCameraPosition()
    GLOBAL_SCENE_ORBIT_STATE.previousMouse = {
        x: e.clientX,
        y: e.clientY
    }
}

const HELPER_SCENE_handleMouseWheel = (e) => {
    const zoomDelta = e.deltaY * GLOBAL_CONFIG_CAMERA.zoomSpeed

    GLOBAL_SCENE_ORBIT_STATE.radius += zoomDelta
    GLOBAL_SCENE_ORBIT_STATE.radius = Math.max(
        GLOBAL_CONFIG_CAMERA.minRadius,
        Math.min(GLOBAL_CONFIG_CAMERA.maxRadius, GLOBAL_SCENE_ORBIT_STATE.radius)
    )

    HELPER_SCENE_updateCameraPosition()
}

const HELPER_SCENE_setupCameraControls = () => {
    if (!GLOBAL_SCENE_RENDERER) {
        throw new Error("Instance dari scene (global) renderer belum diinisialisasi")
    }

    const canvas = GLOBAL_SCENE_RENDERER.domElement

    canvas.addEventListener('mousedown', (e) => {
        if (e.shiftKey) {
            GLOBAL_SCENE_ORBIT_STATE.isPanning = true
            GLOBAL_SCENE_ORBIT_STATE.isDragging = false
        } else {
            GLOBAL_SCENE_ORBIT_STATE.isPanning = false
            GLOBAL_SCENE_ORBIT_STATE.isDragging = true
        }
    })

    canvas.addEventListener('mouseup', () => {
        GLOBAL_SCENE_ORBIT_STATE.isDragging = false
        GLOBAL_SCENE_ORBIT_STATE.isPanning = false
    })

    canvas.addEventListener('mouseleave', () => {
        GLOBAL_SCENE_ORBIT_STATE.isDragging = false
        GLOBAL_SCENE_ORBIT_STATE.isPanning = false
    })

    canvas.addEventListener('mousemove', (e) => {
        HELPER_SCENE_handleMouseMove(e)
    })

    canvas.addEventListener('wheel', (e) => {
        HELPER_SCENE_handleMouseWheel(e)
    })

    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault()
    })
}

const HELPER_SCENE_setupResizeHandler = () => {
    if (!GLOBAL_SCENE_CAMERA || !GLOBAL_SCENE_RENDERER) {
        throw new Error("Instance dari scene camera dan renderer belum diinisialisasi")
    }
    window.addEventListener('resize', () => {
        GLOBAL_SCENE_CAMERA.aspect = window.innerWidth / window.innerHeight
        GLOBAL_SCENE_CAMERA.updateProjectionMatrix();
        GLOBAL_SCENE_RENDERER.setSize(window.innerWidth, window.innerHeight)
    })
}

const HELPER_SCENE_showTooltip = (wellName, x, y) => {
    if(!GLOBAL_SCENE_TOOLTIP) return

    GLOBAL_SCENE_TOOLTIP.textContent = `Well ${wellName}`
    GLOBAL_SCENE_TOOLTIP.style.display = 'block'
    GLOBAL_SCENE_TOOLTIP.style.left = `${x + 15}px`
    GLOBAL_SCENE_TOOLTIP.style.top = `${y + 15}px`
}

const HELPER_SCENE_hideTooltip = () => {
    if (!GLOBAL_SCENE_TOOLTIP) return;

    GLOBAL_SCENE_TOOLTIP.style.display = 'none'
}

const HELPER_SCENE_checkWellHover = (e) => {
    if (
        !GLOBAL_SCENE_RENDERER
        || !GLOBAL_SCENE_MOUSE
        || !GLOBAL_SCENE_RAYCASTER
        || !GLOBAL_SCENE_CAMERA
        || !GLOBAL_SCENE_INSTANCE
    ) {
        throw new Error("Instance dari scene yang diperlukan belum diinisialisasi")
    }

    const now = performance.now()
    if (now - GLOBAL_SCENE_LAST_RAYCAST_TIME < GLOBAL_SCENE_RAYCAST_THROTTLE) return;

    GLOBAL_SCENE_LAST_RAYCAST_TIME = now

    const rect = GLOBAL_SCENE_RENDERER.domElement.getBoundingClientRect()

    GLOBAL_SCENE_MOUSE.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    GLOBAL_SCENE_MOUSE.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    GLOBAL_SCENE_RAYCASTER.setFromCamera(GLOBAL_SCENE_MOUSE, GLOBAL_SCENE_CAMERA)

    const wellMeshes = GLOBAL_SCENE_INSTANCE.children.filter(
        (obj) => obj.userData && obj.userData.type === 'well'
    )

    const intersects = GLOBAL_SCENE_RAYCASTER.intersectObjects(wellMeshes, false)

    /** @type {import('three').Object3D | null} */
    let newHoveredWell = null

    for (const intersect of intersects) {
        if (intersect.object.userData?.type === 'well' && intersect.object.visible) {
            HELPER_SCENE_showTooltip(intersect.object.userData.name, e.clientX, e.clientY)
            newHoveredWell = intersect.object
            break
        }
    }

    if (newHoveredWell !== GLOBAL_SCENE_HOVERED_WELL) {
        const previousWellInstance = GLOBAL_SCENE_HOVERED_WELL?.userData?.wellInstance
        if (previousWellInstance) {
            previousWellInstance.unhighlight()
        }

        const currentWellInstance = newHoveredWell?.userData?.wellInstance
        if (currentWellInstance) {
            currentWellInstance.highlight()
        }

        GLOBAL_SCENE_HOVERED_WELL = newHoveredWell
    }

    if (!newHoveredWell) {
        HELPER_SCENE_hideTooltip()
    }
}

const HELPER_SCENE_setupMouseInteraction = () => {
    if (!GLOBAL_SCENE_RENDERER) {
        throw new Error("Instance dari scene renderer belum diinisialisasi")
    }

    GLOBAL_SCENE_TOOLTIP = document.getElementById('wellTooltip')

    if (!GLOBAL_SCENE_TOOLTIP) {
        console.warn('Well tooltip element not found')
        return
    }

    GLOBAL_SCENE_RENDERER.domElement.addEventListener('mousemove', (event) => {
        if (GLOBAL_SCENE_ORBIT_STATE.isDragging){
            HELPER_SCENE_hideTooltip()
            return
        }

        HELPER_SCENE_checkWellHover(event)
    })
}


const SCENE_init = () => {
    GLOBAL_SCENE_INSTANCE = new THREE.Scene();
    GLOBAL_SCENE_INSTANCE.background = new THREE.Color(
        GLOBAL_CONFIG_STYLE.backgroundColor
    )

    GLOBAL_SCENE_CAMERA = new THREE.PerspectiveCamera(
        GLOBAL_CONFIG_CAMERA.fov, //fov
        window.innerWidth / window.innerHeight, //aspect
        GLOBAL_CONFIG_CAMERA.near, //near
        GLOBAL_CONFIG_CAMERA.far //far
    )

    GLOBAL_SCENE_RENDERER = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true
    })

    GLOBAL_SCENE_RENDERER.setSize(
        window.innerWidth,
        window.innerHeight
    )

    GLOBAL_SCENE_RENDERER.setPixelRatio(
        Math.min(window.devicePixelRatio, 2)
    )

    document.body.appendChild(GLOBAL_SCENE_RENDERER.domElement)

    GLOBAL_SCENE_RAYCASTER = new THREE.Raycaster()

    GLOBAL_SCENE_MOUSE = new THREE.Vector2()

    HELPER_SCENE_setupLighting()
    HELPER_SCENE_creteBoundingBox()
    HELPER_SCENE_setupCameraControls()
    HELPER_SCENE_setupResizeHandler()
    HELPER_SCENE_updateCameraPosition()
    HELPER_SCENE_setupMouseInteraction()
}

const SCENE_add = (object) => {
    if (!GLOBAL_SCENE_INSTANCE) {
        throw new Error("Instance dari scene belum diinisialisasi")
    }

    GLOBAL_SCENE_INSTANCE.add(object)
}

const SCENE_remove = (object) => {
    if (!GLOBAL_SCENE_INSTANCE) {
        throw new Error("Instance dari scene belum diinisialisasi")
    }

    GLOBAL_SCENE_INSTANCE.remove(object)
}

const SCENE_resetCamera = () => {
    GLOBAL_SCENE_ORBIT_STATE.theta = GLOBAL_CONFIG_CAMERA.initialTheta
    GLOBAL_SCENE_ORBIT_STATE.phi = GLOBAL_CONFIG_CAMERA.initialPhi
    GLOBAL_SCENE_ORBIT_STATE.radius = GLOBAL_CONFIG_CAMERA.initialRadius
    GLOBAL_SCENE_ORBIT_STATE.targetOffset = {
        x: 0,
        y: 0,
        z: 0
    }

    HELPER_SCENE_updateCameraPosition()
}

const SCENE_startRenderLoop = () => {
    if (!GLOBAL_SCENE_RENDERER || !GLOBAL_SCENE_CAMERA || !GLOBAL_SCENE_INSTANCE) {
        throw new Error("Instance dari scene renderer belum diinisialisasi")
    }

    const render = () => {
        GLOBAL_SCENE_ANIM_FRAME_ID = requestAnimationFrame(render)
        GLOBAL_SCENE_RENDERER.render(GLOBAL_SCENE_INSTANCE, GLOBAL_SCENE_CAMERA)
    }

    render();
}

const SCENE_stopRenderLoop = () => {
    if (GLOBAL_SCENE_ANIM_FRAME_ID !== null) {
        cancelAnimationFrame(GLOBAL_SCENE_ANIM_FRAME_ID)
        GLOBAL_SCENE_ANIM_FRAME_ID = null
    }
}

/**
 * @typedef {Object} FaultPanel
 * @property {import("three").Mesh} mesh
 * @property {(visible: boolean) => void} setVisible
 * @property {() => void} dispose
 */

/** @type {FaultPanel[]} */
let GLOBAL_FAULT_PANELS = []

const FAULT_createPanel = (
    p1a,
    p1b,
    p2a,
    p2b,
    color = GLOBAL_CONFIG_STYLE.defaultFault3DColor
) => {

    const A = HELPER_COORD_seismicToWorld(p1a)
    const B = HELPER_COORD_seismicToWorld(p1b)
    const C = HELPER_COORD_seismicToWorld(p2a)
    const D = HELPER_COORD_seismicToWorld(p2b)

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(
            new Float32Array([
                A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z,
                B.x, B.y, B.z, D.x, D.y, D.z, C.x, C.y, C.z
            ]),
            3
        )
    )

    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: GLOBAL_CONFIG_STYLE.fault3DOpacity,
        shininess: 50
    })

    const faultMesh = new THREE.Mesh(geometry, material)
    SCENE_add(mesh)

    const setFaultVisible = (visible) => {
        mesh.visible = visible
    }

    const disposeFault = () => {
        SCENE_remove(mesh)
        mesh.geometry.dispose()
        mesh.material.dispose()
    }

    return {
        faultMesh,
        setFaultVisible,
        disposeFault
    }
}

/**
 * @typedef {Object} FaultPoint
 * @property {number} inline_n
 * @property {number} crossline_n
 * @property {number} time
 * @property {number} fault_plane
 */

/**
 * @typedef {Object} FaultStick
 * @property {number} stick_id
 * @property {FaultPoint[]} points
 */

/**
 * @typedef {Object} FaultApiData
 * @property {FaultStick[]} sticks
 */

/** @param {FaultApiData} faultData */
const FAULT_loadSurfacesFromJson = (faultData) => {
    try {
        const sticks = faultData.sticks.sort((a, b) => {
            return a.stick_id - b.stick_id
        })

        for (let i = 0; i < sticks.length - 1; i++) {
            const s1 = sticks[i]
            const s2 = sticks[i + 1]

            if (s1.points.length === 2 && s2.points.length === 2){
                if(s1.points[0].fault_plane !== s2.points[0].fault_plane) continue

                const p1 = s1.points
                const p2 = s2.points

                GLOBAL_FAULT_PANELS.push(
                    FAULT_createPanel(
                        {
                            inline_n: p1[0].inline_n,
                            crossline_n: p1[0].crossline_n,
                            time: p1[0].time
                        },
                        {
                            inline_n: p1[1].inline_n,
                            crossline_n: p1[1].crossline_n,
                            time: p1[1].time
                        },
                        {
                            inline_n: p2[0].inline_n,
                            crossline_n: p2[0].crossline_n,
                            time: p2[0].time
                        },
                        {
                            inline_n: p2[1].inline_n,
                            crossline_n: p2[1].crossline_n,
                            time: p2[1].time
                        },
                    )
                )
            }
        }
    } catch (error) {
        console.error("Failed to load fault: ", error)
    }
}

const FAULT_setAllVisible = (visible) => {
    GLOBAL_FAULT_PANELS.forEach(fault => fault.setVisible(visible))
}

const FAULT_disposeAll = () => {
    GLOBAL_FAULT_PANELS.forEach(fault => fault.dispose())
    GLOBAL_FAULT_PANELS = []
}

/**
 * @typedef {Object} HorizonPoint
 * @property {number} inline
 * @property {number} crossline
 * @property {number} z
 */

/**
 * @typedef {Object} HorizonData
 * @property {string} name
 * @property {HorizonPoint[]} points
 * @property {number} z_min
 * @property {number} z_max
 */

/**
 * @typedef {Object} HorizonRange
 * @property {{min: number, max: number}} inline
 * @property {{min: number, max: number}} crossline
 * @property {{min: number, max: number}} z
 */

/**
 * @typedef {Object} HorizonComponent
 * @property {(visible?: boolean) => void} setVisible
 * @property {() => void} dispose
 */

/** @type {HorizonComponent[]} */
let GLOBAL_HORIZON_ITEMS = []

/** @param {HorizonData} horizonData */
const HORIZON_create = (horizonData) => {

    /** @type {import("three").Points | null} */
    let pointCloud = null

    /**
     * @param {HorizonPoint[]} points
     * @param {HorizonRange} ranges
     */
    const HELPER_HORIZON_createPointCloud = (
        points,
        ranges
    ) => {
        const positions = []
        const colors = []
        const color = new THREE.Color()

        const zRange = ranges.z.max - ranges.z.min

        // ini bikin pusing nih, point.z kenapa y dan kenapa normalizedZ pake point.z
        // nanti coba track bareng data yang udah dipunya
        for (const point of points) {
            const x = HELPER_COORD_realInlineToX(point.inline)
            const z = HELPER_COORD_realCrosslineToZ(point.crossline)
            const y = HELPER_COORD_timeToY(point.z)

            positions.push(x, y, z)

            const normalizedZ = (point.z - ranges.z.min) / (zRange / 2)

            color.setHSL(
                normalizedZ * 0.7,
                1.0,
                0.5
            )

            colors.push(
                color.r,
                color.g,
                color.b
            )
        }

        const geometry = new THREE.BufferGeometry()

        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )

        geometry.setAttribute(
            'color',
            new THREE.Float32BufferAttribute(colors, 3)
        )

        pointCloud = new THREE.Points(
            geometry,
            new THREE.PointsMaterial({
                size: GLOBAL_CONFIG_STYLE.horizonPointSize,
                vertexColors: true
            })
        )

        SCENE_add(pointCloud)
    }

    try {
        const points = horizonData.points
        if (points && points.length > 0) {
            let minInline = Infinity
            let maxInline = -Infinity

            let minCrossline = Infinity
            let maxCrossline = -Infinity

            for (const point of points) {
                minInline = Math.min(minInline, point.inline)
                maxInline = Math.max(maxInline, point.inline)

                minCrossline = Math.min(minCrossline, point.crossline)
                maxCrossline = Math.max(maxCrossline, point.crossline)
            }

            HELPER_HORIZON_createPointCloud(
                points,
                {
                    inline: {
                        min: minInline,
                        max: maxInline
                    },
                    crossline: {
                        min: minCrossline,
                        max: maxCrossline
                    },
                    z: {
                        min: horizonData.z_min,
                        max: horizonData.z_max
                    }
                }
            )
        }
    } catch (error) {
        console.error('Failed to load horizon:', error)
    }

    let visible = true

    const setHorizonVisible = (v) => {
        visible = v !== undefined ? v : !visible

        if (pointCloud) pointCloud.visible = visible
    }

    const disposeHorizon = () => {
        if (pointCloud) {
            SCENE_remove(pointCloud)

            pointCloud.geometry.dispose()
            pointCloud.material.dispose()

            pointCloud = null
        }
    }

    return { setHorizonVisible, disposeHorizon }
}

/**
 * @param {HorizonData} horizonData
 * @returns {HorizonComponent}
 */
const HORIZON_addFromJson = (horizonData) => {
    const horizon = HORIZON_create(horizonData)

    GLOBAL_HORIZON_ITEMS.push(horizon)

    return horizon;
}

const HORIZON_setAllVisible = (visible) => {
    GLOBAL_HORIZON_ITEMS.forEach(horizon => horizon.setVisible(visible))
}

const GLOBAL_SEISMIC_PLANE_TEXTURE_LOADER = new THREE.TextureLoader();

/** @param { import('three').Texture } */
const HELPER_SEISMIC_PLANE_createMesh = (texture) => {
    const geometry = new THREE.PlaneGeometry(
        GLOBAL_CONFIG_SEISMIC.imageWidth,
        GLOBAL_CONFIG_SEISMIC.imageHeight
    ) // -> ini buat ukuran plane

    geometry.translate(
        GLOBAL_CONFIG_SEISMIC.imageWidth / 2,
        0,
        0
    )

    return new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true
        })
    )
}

/** @param { import('three').Mesh | null } plane */
/** @param { string } path */
const HELPER_SEISMIC_PLANE_updateTexture = (plane, path) => {

    GLOBAL_SEISMIC_PLANE_TEXTURE_LOADER.load(
        path,
        /** @param { import('three').Texture } */
        (texture) => {
            texture.generateMipmaps = false;
            texture.minFilter = THREE.NearestFilter;
            texture.magFilter = THREE.NearestFilter;
            texture.needsUpdate = true;

            if (plane) {
                /** @type {import('three').MeshBasicMaterial} */
                const material = plane.material
                if (material.map) {
                    material.map.dispose();
                }

                material.map = texture;
                material.needsUpdate = true;
            }
        }
    )
}

const SEISMIC_PLANE_createInline = () => {

    /** @type { import('three').Mesh} */
    let plane = null;
    let currentIndex = 0;

    GLOBAL_SEISMIC_PLANE_TEXTURE_LOADER.load(
        GLOBAL_CONFIG_PATH.getInlinePath(0),
        /** @param { import('three').Texture } */
        (texture) => {

            plane = HELPER_SEISMIC_PLANE_createMesh(texture);
            plane.rotation.y = -Math.PI / 2;
            plane.position.set(0, 0, 0);
            SCENE_add(plane);

        }
    )

    const setInlineIndex = (index) => {
        currentIndex = index;
        if (plane) {
            plane.position.x = HELPER_COORD_indexToPosition(
                currentIndex,
                GLOBAL_CONFIG_SEISMIC.inlineCount
            )
        }

        HELPER_SEISMIC_PLANE_updateTexture(
            plane,
            GLOBAL_CONFIG_PATH.getInlinePath(currentIndex)
        )
    }

    const disposeInline = () => {
        if (plane) {
            SCENE_remove(plane);

            /** @type {import('three').MeshBasicMaterial} */
            const material = plane.material

            if (material.map) {
                material.map.dispose()
            }

            material.dispose()
            plane.geometry.dispose()
            plane = null
        }
    }

    return { setInlineIndex, disposeInline }
}

const SEISMIC_PLANE_createCrossline = () => {

    /** @type { import('three').Mesh} */
    let plane = null;
    let currentIndex = 0;

    GLOBAL_SEISMIC_PLANE_TEXTURE_LOADER.load(
        GLOBAL_CONFIG_PATH.getCrosslinePath(0),
        /** @param { import('three').Texture } */
        (texture) => {
            plane = HELPER_SEISMIC_PLANE_createMesh(texture);
            plane.rotation.y = 0;
            plane.position.set(0, 0, 0);
            SCENE_add(plane);
        }
    )

    const setCrosslineIndex = (index) => {
        currentIndex = index;
        if (plane) {
            plane.position.z = HELPER_COORD_indexToPosition(
                currentIndex,
                GLOBAL_CONFIG_SEISMIC.inlineCount
            )
        }

        HELPER_SEISMIC_PLANE_updateTexture(
            plane,
            GLOBAL_CONFIG_PATH.getInlinePath(currentIndex)
        )
    }

    const disposeCrossline = () => {
        if (plane) {
            SCENE_remove(plane);

            /** @type {import('three').MeshBasicMaterial} */
            const material = plane.material

            if (material.map) {
                material.map.dispose()
            }

            material.dispose()
            plane.geometry.dispose()
            plane = null
        }
    }

    return { 
        setCrosslineIndex, 
        disposeCrossline 
    }
}

/**
 * @typedef {Object} WellLogEntry
 * @property {number} twt
 * @property {number | null} value
 */

/**@param {WellLogEntry[]} logEntries*/
const HELPER_WERLL_LOG_splitIntoSegments = (logEntries) => {

    /** @type {WellLogEntry[][]} */
    const segments = [];

    /** @type {WellLogEntry[]} */
    let current = [];

    for (const entry of logEntries) {
        if (entry.value === null || entry.value === undefined) {
            if (current.length > 0) {
                segments.push(current)
                current = []
            }
        } else {
            current.push(entry)
        }
    }

    if (current.length > 0) {
        segments.push(current)
    }

    return segments;
}

/**
 * @typedef {Object} LogFillConfig
 * @property {boolean} enabled
 * @property {number} color
 * @property {number} opacity
 * @property {string} direction
 */

/**
 * @typedef {Object} LogTypeConfig
 * @property {number} min
 * @property {number} max
 * @property {number} color
 * @property {string} label
 * @property {LogFillConfig | null} [fill]
 */

/**
 * @param {WellLogEntry[]} segment
 * @param {number} wellX
 * @param {number} wellZ
 * @param {LogTypeConfig} config
 */
const HELPER_WELL_LOG_segmentToPoints = (
    segment,
    wellX,
    wellZ,
    config
) => {

    /** @type {import('three').Vector3[]} */
    const points = []

    const {
        min: minVal,
        max: maxVal
    } = config;

    for (const item of segment) {
        if (item.value == null) {
            throw new Error('value of item in a segment is missing')
        }

        const twt = HELPER_COORD_normalizeTwt(item.twt);
        const y = HELPER_COORD_TIME_TO_Y(twt);

        let normalizedValue = (item.value - minVal) / (maxVal - minVal)
        normalizedValue = Math.max(
            0,
            Math.min(1, normalizedValue)
        )

        const offset = (normalizedValue * 2 - 1) * GLOBAL_CONFIG_WELL_LOG.maxLogWidth;

        points.push(
            new THREE.Vector3(
                wellX + offset,
                y,
                wellZ
            )
        )

        return points;
    }
}


/**
 * @param {import('three').Vector3[]} curvePoints
 * @param {number} wellX
 * @param {number} wellZ
 * @param {LogFillConfig} fill
 */
const HELPER_WELL_LOG_createFillMesh = (
    curvePoints,
    wellX,
    wellZ,
    fill
) => {
    const refX = fill.direction === 'right'
        ? wellX + GLOBAL_CONFIG_WELL_LOG.maxLogWidth
        : wellX - GLOBAL_CONFIG_WELL_LOG.maxLogWidth

    const vertices = []
    const indices = []

    for (const point of curvePoints){
        vertices.push(
            point.x,
            point.y,
            point.z
        )

        vertices.push(
            refX,
            point.y,
            wellZ
        )
    }

    for (let i = 0; i < curvePoints.length - 1; i++) {
        const c1 = i * 2;
        const r1 = i * 2 + 1;

        const c2 = (i + 1) * 2;
        const r2 = (i + 1) * 2 + 1;

        indices.push(
            c1, r1, c2
        )

        indices.push(
            c2, r1, r2
        )
    }

    if (vertices.length === 0) return null;

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices, 3)
    )
    geometry.setIndex(indices)
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
        color: fill.color,
        transparent: true,
        opacity: fill.opacity,
        side: THREE.DoubleSide,
        depthWrite: false
    })

    const mesh = new THREE.Mesh(
        geometry,
        material
    )

    mesh.renderOrder = 0.5

    return mesh
}

/**
 * @typedef {Object} WellLogDataInstance
 * @property {string} wellName
 * @property {Record<string, WellLogEntry[]>} logs
 * @property {(logType: string, entries: WellLogEntry[]) => void} setLogEntries
 * @property {(logType: string) => WellLogEntry[]} getLogData
 * @property {() => string[]} getAvailableLogs
 */

/**
 * @typedef {Object} Well
 * @property {string} name
 * @property {import('three').Mesh} mesh
 * @property {WellLogDataInstance | null} logData
 * @property {(visible: boolean) => void} setVisible
 * @property {() => void} highlight
 * @property {() => void} unhighlight
 * @property {(ld: WellLogDataInstance) => void} setLogData
 * @property {(logType: string) => void} setLogType
 * @property {() => string[]} getAvailableLogs
 * @property {() => string} getCurrentLogType
 * @property {() => void} dispose
 */

/**
 * @param {Well} well
 * @param {WellLogEntry[]} logEntries
 * @param {string} logType
 */
const WELL_LOG_create = (
    well,
    logEntries,
    logType
) => {
    /** @type {import('three').Mesh[] } */
    const meshes = []

    /** @type {LogTypeConfig} */
    const config =
        GLOBAL_CONFIG_WELL_LOG.logTypes[logType]
        || GLOBAL_CONFIG_WELL_LOG.logTypes['PHIE']

    if (
        logType !== 'None'
        && logEntries
        && logEntries.length > 0
    ) {
        const segments = HELPER_WERLL_LOG_splitIntoSegments(logEntries);
        const wellX = well.mesh.position.x;
        const wellZ = well.mesh.position.z;

        for (const segment of segments) {
            if (segment.length < 2) continue;

            const points = HELPER_WELL_LOG_segmentToPoints(
                segment,
                wellX,
                wellZ,
                config
            )

            if (points.length < 2) continue;

            const curve = new THREE.CatmullRomCurve3(points);
            const tubeGeometry = new THREE.TubeGeometry(
                curve,
                Math.max(points.length * 2, 50),
                GLOBAL_CONFIG_WELL_LOG.tubeRadius,
                GLOBAL_CONFIG_WELL_LOG.curveSegments,
                false
            )

            const tubeMaterial = new THREE.MeshPhongMaterial({
                color: config.color,
                shininess: 60,
                transparent: true,
                opacity: 0.95
            })

            const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial)

            tubeMesh.renderOrder = 1;

            SCENE_add(tubeMesh);
            meshes.push(tubeMesh);

            if (config.fill && config.fill.enabled) {
                const fillMesh = HELPER_WELL_LOG_createFillMesh(
                    points,
                    wellX,
                    wellZ,
                    config.fill
                )

                if (fillMesh) {
                    SCENE_add(fillMesh)
                    meshes.push(fillMesh)
                }
            }
        }
    }

    const setVisible = (visible) => {
        meshes.forEach((m) => {
            m.visible = visible
        })
    }

    const dispose = () => {
        for (const mesh of meshes) {
            scene_remove(mesh)
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        meshes.length = 0;
    }

    return {
        setVisible,
        dispose
    }
}

const WELL_LOG_DATA_create = (wellName) => {
    
    /** @type {Record<string, WellLogEntry[]>} */
    const logs = {}

    /**
     * @param {WellLogEntry[]} entries 
     * @param {string} logType */
    const setLegoEntries = (
        logType,
        entries
    ) => {
        logs[logType] = entries
    }

    const getLogData = (
        logType
    ) => {
        return logs[logType] || []
    }

    const getAvailableLogs = () => {
        return Object
            .keys(logs)
            .filter((log) => {
                logs[log]
                    .some(d => d.value !== null)
            })
    }

    return {
        wellName,
        logs,
        setLegoEntries,
        getLogData,
        getAvailableLogs
    }
}