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
    //https://github.com/arduino/Arduino/blob/1.8.0/hardware/arduino/avr/boards.txt#L51-L58
    'USB\\VID_2341&PID_0043',
    'USB\\VID_2341&PID_0001',
    'USB\\VID_2A03&PID_0043',
    'USB\\VID_2341&PID_0243',
    // For chinese clones that use CH340
    'USB\\VID_1A86&PID_7523'
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
 * A string to report to the serilport socket when the arduino uno has stopped receiving data.
 * @type {string}
 */
const SerialportDataStoppedError = 'Arduino UNO extension stopped receiving data';

/**
 * A time interval to wait (in milliseconds) before reporting to the serialport socket
 * that data has stopped coming from the peripheral.
 */
const SerialportTimeout = 4500;

/**
 * Manage communication with a Arduino Uno peripheral over a Scrath Link client socket.
 */
class ArduinoUno {

    /**
     * Construct a Arduino communication object.
     * @param {Runtime} runtime - the Scratch 3.0 runtime
     * @param {string} deviceId - the id of the extension
     */
    constructor (runtime, deviceId) {

        /**
         * The Scratch 3.0 runtime used to trigger the green flag button.
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

        this._onConnect = this._onConnect.bind(this);
        this._onMessage = this._onMessage.bind(this);
    }

    /**
     * Called by the runtime when user wants to upload code to a peripheral.
     */
    upload(code) {
        var base64Str = Buffer.from(code).toString('base64');
        this._serialport.upload(base64Str, 'base64');
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
        }, this._onConnect);
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

    /**
     * Send a message to the peripheral Serialport socket.
     * @param {number} command - the Serialport command hex.
     * @param {Uint8Array} message - the message to write
     */
    send (command, message) {
        if (!this.isConnected()) return;
        if (this._busy) return;

        // Set a busy flag so that while we are sending a message and waiting for
        // the response, additional messages are ignored.
        this._busy = true;

        // Set a timeout after which to reset the busy flag. This is used in case
        // a BLE message was sent for which we never received a response, because
        // e.g. the peripheral was turned off after the message was sent. We reset
        // the busy flag after a while so that it is possible to try again later.
        this._busyTimeoutID = window.setTimeout(() => {
            this._busy = false;
        }, 5000);

        const output = new Uint8Array(message.length + 1);
        output[0] = command; // attach command to beginning of message
        for (let i = 0; i < message.length; i++) {
            output[i + 1] = message[i];
        }
        const data = Base64Util.uint8ArrayToBase64(output);

        this._serialport.write(data, 'base64').then(
            () => {
                this._busy = false;
                window.clearTimeout(this._busyTimeoutID);
            }
        );
    }

    /**
     * Starts reading data from peripheral after BLE has connected to it.
     * @private
     */
    _onConnect () {
        this._serialport.read(this._onMessage);
        // this._timeoutID = window.setTimeout(
        //     () => this._ble.handleDisconnectError(SerialportDataStoppedError),
        //     SerialportTimeout
        // );
    }

    /**
     * Process the sensor data from the incoming BLE characteristic.
     * @param {object} data - the incoming BLE data.
     * @private
     */
    _onMessage(base64) {
        // parse data
        const data = Base64Util.base64ToUint8Array(base64);
        console.log(data);

        // this._sensors.tiltX = data[1] | (data[0] << 8);
        // if (this._sensors.tiltX > (1 << 15)) this._sensors.tiltX -= (1 << 16);
        // this._sensors.tiltY = data[3] | (data[2] << 8);
        // if (this._sensors.tiltY > (1 << 15)) this._sensors.tiltY -= (1 << 16);

        // this._sensors.buttonA = data[4];
        // this._sensors.buttonB = data[5];

        // this._sensors.touchPins[0] = data[6];
        // this._sensors.touchPins[1] = data[7];
        // this._sensors.touchPins[2] = data[8];

        // this._sensors.gestureState = data[9];

        // cancel disconnect timeout and start a new one

        window.clearTimeout(this._timeoutID);
        // this._timeoutID = window.setTimeout(
        //     () => this._serialport.handleDisconnectError(SerialportDataStoppedError),
        //     SerialportTimeout
        // );
    }
}

/**
 * Scratch 3.0 blocks to interact with a Arduino Uno peripheral.
 */
class Scratch3ArduinoUnoDevice {
    /**
     * @return {string} - the ID of this extension.
     */
    static get DEVICE_ID () {
        return 'arduinoUno';
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
        this._peripheral = new ArduinoUno(this.runtime, Scratch3ArduinoUnoDevice.DEVICE_ID);
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
                    description: 'The name of the arduino uno device pin category',
                    id: 'arduinouno.category.Pins',
                }),
                color1: '#4C97FF',
                color2: '#3373CC',
                color3: '#3373CC',

                blocks: [
                    {
                        opcode: 'whenButtonPressed',
                        text: 'when [BTN] button pressed',
                        blockType: BlockType.HAT,
                        arguments: {
                            BTN: {
                                type: ArgumentType.STRING,
                                menu: 'buttons',
                                defaultValue: "A"
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
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
                        blockType: BlockType.COMMAND,
                        programMode: [ProgramModeType.REALTIME, ProgramModeType.UPLOAD]
                    },
                ],
                menus: {
                    buttons: {
                        items: [{
                            text: 'A',
                            value: "A"
                        },
                        {
                            text: 'B',
                            value: "B"
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
                id: 'serial',
                name: formatMessage({
                    default: 'Serial',
                    description: 'The name of the arduino uno device serial category',
                    id: 'arduinouno.category.Serial',
                }),
                color1: '#9966FF',
                color2: '#774DCB',
                color3: '#774DCB',
                blocks: [
                    {
                        opcode: 'motorWrite',
                        text: 'set MOTOR direction speed as [SPEED]',
                        blockType: BlockType.COMMAND,
                        arguments: {
                            SPEED: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 255
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
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
                        }
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
        return true;
    };

    arduino_pin_mode(args) {
        console.log(args);
        return "test";
    }

    motorWrite() {
        console.log('arduinoUno: motorWrite');
    }

    displayClear() {
        console.log('arduinoUno: displayClear');
    }
}

module.exports = Scratch3ArduinoUnoDevice;
