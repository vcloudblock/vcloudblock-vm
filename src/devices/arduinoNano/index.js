const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const ProgramModeType = require('../../extension-support/program-mode-type');
const Serialport = require('../../io/serialport');
const Base64Util = require('../../util/base64-util');
const formatMessage = require('format-message');

/**
 * The list of USB device filters.
 * @readonly
 */
const PNPID_LIST = [
    // CH340
    'USB\\VID_1A86&PID_7523',
    // PL2303
    'USB\\VID_067B&PID_2303',
    // FT232
    'USB\\VID_0403&PID_6001',
    // CP2102
    'USB\\VID_10C4&PID_EA61'
];

/**
 * Configuration of serialport
 * @readonly
 */
const CONFIG = {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1
};

/**
 * Configuration of build and flash. Used by arduino_debug and avrdude.
 * @readonly
 */
const DIVECE_OPT = {
    type: 'arduino',
    board: 'arduino:avr:nano',
    partno: 'atmega328p'
}


/**
 * Manage communication with a Arduino Nano peripheral over a Scrath Link client socket.
 */
class ArduinoNano {

    /**
     * Construct a Arduino communication object.
     * @param {Runtime} runtime - the Scratch 3.0 runtime
     * @param {string} deviceId - the id of the extension
     */
    constructor (runtime, deviceId) {
        /**
         * Store this for later communication with the Scratch VM runtime.
         * If this extension is running in a sandbox then `runtime` is an async proxy object.
         * @type {Runtime}
         */
        this._runtime = runtime;

        /**
         * The serialport connection socket for reading/writing peripheral data.
         * @type {SERIALPORT}
         * @private
         */
        this._serialport = null;
        this._runtime.registerPeripheralExtension(deviceId, this);

        /**
         * The id of the extension this peripheral belongs to.
         */
        this._deviceId = deviceId;
    }

    /**
     * Called by the runtime when user wants to upload code to a peripheral.
     */
    upload(code) {
        var base64Str = Buffer.from(code).toString('base64');
        this._serialport.upload(base64Str, DIVECE_OPT, 'base64');
    }

    /**
     * Called by the runtime when user wants to scan for a peripheral.
     */
    scan () {
        if (this._serialport) {
            this._serialport.disconnect();
        }
        this._serialport = new Serialport(this._runtime, this._deviceId, {
            filters: {
                pnpid: PNPID_LIST,
            }
        });
    }

    /**
     * Called by the runtime when user wants to connect to a certain peripheral.
     * @param {number} id - the id of the peripheral to connect to.
     */
    connect(id) {
        if (this._serialport) {
            this._serialport.connectPeripheral(id, { config: CONFIG });
        }
    }

    /**
     * Disconnect from the peripheral.
     */
    disconnect () {
        if (this._serialport) {
            this._serialport.disconnect();
        }
    }

    /**
     * Return true if connected to the peripheral.
     * @return {boolean} - whether the peripheral is connected.
     */
    isConnected () {
        let connected = false;
        if (this._serialport) {
            connected = this._serialport.isConnected();
        }
        return connected;
    }
}

/**
 * Scratch 3.0 blocks to interact with a Arduino Nano peripheral.
 */
class Scratch3ArduinoNanoDevice {
    /**
     * @return {string} - the ID of this extension.
     */
    static get DEVICE_ID () {
        return 'arduinoNano';
    }

    /**
     * Construct a set of Arduino blocks.
     * @param {Runtime} runtime - the Scratch 3.0 runtime.
     */
    constructor (runtime) {
        /**
         * The Scratch 3.0 runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // Create a new Arduino uno peripheral instance
        this._peripheral = new ArduinoNano(this.runtime, Scratch3ArduinoNanoDevice.DEVICE_ID);
    }

    /**
     * @returns {Array.<object>} metadata for this extension and its blocks.
     */
    getInfo () {
        return [
            {
                id: 'pin',
                name: formatMessage({
                    default: 'Pins',
                    description: 'The name of the arduino nano device pin category',
                    id: 'arduinoNano.category.Pins',
                }),
                color1: '#4C97FF',
                color2: '#3373CC',
                color3: '#3373CC',

                blocks: [
                    {
                        opcode: 'whenButton',
                        text: 'when [BTN]',
                        blockType: BlockType.HAT,
                        arguments: {
                            BTN: {
                                type: ArgumentType.STRING,
                                menu: 'buttons',
                                defaultValue: "AA1"
                            }
                        },
                    },
                    {
                        opcode: 'arduino_pin_mode',
                        text: 'set arduino pin mode as [MODE]',
                        blockType: BlockType.COMMAND,
                        arguments: {
                            MODE: {
                                type: ArgumentType.STRING,
                                menu: 'pinmode',
                                defaultValue: "digital"
                            }
                        },
                    },
                    {
                        opcode: 'displayTest',
                        text: 'clear test',
                        blockType: BlockType.COMMAND,
                    },
                ],
                menus: {
                    buttons: {
                        items: [{
                            text: 'A',
                            value: "AA1"
                        },
                        {
                            text: 'B',
                            value: "BB1"
                        }]
                    },
                    pinmode: {
                        items: [{
                            text: 'digital',
                            value: "digital"
                        },
                        {
                            text: 'analog',
                            value: "analog"
                        }]
                    }
                }
            },
            {
                id: 'test',
                name: formatMessage({
                    default: 'Test',
                    description: 'The name of the arduino nano device test category',
                    id: 'arduinoNano.category.Test',
                }),
                color1: '#9966FF',
                color2: '#774DCB',
                color3: '#774DCB',
                blocks: [
                    {
                        opcode: 'whenButtonPressed',
                        text: 'when [BTN] button pressed',
                        blockType: BlockType.HAT,
                        arguments: {
                            BTN: {
                                type: ArgumentType.STRING,
                                menu: 'buttons',
                                defaultValue: "AA1"
                            }
                        },
                        programMode: [ProgramModeType.REALTIME, ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'arduino_pin_mode',
                        text: 'set arduino pin mode as [MODE]',
                        blockType: BlockType.COMMAND,
                        arguments: {
                            MODE: {
                                type: ArgumentType.STRING,
                                menu: 'pinmode',
                                defaultValue: "digital"
                            }
                        },
                        programMode: [ProgramModeType.REALTIME]
                    },
                    {
                        opcode: 'displayClear',
                        text: 'clear display',
                        blockType: BlockType.COMMAND
                    },
                ],
                menus: {
                    buttons: {
                        items: [{
                            text: 'A',
                            value: "AA1"
                        },
                        {
                            text: 'B',
                            value: "BB1"
                        }]
                    },
                    pinmode: {
                        items: [{
                            text: 'digital',
                            value: "digital"
                        },
                        {
                            text: 'analog',
                            value: "analog"
                        }]
                    }
                }
            }

        ]
    }

    whenButtonPressed(args) {
        console.log(args);
        return "as"
    };

    arduino_pin_mode(args) {
        console.log(args);
        return "test"
    }

    displayClear() {
        console.log('displayClear: arduinoMni');
    }
}

module.exports = Scratch3ArduinoNanoDevice;
