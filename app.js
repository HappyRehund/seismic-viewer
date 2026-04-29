const GLOBAL_CONFIG_SEISMIC = {
    inlineCount: 1092, // -> this should be dynamic
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
    far: 10000,

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
        return `${this.apiBase}/inlineMJB/${index + 1}/image`
    },

    getCrosslinePath(index) {
        return `${this.apiBase}/crosslineMJB/${index + 1}/image`
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
                opacity: 0.35,
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
                opacity: 0.35,
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
                opacity: 0.35,
                direction: 'right'
            }
        }
    },
    maxLogWidth: 10,
    tubeRadius: 1,
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
    const normalized = index / (maxCount - 1)
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
    const y = HELPER_COORD_timeToY(point.time ?? point.z)
    const z = HELPER_COORD_crosslineToZ(point.crossline ?? point.crossline_n)

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

        GLOBAL_SCENE_ORBIT_STATE.previousMouse = {
            x: e.clientX,
            y: e.clientY
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

/** @param {import('three').Object3D} object*/
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
    SCENE_add(faultMesh)

    const setVisible = (visible) => {
        faultMesh.visible = visible
    }

    const dispose = () => {
        SCENE_remove(faultMesh)
        faultMesh.geometry.dispose()
        faultMesh.material.dispose()
    }

    return {
        mesh: faultMesh,
        setVisible,
        dispose
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

    const setVisible = (v) => {
        visible = v !== undefined ? v : !visible

        if (pointCloud) pointCloud.visible = visible
    }

    const dispose = () => {
        if (pointCloud) {
            SCENE_remove(pointCloud)

            pointCloud.geometry.dispose()
            pointCloud.material.dispose()

            pointCloud = null
        }
    }

    return { setVisible, dispose }
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

    const setIndex = (index) => {
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

    const dispose = () => {
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

    return { setIndex, dispose }
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

    const setIndex = (index) => {
        currentIndex = index;
        if (plane) {
            plane.position.z = HELPER_COORD_indexToPosition(
                currentIndex,
                GLOBAL_CONFIG_SEISMIC.crosslineCount
            )
        }

        HELPER_SEISMIC_PLANE_updateTexture(
            plane,
            GLOBAL_CONFIG_PATH.getCrosslinePath(currentIndex)
        )
    }

    const dispose = () => {
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
        setIndex,
        dispose
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
        const y = HELPER_COORD_timeToY(twt);

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

    }

    return points;
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
        opacity: fill.opacity ?? 0.35,
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
            SCENE_remove(mesh)
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
    const setLogEntries = (
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
                return logs[log]
                    .some(d => d.value !== null)
            })
    }

    return {
        wellName,
        logs,
        setLogEntries,
        getLogData,
        getAvailableLogs
    }
}

/** @type { Map<string, WellLogDataInstance> } */
let GLOBAL_WELL_LOG_MAP = new Map();

/**
 * @typedef {Object} WellLogApiItem
 * @property {string} wellName
 * @property {WellLogEntry[]} entries
 */

/**
 *
 * @param {string} logType
 * @param {WellLogApiItem[]} wellLogsArray
 */
const WELL_LOG_addTypeData = (
    logType,
    wellLogsArray
) => {

    for (const wellLog of wellLogsArray) {
        const wellName = wellLog.wellName

        if (!GLOBAL_WELL_LOG_MAP.has(wellName)) {
            GLOBAL_WELL_LOG_MAP.set(
                wellName,
                WELL_LOG_DATA_create(wellName)
            )
        }

        GLOBAL_WELL_LOG_MAP
            .get(wellName)
            .setLogEntries(logType, wellLog.entries)
    }
}

/**
 * @param {string} wellName
 * @param {string} logType
 * @param {WellLogEntry[]} entries
 */
const WELL_LOG_addSingleWellData = (
    wellName,
    logType,
    entries
) => {
    if (!wellName) return

    if (!GLOBAL_WELL_LOG_MAP.has(wellName)) {
        GLOBAL_WELL_LOG_MAP.set(
            wellName,
            WELL_LOG_DATA_create(wellName)
        )
    }

    GLOBAL_WELL_LOG_MAP
        .get(wellName)
        .setLogEntries(logType, entries)
}

const WELL_LOG_getData = (wellName) => {
    return GLOBAL_WELL_LOG_MAP.get(wellName)
}

const WELL_LOG_getAvailableTypes = () => {
    const types = new Set()

    for (const [ ,logData] of GLOBAL_WELL_LOG_MAP) {
        logData
            .getAvailableLogs()
            .forEach(logType => types.add(logType))
    }
    return ['None', ...types]
}

/** @param {CanvasRenderingContext2D} ctx */
const HELPER_WELL_roundRect = (
    ctx,
    x,
    y,
    width,
    height,
    radius
) => {
    ctx.beginPath();
    ctx.moveTo(
        x + radius,
        y
    );
    ctx.lineTo(
        x + width - radius,
        y
    );
    ctx.quadraticCurveTo(
        x + width,
        y,
        x + width,
        y + radius
    );
    ctx.lineTo(
        x + width,
        y + height - radius
    );
    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - radius,
        y + height
    );
    ctx.lineTo(
        x + radius,
        y + height
    );
    ctx.quadraticCurveTo(
        x,
        y + height,
        x,
        y + height - radius
    );
    ctx.lineTo(
        x,
        y + radius
    );
    ctx.quadraticCurveTo(
        x,
        y,
        x + radius,
        y
    );
    ctx.closePath();
}

/**
 * @param {Well} well
 * @param {string} text
 */
const WELL_createLabel = (
    well,
    text
) => {

    /** @type {import('three').Sprite | null} */
    let sprite = null

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) throw new Error('Failed to get 2D context');

    const fontSize = 48;
    const padding = 20;

    context.font = `bold ${fontSize}px Arial`

    const textMetrics = context.measureText(text);

    canvas.width = textMetrics.width + padding * 2;
    canvas.height = fontSize + padding * 2;

    context.fillStyle = 'rgba(0, 0, 0, 0.7)'
    HELPER_WELL_roundRect(
        context,
        0,
        0,
        canvas.width,
        canvas.height,
        8
    )

    context.fill();

    context.font = `bold ${fontSize}px Arial`
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    context.fillText(
        text,
        canvas.width / 2,
        canvas.height / 2
    )

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true

    sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        })
    )

    const aspectRatio = canvas.width / canvas.height;
    const labelHeight = 15;

    sprite
        .scale
        .set(
            labelHeight * aspectRatio,
            labelHeight,
            1
        )

    sprite.renderOrder = 100;
    sprite.userData = {
        type: 'wellLabel',
        wellName: well.name
    }

    const updatePosition = () => {
        if (!sprite || !well.mesh) return

        const wellMesh = well.mesh;

        /** @type {import('three').CylinderGeometry} */
        const wellMeshGeometry = wellMesh.geometry;

        const wellHeight = wellMeshGeometry.parameters.height;

        const wellTopY = wellMesh.position.y + wellHeight / 2;

        sprite
            .position
            .set(
                wellMesh.position.x,
                wellTopY + 20,
                wellMesh.position.z
            )
    }

    updatePosition();
    SCENE_add(sprite);

    const setVisible = (visible) => {
        if (sprite) {
            sprite.visible = visible
        }
    }

    const dispose = () => {
        if (sprite) {
            SCENE_remove(sprite);

            /** @type {import('three').SpriteMaterial} */
            const spriteMaterial = sprite.material

            spriteMaterial.map.dispose();
            spriteMaterial.dispose();
            sprite = null;
        }
    }

    return {
        updatePosition,
        setVisible,
        dispose
    }
}

/**
 * @typedef {Object} WellApiData
 * @property {string} well_name
 * @property {number} inline
 * @property {number} crossline
 * @property {number} top
 * @property {number} bottom
 */

/**
 * @typedef {Object} WellLogInstance
 * @property {(visible: boolean) => void } setVisible
 * @property {() => void} dispose
 */
/**
 * @typedef {Object} WellLabelInstance
 * @property {(visible: boolean) => void } setVisible
 * @property {() => void} dispose
 * @property {() => void} updatePosition
 */

/** @param {WellApiData} wellData */
const WELL_create = (
    wellData
) => {

    const name = wellData.well_name;
    const originalColor = GLOBAL_CONFIG_STYLE.defaultWellColor;

    /** @type {import('three').Mesh | null} */
    let mesh = null
    let isHighlighted = false

    /** @type {WellLogDataInstance | null} */
    let logData = null;

    let currentLogType = 'None';

    /** @type {WellLogInstance} | null */
    let wellLog = null;

    /** @type {WellLabelInstance} */
    let label = null;

    const x = HELPER_COORD_inlineToX(wellData.inline)
    const z = HELPER_COORD_crosslineToZ(wellData.crossline)

    const yTop = HELPER_COORD_timeToY(wellData.top)
    const yBottom = HELPER_COORD_timeToY(wellData.bottom)

    const height = Math.abs(yTop - yBottom)
    const centerY = (yTop + yBottom) / 2

    const geometry = new THREE.CylinderGeometry(
        GLOBAL_CONFIG_STYLE.wellRadius,
        GLOBAL_CONFIG_STYLE.wellRadius,
        height,
        32
    )

    const material = new THREE.MeshPhongMaterial({
        color: originalColor,
        shininess: 100,
        transparent: true,
        opacity: 0.4,
        depthWrite: false
    })

    mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = 0;
    mesh
        .position
        .set(
            x,
            centerY,
            z
        )

    if (!mesh) {
        throw new Error('something happened with the mesh creation')
    }
    /** @type {Well} */
    const well = {
        name,
        mesh: mesh,
        get logData() {
            return logData
        },
        setVisible: null,
        highlight: null,
        unhighlight: null,
        setLogData: null,
        setLogType: null,
        getAvailableLogs: null,
        getCurrentLogType: null,
        dispose: null
    }

    mesh.userData = {
        type: 'well',
        name,
        wellInstance: well
    }

    SCENE_add(mesh);

    label = WELL_createLabel(well, name)

    const extendToLogRange = () => {
        if (!logData || !mesh) return

        let minTWT = Infinity;
        let maxTWT = -Infinity;
        let checked = 0;

        const logKeys = Object.keys(logData.logs)

        for (const logKey of logKeys) {
            const entries = logData.logs[logKey];

            if (
                !entries
                || !Array.isArray(entries)
            ) continue

            for (let i = 0; i < entries.length; i++){
                const entry = entries[i];

                if (
                    entry.value !== null
                    && entry.value !== undefined
                ) {
                    const twt = Math.abs(entry.twt)

                    if (twt < minTWT) minTWT = twt;
                    if (twt > maxTWT) maxTWT = twt
                    checked++
                }
            }
        }

        if (
            checked === 0
            || minTWT === Infinity
            || maxTWT === -Infinity
        ) return

        minTWT = Math.min(
            minTWT,
            wellData.top
        )

        maxTWT = Math.max(
            maxTWT,
            wellData.bottom
        )

        const newYTop = HELPER_COORD_timeToY(minTWT);
        const newYBottom = HELPER_COORD_timeToY(maxTWT);

        const newHeight = Math.abs(newYTop - newYBottom)
        const newCenterY = (newYTop + newYBottom) / 2

        console.log(`[Well ${name}] extend: TWT ${minTWT}-${maxTWT}ms, height ${newHeight}, centerY ${newCenterY} (checked ${checked} entries across ${logKeys.length} log types)`);

        const oldX = mesh.position.x;
        const oldZ = mesh.position.z;
        const oldVisible = mesh.visible;

        SCENE_remove(mesh);

        mesh.geometry.dispose();

        /** @type {import('three').MeshPhongMaterial} */
        const meshMaterial = mesh.material
        meshMaterial.dispose();

        const newGeometry = new THREE.CylinderGeometry(
            GLOBAL_CONFIG_STYLE.wellRadius,
            GLOBAL_CONFIG_STYLE.wellRadius,
            newHeight,
            32
        )

        const newMaterial = new THREE.MeshPhongMaterial({
            color: originalColor,
            shininess: 100,
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        })

        mesh = new THREE.Mesh(newGeometry, newMaterial);

        mesh.renderOrder = 0;
        mesh
            .position
            .set(
                oldX,
                newCenterY,
                oldZ
            )
        mesh.visible = oldVisible
        mesh.userData = {
            type: 'well',
            name,
            wellInstance: well
        }
        well.mesh = mesh;

        SCENE_add(mesh);
    }

    well.setVisible = (visible) => {
        if (mesh) mesh.visible = visible
        if (wellLog) wellLog.setVisible(visible)
        if (label) label.setVisible(visible)
    }

    well.highlight = () => {
        if (mesh && !isHighlighted) {
            const color = new THREE.Color(originalColor);
            color.multiplyScalar(0.6);
            /** @type {import('three').MeshPhongMaterial} */
            const meshMaterial = mesh.material
            meshMaterial.color.copy(color);
            isHighlighted = true;
        }
    }

    well.unhighlight = () => {
        if (mesh && isHighlighted) {
            /** @type {import('three').MeshPhongMaterial} */
            const meshMaterial = mesh.material
            meshMaterial.color.set(originalColor);
            isHighlighted = false
        }
    }

    /** @param {WellLogDataInstance} */
    well.setLogData = (newLogData) => {
        logData = newLogData
        extendToLogRange();
        if (label) label.updatePosition();
    }

    well.setLogType = (logType) => {
        if (wellLog) {
            wellLog.dispose();
            wellLog = null;
        }

        currentLogType = logType;

        if (
            logType !== 'None'
            && logData
        ) {
            const entries = logData.getLogData(logType)
            if (
                entries
                && entries.length > 0
            ) {
                wellLog = WELL_LOG_create(
                    well,
                    entries,
                    logType
                )
            }
        }
    }

    well.getAvailableLogs = () => {
        if (!logData) return ['None']
        return ['None', ...logData.getAvailableLogs()]
    }

    well.getCurrentLogType = () => currentLogType;

    well.dispose = () => {
        if (label) {
            label.dispose()
            label = null
        }

        if (wellLog) {
            wellLog.dispose()
            wellLog = null
        }

        if (mesh) {
            SCENE_remove(mesh)
            mesh.geometry.dispose()
            const meshMaterial = mesh.material
            meshMaterial.dispose()
            mesh = null
        }
    }

    return well;
}

/** @type {Well[]} */
let GLOBAL_WELL_ITEMS = []

/** @type {Map<string, Well>} */
let GLOBAL_WELL_MAP = new Map()

/** @type {((names: string[]) => void) | null} */
let GLOBAL_WELL_ON_LOADED = null

/**
 * @typedef {Object} WellApiPayload
 * @property {WellApiData[]} wells
 * @property {number} count
 */
/** @param {WellApiPayload} apiData */
const WELL_loadFromJson = (apiData) => {
    console.log('Loading wells from API...')

    try {
        const {
            wells: wellDataList
        } = apiData

        for (const wellData of wellDataList) {
            if (
                !wellData.well_name
                || GLOBAL_WELL_MAP.has(wellData.well_name)
            ) continue

            const well = WELL_create(wellData)

            GLOBAL_WELL_ITEMS.push(well)

            GLOBAL_WELL_MAP.set(wellData.well_name, well)
        }

        console.log(
            `Wells loaded: ${GLOBAL_WELL_ITEMS.length}`
        )

        if (GLOBAL_WELL_ON_LOADED) {
            GLOBAL_WELL_ON_LOADED(WELL_getNames())
        }
    } catch (error) {
        console.error('Failed to load wells:', error)
    }
}

const WELL_getNames = () => {
    return GLOBAL_WELL_ITEMS.map(well => well.name)
}

const WELL_getByName = (name) => {
    return GLOBAL_WELL_MAP.get(name)
}

const WELL_setVisible = (
    name,
    visible
) => {
    const well = GLOBAL_WELL_MAP.get(name)
    if (well) {
        well.setVisible(visible)
    }
}

const WELL_setAllVisible = (visible) => {
    GLOBAL_WELL_ITEMS.forEach(well => well.setVisible(visible))
}

const WELL_attachLogData = () => {
    let attachedCount = 0;

    for (const well of GLOBAL_WELL_ITEMS) {
        const logData = WELL_LOG_getData(well.name)

        if (logData){
            try {
                well.setLogData(logData)
                attachedCount++
            } catch (err) {
                console.error(
                    `[WellLoader] failed to attach log data`
                )
            }
        }
    }
    console.log(`Wells with log data: ${attachedCount}/${GLOBAL_WELL_ITEMS.length}`)
}

const WELL_setLogType = (
    wellName,
    logType
) => {
    const well = GLOBAL_WELL_MAP.get(wellName)
    if (well) well.setLogType(logType)
}

const WELL_getAvailableLogs = (wellName) => {
    const well = GLOBAL_WELL_MAP.get(wellName)
    if (well) {
        return well.getAvailableLogs()
    } else {
        return ['None']
    }
}

const WELL_getCurrentLogType = (wellName) => {
    const well = GLOBAL_WELL_MAP.get(wellName)
    if (well) {
        return well.getCurrentLogType()
    } else {
        return 'None'
    }
}

const WELL_setAllLogType = (logType) => {
    let changedCount = 0;

    for (const well of GLOBAL_WELL_ITEMS) {
        if (well.logData) {
            well.setLogType(logType)
            changedCount++
        }
    }

    return changedCount
}

const WELL_disposeAll = () => {
    GLOBAL_WELL_ITEMS.forEach(w => w.dispose())
    GLOBAL_WELL_ITEMS = []
    GLOBAL_WELL_MAP.clear()
}

/** @param {(names: string[]) => void} */
const WELL_setOnLoaded = (callback) => {
    GLOBAL_WELL_ON_LOADED = callback;
}

const GLOBAL_API_BASE_URL = GLOBAL_CONFIG_PATH.apiBase

/** @param {string} endpoint */
const API_fetchJson = async (endpoint) => {
    const url = `${GLOBAL_API_BASE_URL}/${endpoint}`
    const response = await fetch(
        url,
        {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        }
    )

    if (!response.ok) {
        throw new Error(`Api fetch failed for ${url}`)
    }

    const json = await response.json();

    if (json.success === false) {
        throw new Error(json.error || `Api error for ${url}`)
    }

    return json.data !== undefined
        ? json.data
        : json;
}

const API_isAvailable = async () => {
    try {
        const baseRoot = GLOBAL_API_BASE_URL.replace(/\/api\/?$/, '')
        const response = await fetch(`${baseRoot}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000)
        })

        return response.ok;
    } catch {
        return false
    }
}

/**
 * @typedef {Object} LoadingTask
 * @property {string} id
 * @property {string} label
 * @property {'pending' | 'loading' | 'success' | 'error' | 'skipped'} status
 * @property {number} progress
 * @property {string} message
 */

/**
 * @typedef {Object} LoadingState
 * @property {LoadingTask[]} tasks
 * @property {number} totalProgress
 * @property {boolean} isComplete
 * @property {boolean} hasErrors
 * @property {string | null} currentTask
 */

/** @type {Map<string, LoadingTask>} */
let GLOBAL_LOADING_TASKS = new Map()

/** @type {((state: LoadingState) => void)[]} */
let GLOBAL_LOADING_LISTENERS = [];

let GLOBAL_LOADING_IS_COMPLETE = false;

const HELPER_LOADING_notify = () => {
    const state = LOADING_getState();
    GLOBAL_LOADING_LISTENERS.forEach(callback => callback(state))
}

const HELPER_LOADING_checkAllComplete = () => {
    const tasks = Array.from(GLOBAL_LOADING_TASKS.values())

    GLOBAL_LOADING_IS_COMPLETE = tasks.every(
        (task) => {
            return (
            task.status === 'success'
            || task.status === 'error'
            || task.status === 'skipped'
            )
        }
    )

    if (GLOBAL_LOADING_IS_COMPLETE) {
        HELPER_LOADING_notify();
    }
}

const LOADING_registerTask = (
    taskId,
    label
) => {
    GLOBAL_LOADING_TASKS.set(
        taskId,
        {
            id: taskId,
            label,
            status: 'pending',
            progress: 0,
            message: ''
        }
    )

    HELPER_LOADING_notify();
}

/**
 * @param {string} taskId
 * @param {Partial<LoadingTask>} state
 */
const  LOADING_updateTask = (
    taskId,
    state
) => {
    const task = GLOBAL_LOADING_TASKS.get(taskId)

    if (task) {
        Object.assign(task, state)
        HELPER_LOADING_notify()
    }
}

const LOADING_completeTask = (
    taskId,
    success = true,
    message = ''
) => {
    LOADING_updateTask(
        taskId,
        {
            status: success ? 'success' : 'error',
            progress: 100,
            message
        }
    )
    HELPER_LOADING_checkAllComplete()
}

const LOADING_skipTask = (
    taskId,
    reason = '',
) => {

    LOADING_updateTask(
        taskId,
        {
            status: 'skipped',
            progress: 100,
            message: reason
        }
    )

    HELPER_LOADING_checkAllComplete();
}

/** @param {(state: LoadingState) => void} callback*/
const LOADING_addListener = (callback) => {
    GLOBAL_LOADING_LISTENERS.push(callback)
}

const LOADING_getState = () => {
    const tasks = Array.from(GLOBAL_LOADING_TASKS.values());

    const totalProgress = tasks.reduce((sum, t) => sum + t.progress, 0)
    const avgProgress = totalProgress / tasks.length

    const progressToShow = tasks.length > 0 ? avgProgress : 0

    return {
        tasks,
        totalProgress: progressToShow,
        isComplete: GLOBAL_LOADING_IS_COMPLETE,
        hasErrors: tasks.some(task => task.status === 'error'),
        currentTask: (tasks.find(task => task.status === 'loading')?.label ?? null)
    }
}

/**
 * @typedef {Object} RawHorizon
 * @property {number} Inline
 * @property {number} Crossline
 * @property {number | null} top
 * @property {number | null} bottom
 */

/**@param {RawHorizon[]} rawHorizons*/
const HELPER_DATA_transformHorizon = (rawHorizons) => {

    /** @type {HorizonPoint[]} */
    const topPoints = [];

    /** @type {HorizonPoint[]} */
    const bottomPoints = [];

    let topMin = Infinity
    let topMax = -Infinity

    let bottomMin = Infinity
    let bottomMax = -Infinity

    for (const horizon of rawHorizons) {
        if (
            horizon.top != null
            && horizon.top !== 0
        ) {
            topPoints.push({
                inline: horizon.Inline,
                crossline: horizon.Crossline,
                z: horizon.top
            })

            topMin = Math.min(topMin, horizon.top)
            topMax = Math.max(topMax, horizon.top)
        }

        if (
            horizon.bottom != null
            && horizon.bottom !== 0
        ) {
            bottomPoints.push({
                inline: horizon.Inline,
                crossline: horizon.Crossline,
                z: horizon.bottom
            })

            bottomMin = Math.min(bottomMin, horizon.bottom)
            bottomMax = Math.max(bottomMax, horizon.bottom)
        }
    }

    /** @type {HorizonData[]} */
    const horizons = [];

    if (topPoints.length > 0) {
        horizons.push({
            name: 'Top',
            points: topPoints,
            z_min: topMin,
            z_max: topMax
        })
    }

    if (bottomPoints.length > 0) {
        horizons.push({
            name: 'Bottom',
            points: bottomPoints,
            z_min: bottomMin,
            z_max: bottomMax
        })
    }

    return horizons
}


/**
 * @typedef {Object} HorizonApiPayload
 * @property {RawHorizon[]} horizons
 * @property {number} count
 */

/**
 * @typedef {Object} WellLogApiPayload
 * @property {WellLogApiItem[]} wells
 * @property {number} count
 */

/**
 * @typedef {Object} FaultApiPayload
 * @property {FaultApiData[]} faults
 */
const DATA_loadAll = async () => {
    let horizonFailed = false;
    let wellFailed = false;
    let wellLogFailed = false;
    let faultFailed = false;

    LOADING_registerTask('horizon', 'Horizons')
    LOADING_registerTask('well', 'Wells');
    LOADING_registerTask('wellLog', 'Well Logs');
    LOADING_registerTask('fault', 'Faults');

    try {
        LOADING_updateTask(
            'horizon',
            {
                status: 'loading',
                progress: 0
            }
        )

        /** @type {HorizonApiPayload} */
        const rawHorizonData = await API_fetchJson('horizon') //ENDPOINT/+horizon

        const transformedHorizons =
            HELPER_DATA_transformHorizon(rawHorizonData.horizons)

        for (const horizon of transformedHorizons) {
            HORIZON_addFromJson(horizon)
        }

        LOADING_completeTask(
            'horizon',
            true,
            `Loaded ${rawHorizonData.count} points`
        )
    } catch (error) {
        console.warn('Horizon loading failed!!!')

        horizonFailed = true

        LOADING_completeTask(
            'horizon',
            false,
            'Failed to load horizon'
        )
    }

    try {
        LOADING_updateTask(
            'well',
            {
                status: 'loading',
                progress: 0
            }
        )

        /** @type {WellApiPayload} */
        const wellData = await API_fetchJson('well');

        WELL_loadFromJson(wellData)
        LOADING_completeTask(
            'well',
            true,
            `Loaded ${wellData.count} wells`
        )
    } catch (error) {
        console.warn('Well loading failed:', error)
        wellFailed = true

        LOADING_completeTask(
            'well',
            false,
            'Failed to load well'
        )
    }

    try {
        LOADING_updateTask(
            'wellLog',
            {
                status: 'loading',
                progress: 0
            }
        )

        const LOG_TYPES = [
                'phie',
                'swe',
                'vsh'
            ]

        let successCount = 0;
        const wellNames = WELL_getNames()

        for (let i = 0; i < LOG_TYPES.length; i++) {
            const logType = LOG_TYPES[i]

            /** @type {PromiseSettledResult<{wellName: string, data: WellLogApiPayload}>[]} */
            const wellLogSettledResults = await Promise.allSettled(
                wellNames.map((wellName) => {
                    return API_fetchJson(
                        `well-log/${logType}/${encodeURIComponent(wellName)}`
                    ).then((data) => ({
                        wellName,
                        data
                    }))
                })
            )

            let typeSuccessCount = 0

            for (const settledResult of wellLogSettledResults) {
                if (settledResult.status === 'fulfilled') {
                    const {
                        wellName,
                        data
                    } = settledResult.value

                    WELL_LOG_addSingleWellData(
                        wellName,
                        logType.toUpperCase(),
                        data.entries || []
                    )

                    typeSuccessCount++
                } else {
                    console.warn(
                        `Well log ${logType} failed for one well`
                    )
                }
            }

            if (typeSuccessCount > 0) {
                successCount++
            }

            LOADING_updateTask(
                'wellLog',
                {
                    status: 'loading',
                    progress: Math.round(((i + 1) / LOG_TYPES.length) * 100)
                }
            )
        }

        WELL_attachLogData()

        if (successCount > 0) {
            LOADING_completeTask(
                'wellLog',
                true,
                `Loaded ${successCount}/3 Log Types`
            )
        } else {
            wellLogFailed = true;
            LOADING_skipTask(
                'wellLog',
                'No Data'
            )
        }
    } catch (error) {
        console.warn('Well log loading failed!!!')
        wellLogFailed = true;

        LOADING_skipTask(
            'wellLog',
            'No Data'
        )
    }

    try {
        LOADING_updateTask(
            'fault',
            {
                status: 'loading',
                progress: 0
            }
        )

        /** @type {FaultApiPayload} */
        const faultData = await API_fetchJson('fault');

        const totalFaults = faultData.faults.length

        let loadedCount = 0;

        for (const fault of faultData.faults) {
            FAULT_loadSurfacesFromJson(fault)

            loadedCount++
            LOADING_updateTask(
                'fault',
                {
                    status: 'loading',
                    progress: Math.round((loadedCount / totalFaults) * 100)
                }
            )
        }

        LOADING_completeTask(
            'fault',
            true,
            `Loaded ${totalFaults} faults`
        )
    } catch (error) {
        console.warn('Fault loading failed', error)
        faultFailed = true
        LOADING_skipTask(
            'fault',
            'Something went wrong when fetching fault'
        )
    }

    return {
        horizonFailed,
        wellFailed,
        wellLogFailed,
        faultFailed,
        dataSource: 'API'
    }
}

/**
 * @param {(value: number) => void} onChange
 */
const UI_createSliderControl = (
    sliderId,
    labelId,
    maxValue,
    onChange
) => {
    const slider = document.getElementById(sliderId)
    const label = document.getElementById(labelId)

    if (slider) {
        slider.max = String(maxValue)
        slider.value = '0'

        slider.addEventListener(
            'input',
            () => {
                const value = parseInt(slider.value)
                if (label) label.textContent = (value + 1).toString();
                if (onChange) onChange(value)
            }
        )
    }
}

/**
 * @param {(isActive: boolean) => void}
 */
const UI_createToggleButton = (
    buttonId,
    showText,
    hideText,
    onToggle
) => {
    const button = document.getElementById(buttonId)
    let isActive = true;

    if (button) {
        button.textContent = hideText

        button.addEventListener('click', () => {
            isActive = !isActive
            button.textContent = isActive
                ? hideText
                : showText

            if (onToggle) {
                onToggle(isActive)
            }
        })
    }
}

/** @type {HTMLElement | null} */
let GLOBAL_UI_WELL_PANEL_CONTAINER = null

/** @type {HTMLButtonElement | null} */
let GLOBAL_UI_WELL_PANEL_TOGGLE_ALL_BTN = null

/** @type {HTMLSelectElement | null} */
let GLOBAL_UI_WELL_PANEL_SET_ALL_SELECT = null

/** @type {Map<string, HTMLInputElement>} */
let GLOBAL_UI_WELL_PANEL_CHECKBOXES = new Map()

/** @type {Map<string, HTMLSelectElement>} */
let GLOBAL_UI_WELL_PANEL_LOG_SELECTORS = new Map()

let GLOBAL_UI_WELL_PANEL_ALL_VISIBLE = true

const HELPER_UI_wellPanelUpdateToggleAllButton = () => {
    if (!GLOBAL_UI_WELL_PANEL_TOGGLE_ALL_BTN) return

    let allChecked = true

    GLOBAL_UI_WELL_PANEL_CHECKBOXES
        .forEach((checkbox) => {
            if (!checkbox.checked) {
                allChecked = false
            }
        })

    GLOBAL_UI_WELL_PANEL_ALL_VISIBLE = allChecked
    GLOBAL_UI_WELL_PANEL_TOGGLE_ALL_BTN.textContent = allChecked
        ? 'Hide All'
        : 'Show All'
}

const UI_initWellTogglePanel = (
    containerId,
    toggleAllBtnId
) => {
    GLOBAL_UI_WELL_PANEL_CONTAINER = document.getElementById(containerId)

    GLOBAL_UI_WELL_PANEL_TOGGLE_ALL_BTN = document.getElementById(toggleAllBtnId)

    GLOBAL_UI_WELL_PANEL_SET_ALL_SELECT = document.getElementById('setAllLogTypeSelect')

    if (GLOBAL_UI_WELL_PANEL_TOGGLE_ALL_BTN) {
        GLOBAL_UI_WELL_PANEL_TOGGLE_ALL_BTN.textContent = GLOBAL_UI_WELL_PANEL_ALL_VISIBLE
            ? 'Hide All'
            : 'Show All'

        GLOBAL_UI_WELL_PANEL_TOGGLE_ALL_BTN.addEventListener('click', () => {
            GLOBAL_UI_WELL_PANEL_ALL_VISIBLE = !GLOBAL_UI_WELL_PANEL_ALL_VISIBLE

            GLOBAL_UI_WELL_PANEL_TOGGLE_ALL_BTN.textContent = GLOBAL_UI_WELL_PANEL_ALL_VISIBLE
                ? 'Hide All'
                : 'Show All'

            WELL_setAllVisible(GLOBAL_UI_WELL_PANEL_ALL_VISIBLE)
            GLOBAL_UI_WELL_PANEL_CHECKBOXES.forEach((checkbox) => {
                checkbox.checked = GLOBAL_UI_WELL_PANEL_ALL_VISIBLE
            })
        })
    }

    if (GLOBAL_UI_WELL_PANEL_SET_ALL_SELECT) {

        GLOBAL_UI_WELL_PANEL_SET_ALL_SELECT.addEventListener(
            'change',
            () => {
                const selectedLogType = GLOBAL_UI_WELL_PANEL_SET_ALL_SELECT.value

                if (selectedLogType) {
                    WELL_setAllLogType(selectedLogType)

                    GLOBAL_UI_WELL_PANEL_LOG_SELECTORS.forEach((select) => {
                        if ([...select.options].some(option => option.value === selectedLogType)){
                            select.value = selectedLogType
                        }
                    })

                    GLOBAL_UI_WELL_PANEL_SET_ALL_SELECT.value = ''
                }
            }
        )
    }
}

/** @param {string[]} wellNames */
const UI_populateWellPanel = (wellNames) => {

    if (!GLOBAL_UI_WELL_PANEL_CONTAINER) return

    GLOBAL_UI_WELL_PANEL_CONTAINER.innerHTML = ''
    GLOBAL_UI_WELL_PANEL_CHECKBOXES.clear()
    GLOBAL_UI_WELL_PANEL_LOG_SELECTORS.clear()

    if (wellNames.length === 0) {
        GLOBAL_UI_WELL_PANEL_CONTAINER.innerHTML = '<div style="color: #888; font-style: italic;">No wells found</div>';
        return;
    }

    const sortedNames = [...wellNames].sort((a, b) => {
        const matchA = a.match(/(\d+)/);
        const matchB = b.match(/(\d+)/);

        if (matchA && matchB) {
            return parseInt(matchA[1]) - parseInt(matchB[1])
        }

        return a.localeCompare(b)
    })

    for (const name of sortedNames) {
        const wellItem = document.createElement('div');
        wellItem.className = 'well-item';

        const labelElement = document.createElement('span');
        labelElement.className = 'well-name';
        labelElement.textContent = name;

        const logSelect = document.createElement('select')
        logSelect.className = 'well-log-select';

        const availableLogs = WELL_getAvailableLogs(name);
        availableLogs.forEach((logType) => {
            const option = document.createElement('option');
            option.value = logType;
            option.textContent = logType;
            logSelect.appendChild(option);
        });

        logSelect.value = WELL_getCurrentLogType(name);
        logSelect.addEventListener(
            'change',
            () => {
                WELL_setLogType(name, logSelect.value)
            }
        )

        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox';
        checkbox.className = 'well-checkbox';
        checkbox.checked = true;
        checkbox.addEventListener(
            'change',
            () => {
                WELL_setVisible(name, checkbox.checked)
                HELPER_UI_wellPanelUpdateToggleAllButton()
            }
        )

        wellItem.appendChild(labelElement);
        wellItem.appendChild(logSelect);
        wellItem.appendChild(checkbox);
        GLOBAL_UI_WELL_PANEL_CONTAINER.appendChild(wellItem);

        GLOBAL_UI_WELL_PANEL_CHECKBOXES.set(name, checkbox);
        GLOBAL_UI_WELL_PANEL_LOG_SELECTORS.set(name, logSelect);
    }
}

const UI_refreshWellLogSelectors = () => {
    if (GLOBAL_UI_WELL_PANEL_SET_ALL_SELECT) {
        const allLogTypes = new Set(['None']);

        GLOBAL_WELL_ITEMS.forEach((well) => {
            if (well.logData) {
                well
                    .getAvailableLogs()
                    .forEach(log => allLogTypes.add(log));
            }
        });

        GLOBAL_UI_WELL_PANEL_SET_ALL_SELECT.innerHTML = '<option value="">Set All...</option>';

        [...allLogTypes]
            .filter(log => log !== 'None')
            .sort()
            .forEach((logType) => {
                const option = document.createElement('option');
                option.value = logType;
                option.textContent = logType;
                GLOBAL_UI_WELL_PANEL_SET_ALL_SELECT.appendChild(option);
            });

        const noneOption = document.createElement('option');
        noneOption.value = 'None';
        noneOption.textContent = 'None';
        GLOBAL_UI_WELL_PANEL_SET_ALL_SELECT.appendChild(noneOption);
    }

    GLOBAL_UI_WELL_PANEL_LOG_SELECTORS.forEach((select, name) => {
        const currentValue = select.value;
        select.innerHTML = '';

        const availableLogs = WELL_getAvailableLogs(name);
        availableLogs.forEach((logType) => {
            const option = document.createElement('option');
            option.value = logType;
            option.textContent = logType;
            select.appendChild(option);
        });

        if (availableLogs.includes(currentValue)) {
            select.value = currentValue;
        }
    });
}

const HELPER_UI_disableSlider = (
    sliderId,
    labelId
) => {
    const slider = document.getElementById(sliderId)
    const label = document.getElementById(labelId);

    if (slider) {
        slider.disabled = true;
        slider.classList.add('slider-disabled');
    }
    if (label) {
        label.textContent = 'N/A';
        label.style.color = '#999';
    }
    if (slider?.closest('.control-panel')) {

        /** @type {HTMLElement} */
        const sliderClosestControlPanel = slider.closest('.control-panel')
        sliderClosestControlPanel
            .classList
            .add('panel-disabled');
    }
}

const HELPER_UI_disableButton = (
    btnId,
    text
) => {

    /** @type {HTMLButtonElement} */
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.textContent = text;
        btn.disabled = true;
        btn
            .classList
            .add('btn-disabled');
    }
}

/**
 * @typedef {Object} DataLoadResult
 * @property {boolean} horizonFailed
 * @property {boolean} wellFailed
 * @property {boolean} wellLogFailed
 * @property {boolean} faultFailed
 * @property {string | null} dataSource
 */

/**
 * @typedef {Object} SeismicPlane
 * @property {(index: number) => void} setIndex
 * @property {() => void} dispose
 */

/**
 * @param {DataLoadResult} result
 * @param {boolean} apiAvailable
 * @param {SeismicPlane | null} inlinePlane
 * @param {SeismicPlane | null} crosslinePlane
 */
const UI_initControls = (
    result,
    apiAvailable,
    inlinePlane,
    crosslinePlane,
) => {

    if (inlinePlane && crosslinePlane && apiAvailable) {
        UI_createSliderControl(
            'inlineSlider',
            'label_inline',
            GLOBAL_CONFIG_SEISMIC.getMaxInlineIndex(),
            (value) => inlinePlane.setIndex(value)
        );
        UI_createSliderControl(
            'crosslineSlider',
            'label_crossline',
            GLOBAL_CONFIG_SEISMIC.getMaxCrosslineIndex(),
            (value) => crosslinePlane.setIndex(value)
        );
    } else {
        HELPER_UI_disableSlider('inlineSlider', 'label_inline');
        HELPER_UI_disableSlider('crosslineSlider', 'label_crossline');
    }

    if (!result.horizonFailed) {
        UI_createToggleButton(
            'toggleHorizonBtn',
            'Show Horizon',
            'Hide Horizon',
            (visible) => HORIZON_setAllVisible(visible)
        );
    } else {
        HELPER_UI_disableButton('toggleHorizonBtn', 'Horizon N/A');
    }

    if (!result.faultFailed) {
        UI_createToggleButton(
            'toggleFaultBtn',
            'Show Fault',
            'Hide Fault',
            (visible) => FAULT_setAllVisible(visible)
        );
    } else {
        HELPER_UI_disableButton('toggleFaultBtn', 'Fault N/A');
    }

    if (!result.wellFailed) {
        UI_initWellTogglePanel(
            'wellList',
            'toggleAllWellsBtn'
        );

        WELL_setOnLoaded((wellNames) => {
            UI_populateWellPanel(wellNames);
        });

        const existingWells = WELL_getNames();
        if (existingWells.length > 0) {
            UI_populateWellPanel(existingWells);
        }

        UI_refreshWellLogSelectors();
    } else {
        const toggleBtn = document.getElementById('toggleAllWellsBtn')
        const setAllSelect = document.getElementById('setAllLogTypeSelect')
        const wellList = document.getElementById('wellList');
        const wellControl = document.getElementById('wellControl');

        if (toggleBtn) {
            toggleBtn.disabled = true;
            toggleBtn.classList.add('btn-disabled');
            toggleBtn.textContent = 'N/A';
        }
        if (setAllSelect) {
            setAllSelect.disabled = true;
            setAllSelect
                .classList
                .add('select-disabled');
        }
        if (wellList) {
            wellList.innerHTML =
                '<div class="well-panel-offline">Well data not available</div>';
        }
        if (wellControl) {
            wellControl
                .classList
                .add('panel-disabled');
        }
    }

    const resetBtn = document.getElementById('resetCameraBtn');
    if (resetBtn) resetBtn.addEventListener(
        'click',
        () => SCENE_resetCamera()
    );
}

/** @type {HTMLElement | null} */
let GLOBAL_UI_LOADING_SCREEN = null;

/** @type {HTMLElement | null} */
let GLOBAL_UI_LOADING_PROGRESS_FILL = null;

/** @type {HTMLElement | null} */
let GLOBAL_UI_LOADING_STATUS_TEXT = null;

/** @type {HTMLElement | null} */
let GLOBAL_UI_LOADING_TASKS_CONTAINER = null;

/** @type {HTMLElement | null} */
let GLOBAL_UI_LOADING_DATA_SOURCE_NAME = null;

/** @type {HTMLElement | null} */
let GLOBAL_UI_LOADING_DATA_SOURCE_INDICATOR = null;

/** @type {HTMLElement | null} */
let GLOBAL_UI_LOADING_CURRENT_DATA_SOURCE = null;

const HELPER_UI_LOADING_getTaskClass = (status) => {
    /** @type {Record<string, string>} */
    const statusToClassMap = {
        loading: 'active',
        success: 'complete',
        error: 'error',
        skipped: 'skipped'
    };
    return statusToClassMap[status] || '';
};

const HELPER_UI_LOADING_getTaskIcon = (status) => {
    /** @type {Record<string, string>} */
    const statusToClassMap = {
        pending: '\u25CB',
        loading: '<div class="task-spinner"></div>',
        success: '\u2713',
        error: '\u2717',
        skipped: '\u2298'
    };
    return statusToClassMap[status] || '\u25CB';
};

/**
 *
 * @param {LoadingTask[]} tasks
 */
const HELPER_UI_LOADING_updateTasks = (tasks) => {
    if (!GLOBAL_UI_LOADING_TASKS_CONTAINER) return;
    GLOBAL_UI_LOADING_TASKS_CONTAINER.innerHTML = '';

    for (const task of tasks) {
        const taskElement = document.createElement('div');
        taskElement.className =
            `loading-task ${HELPER_UI_LOADING_getTaskClass(task.status)}`;

        const iconElement = document.createElement('span');
        iconElement.className = 'task-icon';
        iconElement.innerHTML = HELPER_UI_LOADING_getTaskIcon(task.status);

        const labelElement = document.createElement('span');
        labelElement.textContent = task.label;

        taskElement.appendChild(iconElement);
        taskElement.appendChild(labelElement);

        if (
            task.message
            && (
                task.status === 'error'
                || task.status === 'skipped'
            )
        ) {
            const msgElement = document.createElement('span');
            msgElement.style.cssText =
                'margin-left: auto; font-size: 11px; opacity: 0.7;';

            msgElement.textContent = task.message;
            taskElement.appendChild(msgElement);
        }

        GLOBAL_UI_LOADING_TASKS_CONTAINER.appendChild(taskElement);
    }
};

const UI_LOADING_HideScreen = () => {
    if (GLOBAL_UI_LOADING_SCREEN) {
        GLOBAL_UI_LOADING_SCREEN
            .classList
            .add('hidden');
    }
    if (GLOBAL_UI_LOADING_DATA_SOURCE_INDICATOR) {
        GLOBAL_UI_LOADING_DATA_SOURCE_INDICATOR
            .style
            .display = 'block';
    }
};

const UI_LOADING_ForceHideScreen = () => {
    if (GLOBAL_UI_LOADING_SCREEN) {
        GLOBAL_UI_LOADING_SCREEN
            .style
            .display = 'none';
    }
};

/** @param {boolean} hasErrors */
const HELPER_UI_LOADING_OnComplete = (hasErrors) => {
    if (GLOBAL_UI_LOADING_STATUS_TEXT) {
        GLOBAL_UI_LOADING_STATUS_TEXT.textContent = hasErrors
            ? 'Completed with some issues'
            : 'Loading complete!';
    }

    if (GLOBAL_UI_LOADING_PROGRESS_FILL) {
        GLOBAL_UI_LOADING_PROGRESS_FILL
            .style
            .width = '100%';
    }

    setTimeout(
        () => UI_LOADING_HideScreen(),
        hasErrors
            ? 1500
            : 800
    );
};

/** @param {LoadingState} state */
const HELPER_UI_LOADING_onStateChange = (state) => {
    if (GLOBAL_UI_LOADING_PROGRESS_FILL) {
        GLOBAL_UI_LOADING_PROGRESS_FILL
            .style
            .width =
                `${
                    Math.min(
                        100,
                        state.totalProgress
                    )
                }%`;
    }
    if (GLOBAL_UI_LOADING_STATUS_TEXT) {
        GLOBAL_UI_LOADING_STATUS_TEXT.textContent =
            state.currentTask
                ? `Loading ${state.currentTask}...`
                : 'Processing...';
    }
    HELPER_UI_LOADING_updateTasks(state.tasks);

    if (state.isComplete) {
        HELPER_UI_LOADING_OnComplete(state.hasErrors);
    }
}

const UI_LOADING_setDataSource = (sourceName) => {
    if (GLOBAL_UI_LOADING_DATA_SOURCE_NAME) {
        GLOBAL_UI_LOADING_DATA_SOURCE_NAME.textContent = sourceName;
    }

    if (GLOBAL_UI_LOADING_CURRENT_DATA_SOURCE) {
        GLOBAL_UI_LOADING_CURRENT_DATA_SOURCE.textContent = sourceName;
    }
}

const UI_LOADING_init = () => {
    GLOBAL_UI_LOADING_SCREEN = document.getElementById('loadingScreen');

    GLOBAL_UI_LOADING_PROGRESS_FILL = document.getElementById('loadingProgressFill');

    GLOBAL_UI_LOADING_STATUS_TEXT = document.getElementById('loadingStatus');

    GLOBAL_UI_LOADING_TASKS_CONTAINER = document.getElementById('loadingTasks');

    GLOBAL_UI_LOADING_DATA_SOURCE_NAME = document.getElementById('dataSourceName');

    GLOBAL_UI_LOADING_DATA_SOURCE_INDICATOR = document.getElementById('dataSourceIndicator');

    GLOBAL_UI_LOADING_CURRENT_DATA_SOURCE = document.getElementById('currentDataSource');

    LOADING_addListener((state) => HELPER_UI_LOADING_onStateChange(state));
};

const APP_init = async () => {
    console.log('Starting Seismic Viewer...')

    UI_LOADING_init();

    try {
        SCENE_init()
    } catch (error) {
        console.error('Failed to init scene!!!')
        UI_LOADING_ForceHideScreen()
        return
    }

    const apiAvailable = await API_isAvailable();

    /** @type {SeismicPlane | null} */
    let inlinePlane = null

    /** @type {SeismicPlane | null} */
    let crosslinePlane = null

    if (apiAvailable) {
        inlinePlane = SEISMIC_PLANE_createInline();
        crosslinePlane = SEISMIC_PLANE_createCrossline();
    }

    /** @type {DataLoadResult} */
    let result;

    if (!apiAvailable) {
        LOADING_registerTask('horizon', 'Horizons')
        LOADING_registerTask('well', 'Wells')
        LOADING_registerTask('wellLog', 'Well Logs');
        LOADING_registerTask('fault', 'Faults');

        LOADING_skipTask('horizon', 'Backend tidak tersedia');
        LOADING_skipTask('well', 'Backend tidak tersedia');
        LOADING_skipTask('wellLog', 'Backend tidak tersedia');
        LOADING_skipTask('fault', 'Backend tidak tersedia');

        result = {
            horizonFailed: true,
            wellFailed: true,
            wellLogFailed: true,
            faultFailed: true
        };

        UI_LOADING_setDataSource('Offline')
    } else {
        try {
            result = await DATA_loadAll()
            if (!result.dataSource){
                throw new Error('Data source undefined!')
            }
            UI_LOADING_setDataSource(result.dataSource)
        } catch (error) {
            console.error('Data loading failed!!!')

            result = {
                horizonFailed: true,
                wellFailed: true,
                wellLogFailed: true,
                faultFailed: true
            };

            UI_LOADING_setDataSource('Offline (Error)');
        }
    }

    UI_initControls(
        result,
        apiAvailable,
        inlinePlane,
        crosslinePlane
    )

    SCENE_startRenderLoop();

    console.log(
        'Seismic Viewer Initialized'
        + (
            apiAvailable
            ? ' successfully!'
            : ' in offline mode'
        )
    )
}

const APP_cleanup = () => {
    SCENE_stopRenderLoop()
    FAULT_disposeAll()
    WELL_disposeAll()
}

window.seismicApp = {
    resetCamera: SCENE_resetCamera,
    stopRenderLoop: SCENE_stopRenderLoop,
    getWell: WELL_getByName,
    getAvailableLogTypes: WELL_LOG_getAvailableTypes,
    cleanupApp: APP_cleanup
};

window.addEventListener(
    'beforeunload',
    APP_cleanup
)

APP_init().catch((error) => {
    console.error('Failed to start seismic viewer application!!!')
})