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

    const x = targetX + radius * Math.sin(phi) * Math.cos(theta)
    const y = targetY + radius * Math.cos(phi)
    const z = targetZ + radius * Math.sin(phi) * Math.sin(theta)

    GLOBAL_SCENE_CAMERA.position.set(x, y, z)
    GLOBAL_SCENE_CAMERA.lookAt(targetX, targetY, targetZ)
}

const HELPER_SCENE_handlePan = (deltaX, deltaY) => {
    const { theta } = GLOBAL_SCENE_ORBIT_STATE;

    const rightX = -Math.sin(theta)
    const rightZ = Math.cos(theta)

    GLOBAL_SCENE_ORBIT_STATE.targetOffset.x +=  deltaX * GLOBAL_CONFIG_CAMERA.panSpeed * rightX;
    GLOBAL_SCENE_ORBIT_STATE.targetOffset.z +=  deltaX * GLOBAL_CONFIG_CAMERA.panSpeed * rightZ; // Kenapa pake deltaX juga yaa??
    GLOBAL_SCENE_ORBIT_STATE.targetOffset.y +=  deltaY * GLOBAL_CONFIG_CAMERA.panSpeed;

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
}