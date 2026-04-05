const GLOBAL_CONFIG_SEISMIC = {
    innlineCount: 1092,
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


