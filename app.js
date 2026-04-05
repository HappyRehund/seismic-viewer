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
    curveSegments
}

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


