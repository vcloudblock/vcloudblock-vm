const formatMessage = require('format-message');
const Buffer = require('buffer').Buffer;

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Serialport = require('../../io/serialport');

/**
* The list of USB device filters.
* @readonly
*/
const PNPID_LIST = [
    'USB\\VID_0D28&PID_0204'
];

/**
* Configuration of serialport
* @readonly
*/
const SERIAL_CONFIG = {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1
};

/**
 * Configuration of flash.
 * @readonly
 */
const DIVECE_OPT = {
    type: 'microbit'
};

const LedState = {
    On: 'on',
    Off: 'off'
};

const Key = {
    A: 'a',
    B: 'n'
};

const Gestrue = {
    Shake: 'shake',
    Up: 'up',
    Down: 'down',
    Left: 'left',
    Right: 'right',
    Faceup: 'faceup',
    Facedown: 'facedown',
    Freefall: 'freefall',
    G3: '3g',
    G6: '6g',
    G8: '8g'
};

const Axis = {
    X: 'x',
    Y: 'y',
    Z: 'z'
};

const Pins = {
    P0: '0',
    P1: '1',
    P2: '2',
    P3: '3',
    P4: '4',
    P5: '5',
    P6: '6',
    P7: '7',
    P8: '8',
    P9: '9',
    P10: '10',
    P11: '11',
    P12: '12',
    P13: '13',
    P14: '14',
    P15: '15',
    P16: '16'
};

const Level = {
    High: '1',
    Low: '0'
};

/**
 * Manage communication with a Microbit peripheral over a OpenBlock Link client socket.
 */
class Microbit{

    /**
     * Construct a Microbit communication object.
     * @param {Runtime} runtime - the OpenBlock runtime
     * @param {string} deviceId - the id of the extension
     */
    constructor (runtime, deviceId) {
        /**
         * The OpenBlock runtime used to trigger the green flag button.
         * @type {Runtime}
         * @private
         */
        this._runtime = runtime;

        /**
         * The serialport connection socket for reading/writing peripheral data.
         * @type {SERIALPORT}
         * @private
         */
        this._serialport = null;
        this._runtime.registerPeripheralExtension(deviceId, this);
        this._runtime.setRealtimeBaudrate(SERIAL_CONFIG.baudRate);

        /**
         * The id of the extension this peripheral belongs to.
         */
        this._deviceId = deviceId;

        /**
         * A flag that is true while we are busy sending data to the serialport socket.
         * @type {boolean}
         * @private
         */
        this._busy = false;

        /**
         * ID for a timeout which is used to clear the busy flag if it has been
         * true for a long time.
         */
        this._busyTimeoutID = null;

        /**
        * Pending data list. If busy is set when send, the data will push into this array to
        * waitting to be sended.
        */
        this._pendingData = [];

        this.reset = this.reset.bind(this);
        this._onConnect = this._onConnect.bind(this);
        this._onMessage = this._onMessage.bind(this);
    }

    /**
     * Called by the runtime when user wants to upload code to a peripheral.
     * @param {string} code - the code want to upload.
     */
    upload (code) {
        const base64Str = Buffer.from(code).toString('base64');
        this._serialport.upload(base64Str, DIVECE_OPT, 'base64');
    }

    /**
     * Called by the runtime when user wants to upload realtime firmware to a peripheral.
     */
    uploadFirmware () {
    }

    /**
     * Called by the runtime when user wants to scan for a peripheral.
     * @param {Array.<string>} pnpidList - the array of pnp id list
     */
    scan (pnpidList) {
        if (this._serialport) {
            this._serialport.disconnect();
        }
        this._serialport = new Serialport(this._runtime, this._deviceId, {
            filters: {
                pnpid: pnpidList ? pnpidList : PNPID_LIST
            }
        }, this._onConnect, this.reset);
    }

    /**
     * Called by the runtime when user wants to connect to a certain peripheral.
     * @param {number} id - the id of the peripheral to connect to.
     * @param {?number} baudrate - the baudrate.
     */
    connect (id, baudrate = null) {
        const config = SERIAL_CONFIG;
        if (baudrate) {
            config.baudRate = baudrate;
        }
        if (this._serialport) {
            this._serialport.connectPeripheral(id, {config: config});
        }
    }

    /**
     * Disconnect from the peripheral.
     */
    disconnect () {
        if (this._serialport) {
            this._serialport.disconnect();
        }

        this.reset();
    }

    /**
     * Reset all the state and timeout/interval ids.
     */
    reset () {
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

    /**
     * Set baudrate of the peripheral serialport.
     * @param {number} baudrate - the baudrate.
     */
    setBaudrate (baudrate) {
        this._serialport.setBaudrate(baudrate);
    }

    /**
     * Write data to the peripheral serialport.
     * @param {string} data - the data to write.
     */
    write (data) {
        if (!this.isConnected()) return;

        const base64Str = Buffer.from(data).toString('base64');
        this._serialport.write(base64Str, 'base64');
    }

    /**
     * Send a message to the peripheral Serialport socket.
     * @param {Uint8Array} message - the message to write
     */
    send () {
    }

    /**
     * Starts reading data from peripheral after serialport has connected to it.
     * @private
     */
    _onConnect () {
    }

    /**
     * Process the sensor data from the incoming serialport characteristic.
     * @param {object} base64 - the incoming serialport data.
     * @private
     */
    _onMessage () {
    }

    /**
     * @param {PIN} pin - the pin string to parse.
     * @return {number} - the pin number.
     */
    parsePin (pin) {
        if (pin.charAt(0) === 'A') {
            return parseInt(pin.slice(1), 10) + 14;
        }
        return parseInt(pin, 10);

    }
}

/**
 * OpenBlock blocks to interact with a Microbit peripheral.
 */
class OpenBlockMicrobitDevice {
    /**
     * @return {string} - the ID of this extension.
     */
    static get DEVICE_ID () {
        return 'microbit';
    }

    get LEDSTATE_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'microbit.ledState.on',
                    default: 'on',
                    description: 'label for led state on'
                }),
                value: LedState.On
            },
            {
                text: formatMessage({
                    id: 'microbit.ledState.off',
                    default: 'off',
                    description: 'label for led state off'
                }),
                value: LedState.Off
            }
        ];
    }

    get LEDBRT_MENU () {
        return [
            {
                text: '0',
                value: '0'
            },
            {
                text: '1',
                value: '1'
            },
            {
                text: '2',
                value: '2'
            },
            {
                text: '3',
                value: '3'
            },
            {
                text: '4',
                value: '4'
            },
            {
                text: '5',
                value: '5'
            },
            {
                text: '6',
                value: '6'
            },
            {
                text: '7',
                value: '7'
            },
            {
                text: '8',
                value: '8'
            },
            {
                text: '9',
                value: '9'
            }
        ];
    }

    get KEYS_MENU () {
        return [
            {
                text: 'A',
                value: Key.A
            },
            {
                text: 'B',
                value: Key.B
            }
        ];
    }

    get GESTRUES_MENU () {
        return [
            {
                text: 'shaken',
                value: Gestrue.Shake
            },
            {
                text: 'tilted upward',
                value: Gestrue.Up
            },
            {
                text: 'tilted downward',
                value: Gestrue.Down
            },
            {
                text: 'tilted leftward',
                value: Gestrue.Left
            },
            {
                text: 'tilted rightward',
                value: Gestrue.Right
            },
            {
                text: 'face up',
                value: Gestrue.Faceup
            },
            {
                text: 'face down',
                value: Gestrue.Facedown
            },
            {
                text: 'freefall',
                value: Gestrue.Freefall
            },
            {
                text: '3g',
                value: Gestrue.G3
            },
            {
                text: '6g',
                value: Gestrue.G6
            },
            {
                text: '8g',
                value: Gestrue.G8
            }
        ];
    }

    get AXIS_MENU () {
        return [
            {
                text: 'x-axis',
                value: Axis.X
            },
            {
                text: 'y-axis',
                value: Axis.Y
            },
            {
                text: 'z-axis',
                value: Axis.Z
            }
        ];
    }

    get PINS_MENU () {
        return [
            {
                text: 'P0',
                value: Pins.P0
            },
            {
                text: 'P1',
                value: Pins.P1
            },
            {
                text: 'P2',
                value: Pins.P2
            },
            {
                text: 'P3',
                value: Pins.P3
            },
            {
                text: 'P4',
                value: Pins.P4
            },
            {
                text: 'P5',
                value: Pins.P5
            },
            {
                text: 'P6',
                value: Pins.P6
            },
            {
                text: 'P7',
                value: Pins.P7
            },
            {
                text: 'P8',
                value: Pins.P8
            },
            {
                text: 'P9',
                value: Pins.P9
            },
            {
                text: 'P10',
                value: Pins.P10
            },
            {
                text: 'P11',
                value: Pins.P11
            },
            {
                text: 'P12',
                value: Pins.P12
            },
            {
                text: 'P13',
                value: Pins.P13
            },
            {
                text: 'P14',
                value: Pins.P14
            },
            {
                text: 'P15',
                value: Pins.P15
            },
            {
                text: 'P16',
                value: Pins.P16
            }

        ];
    }

    get LEVEL_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'microbit.levelMenu.high',
                    default: 'High',
                    description: 'label for high level'
                }),
                value: Level.High
            },
            {
                text: formatMessage({
                    id: 'microbit.levelMenu.low',
                    default: 'Low',
                    description: 'label for low level'
                }),
                value: Level.Low
            }
        ];
    }

    get ANALOG_PINS_MENU () {
        return [
            {
                text: 'P0',
                value: Pins.P0
            },
            {
                text: 'P1',
                value: Pins.P1
            },
            {
                text: 'P2',
                value: Pins.P2
            },
            {
                text: 'P3',
                value: Pins.P3
            },
            {
                text: 'P4',
                value: Pins.P4
            },
            {
                text: 'P10',
                value: Pins.P10
            }
        ];
    }

    get TOUCH_PINS_MENU () {
        return [
            {
                text: 'P0',
                value: Pins.P0
            },
            {
                text: 'P1',
                value: Pins.P1
            },
            {
                text: 'P2',
                value: Pins.P2
            }
        ];
    }

    get CHANNEL_MENU () {
        const channel = [];

        for (let i = 0; i < 84; i++) {
            channel.push(
                {
                    text: `${i}`,
                    value: `${i}`
                });
        }
        return channel;
    }

    /**
     * Construct a set of Microbit blocks.
     * @param {Runtime} runtime - the OpenBlock runtime.
     */
    constructor (runtime) {
        /**
         * The OpenBlock runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // Create a new Microbit peripheral instance
        this._peripheral = new Microbit(this.runtime, OpenBlockMicrobitDevice.DEVICE_ID);
    }

    /**
     * @returns {Array.<object>} metadata for this extension and its blocks.
     */
    getInfo () {
        return [{
            id: 'pin',
            name: formatMessage({
                id: 'microbit.category.pins',
                default: 'Pins',
                description: 'The name of the microbit device pin category'
            }),
            color1: '#4C97FF',
            color2: '#3373CC',
            color3: '#3373CC',

            blocks: [
                {
                    opcode: 'setDigitalOutput',
                    text: formatMessage({
                        id: 'microbit.pins.setDigitalOutput',
                        default: 'set digital pin [PIN] out [LEVEL]',
                        description: 'microbit set digital pin out'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PIN: {
                            type: ArgumentType.STRING,
                            menu: 'pins',
                            defaultValue: Pins.P0
                        },
                        LEVEL: {
                            type: ArgumentType.STRING,
                            menu: 'level',
                            defaultValue: Level.High
                        }
                    }
                },
                {
                    opcode: 'setPwmOutput',
                    text: formatMessage({
                        id: 'microbit.pins.setPwmOutput',
                        default: 'set pwm pin [PIN] out [OUT]',
                        description: 'microbit set pwm pin out'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PIN: {
                            type: ArgumentType.STRING,
                            menu: 'pins',
                            defaultValue: Pins.P0
                        },
                        OUT: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '1024'
                        }
                    }
                },
                '---',
                {
                    opcode: 'readDigitalPin',
                    text: formatMessage({
                        id: 'microbit.pins.readDigitalPin',
                        default: 'read digital pin [PIN]',
                        description: 'microbit read digital pin'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        PIN: {
                            type: ArgumentType.STRING,
                            menu: 'pins',
                            defaultValue: Pins.P0
                        }
                    }
                },
                {
                    opcode: 'readAnalogPin',
                    text: formatMessage({
                        id: 'microbit.pins.readAnalogPin',
                        default: 'read analog pin [PIN]',
                        description: 'microbit read analog pin'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        PIN: {
                            type: ArgumentType.STRING,
                            menu: 'analogPins',
                            defaultValue: Pins.P0
                        }
                    }
                },
                '---',
                {
                    opcode: 'pinTouched',
                    text: formatMessage({
                        id: 'microbit.pins.pinIsTouched',
                        default: 'pin [PIN] is touched',
                        description: 'microbit pin is touched'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        PIN: {
                            type: ArgumentType.STRING,
                            menu: 'touchPins',
                            defaultValue: Pins.P0
                        }
                    }
                }
                // '---',
                // {

                //     opcode: 'setServoOutput',
                //     text: formatMessage({
                //         id: 'microbit.pins.setServoOutput',
                //         default: 'set servo pin [PIN] out [OUT]',
                //         description: 'microbit set servo pin out'
                //     }),
                //     blockType: BlockType.COMMAND,
                //     arguments: {
                //         PIN: {
                //             type: ArgumentType.STRING,
                //             menu: 'pins',
                //             defaultValue: Pins.P0
                //         },
                //         OUT: {
                //             type: ArgumentType.ANGLE,
                //             defaultValue: '0'
                //         }
                //     }
                // }

            ],
            menus: {
                pins: {
                    items: this.PINS_MENU
                },
                level: {
                    acceptReporters: true,
                    items: this.LEVEL_MENU
                },
                analogPins: {
                    items: this.ANALOG_PINS_MENU
                },
                touchPins: {
                    items: this.TOUCH_PINS_MENU
                }
            }
        },
        {
            id: 'display',
            name: formatMessage({
                id: 'microbit.category.display',
                default: 'Display',
                description: 'The name of the microbit device display category'
            }),
            color1: '#9966FF',
            color2: '#774DCB',
            color3: '#774DCB',
            blocks: [
                {
                    opcode: 'showImage',
                    text: formatMessage({
                        id: 'microbit.display.showImage',
                        default: 'show image [VALUE]',
                        description: 'microbit show image'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        VALUE: {
                            type: ArgumentType.MATRIX,
                            defaultValue: '0101010101100010101000100'
                        }
                    }
                },
                {
                    opcode: 'showImageUntil',
                    text: formatMessage({
                        id: 'microbit.display.showImageUntil',
                        default: 'show image [VALUE] for [TIME] secs',
                        description: 'microbit show image for some times'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        VALUE: {
                            type: ArgumentType.MATRIX,
                            defaultValue: '0101010101100010101000100'
                        },
                        TIME: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '1'
                        }
                    }
                },
                {
                    opcode: 'show',
                    text: formatMessage({
                        id: 'microbit.display.show',
                        default: 'show [TEXT]',
                        description: 'microbit show'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'hello'
                        }
                    }
                },
                {
                    opcode: 'showUntilScrollDone',
                    text: formatMessage({
                        id: 'microbit.display.showUntilScrollDone',
                        default: 'show [TEXT] until scroll done',
                        description: 'microbit show until scroll done'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'hello'
                        }
                    }
                },
                '---',
                {
                    opcode: 'clearDisplay',
                    text: formatMessage({
                        id: 'microbit.display.clearDisplay',
                        default: 'clear screen',
                        description: 'microbit clear display'
                    }),
                    blockType: BlockType.COMMAND
                },
                '---',
                {
                    opcode: 'lightPixelAt',
                    text: formatMessage({
                        id: 'microbit.display.lightPixelAt',
                        default: 'light [STATE] at the x: [X] axis, y: [Y] axis',
                        description: 'microbit light pixel at'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        STATE: {
                            type: ArgumentType.STRING,
                            menu: 'ledState',
                            defaultValue: LedState.On
                        },
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        }
                    }
                },
                {
                    opcode: 'showOnPiexlbrightness',
                    text: formatMessage({
                        id: 'microbit.display.showOnPiexlbrightness',
                        default: 'show on the x: [X] axis, y: [Y] axis with brightness [BRT]',
                        description: 'microbit show on piexl brightness'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        X: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        },
                        Y: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        },
                        BRT: {
                            type: ArgumentType.STRING,
                            menu: 'ledBrightness',
                            defaultValue: '9'
                        }
                    }
                }
            ],
            menus: {
                ledState: {
                    items: this.LEDSTATE_MENU
                },
                ledBrightness: {
                    acceptReporters: true,
                    items: this.LEDBRT_MENU
                }
            }
        },
        {
            id: 'sensor',
            name: formatMessage({
                id: 'microbit.category.sensor',
                default: 'Sensor',
                description: 'The name of the microbit device sensor category'
            }),
            color1: '#4CBFE6',
            color2: '#2E8EB8',
            color3: '#2E8EB8',

            blocks: [
                {
                    opcode: 'buttonIsPressed',
                    text: formatMessage({
                        id: 'microbit.sensor.buttonIsPressed',
                        default: '[KEY] button is pressed?',
                        description: 'wether microbit button is pressed'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        KEY: {
                            type: ArgumentType.STRING,
                            menu: 'keys',
                            defaultValue: Key.A
                        }
                    }
                },
                '---',
                {
                    opcode: 'gestureIsX',
                    text: formatMessage({
                        id: 'microbit.sensor.gestureIsX',
                        default: 'gestrue is [STA]?',
                        description: 'microbit gestrue is XXX'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        STA: {
                            type: ArgumentType.STRING,
                            menu: 'gestrues',
                            defaultValue: Gestrue.Shake
                        }
                    }
                },
                {
                    opcode: 'axisAcceleration',
                    text: formatMessage({
                        id: 'microbit.sensor.axisAcceleration',
                        default: '[AXIS] axis acceleration',
                        description: 'microbit axis acceleration'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        AXIS: {
                            type: ArgumentType.STRING,
                            menu: 'axis',
                            defaultValue: Axis.X
                        }
                    }
                },
                '---',
                {
                    opcode: 'compassAngle',
                    text: formatMessage({
                        id: 'microbit.sensor.compassAngle',
                        default: 'compass angle',
                        description: 'microbit compass angle'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'compassMagneticDensity',
                    text: formatMessage({
                        id: 'microbit.sensor.compassMagneticDensity',
                        default: 'compass magnetic density',
                        description: 'microbit compass magnetic density'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'calibrateCompass',
                    text: formatMessage({
                        id: 'microbit.sensor.calibrateCompass',
                        default: 'calibrate compass',
                        description: 'microbit calibrate compass'
                    }),
                    blockType: BlockType.COMMAND
                },
                '---',
                {
                    opcode: 'lightLevel',
                    text: formatMessage({
                        id: 'microbit.sensor.lightLevel',
                        default: 'light level',
                        description: 'microbit light level'
                    }),
                    blockType: BlockType.REPORTER
                },
                '---',
                {
                    opcode: 'temperature',
                    text: formatMessage({
                        id: 'microbit.sensor.temperature',
                        default: 'temperature',
                        description: 'microbit temperature'
                    }),
                    blockType: BlockType.REPORTER
                },
                '---',
                {
                    opcode: 'runningTime',
                    text: formatMessage({
                        id: 'microbit.sensor.runningTime',
                        default: 'running time',
                        description: 'microbit running time'
                    }),
                    blockType: BlockType.REPORTER
                }
            ],
            menus: {
                keys: {
                    items: this.KEYS_MENU
                },
                gestrues: {
                    items: this.GESTRUES_MENU
                },
                axis: {
                    items: this.AXIS_MENU
                }
            }
        },
        {
            id: 'wireless',
            name: formatMessage({
                id: 'microbit.category.wireless',
                default: 'Wireless',
                description: 'The name of the microbit device wireless category'
            }),
            color1: '#D65CD6',
            color2: '#BD42BD',
            color3: '#BD42BD',

            blocks: [
                {
                    opcode: 'openWirelessCommunication',
                    text: formatMessage({
                        id: 'microbit.wireless.openWirelessCommunication',
                        default: 'open wireless communication',
                        description: 'microbit open wireless communication'
                    }),
                    blockType: BlockType.COMMAND
                },
                {
                    opcode: 'closeWirelessCommunication',
                    text: formatMessage({
                        id: 'microbit.wireless.closeWirelessCommunication',
                        default: 'close wireless communication',
                        description: 'microbit close wireless communication'
                    }),
                    blockType: BlockType.COMMAND
                },
                {
                    opcode: 'resetWirelessCommunication',
                    text: formatMessage({
                        id: 'microbit.wireless.resetWirelessCommunication',
                        default: 'reset wireless communication',
                        description: 'microbit reset wireless communication'
                    }),
                    blockType: BlockType.COMMAND
                },
                '---',
                {
                    opcode: 'sendWirelessMessage',
                    text: formatMessage({
                        id: 'microbit.wireless.sendWirelessMessage',
                        default: 'send wireless message [TEXT]',
                        description: 'microbit send wireless message'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'hello'
                        }
                    }
                },
                {
                    opcode: 'receiveWirelessMessage',
                    text: formatMessage({
                        id: 'microbit.wireless.receiveWirelessMessage',
                        default: 'receive wireless message',
                        description: 'microbit receive wireless message'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'setWirelessCommunicationChannel',
                    text: formatMessage({
                        id: 'microbit.wireless.setWirelessCommunicationChannel',
                        default: 'set wireless communication channel as [CH]',
                        description: 'microbit set wireless communication channel'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        CH: {
                            type: ArgumentType.STRING,
                            menu: 'channel',
                            defaultValue: '0'
                        }
                    }
                }
            ],
            menus: {
                channel: {
                    items: this.CHANNEL_MENU
                }
            }
        },
        {
            id: 'console',
            name: formatMessage({
                id: 'microbit.category.console',
                default: 'Console',
                description: 'The name of the microbit device console category'
            }),
            color1: '#FF3399',
            color2: '#FF3399',
            color3: '#FF3399',

            blocks: [
                {
                    opcode: 'consolePrint',
                    text: formatMessage({
                        id: 'microbit.console.consolePrint',
                        default: 'print [TEXT]',
                        description: 'microbit console print'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        TEXT: {
                            type: ArgumentType.STRING,
                            defaultValue: 'hello'
                        }
                    }
                }
            ],
            menus: { }
        }
        ];
    }
}

module.exports = OpenBlockMicrobitDevice;
