const formatMessage = require('format-message');
const Buffer = require('buffer').Buffer;

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const ProgramModeType = require('../../extension-support/program-mode-type');
const Serialport = require('../../io/serialport');
const Base64Util = require('../../util/base64-util');

/**
* The list of USB device filters.
* @readonly
*/
const PNPID_LIST = [
    '*'
];

/**
* Configuration of serialport
* @readonly
*/
const CONFIG = {
    baudRate: 57600,
    dataBits: 8,
    stopBits: 1
};

const Pins = {
    D0: '0',
    D1: '1'
};

const Mode = {
    Input: 'INPUT',
    Output: 'OUTPUT'
};

/**
 * Manage communication with a Arduino Uno peripheral over a Scrath Link client socket.
 */
class Microbit{

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

        /**
        * Pending data list. If busy is set when send, the data will push into this array to
        * waitting to be sended.
        */
        this._pendingData = [];

        this.reset = this.reset.bind(this);
        this._onConnect = this._onConnect.bind(this);
        this._onMessage = this._onMessage.bind(this);

        /**
         * Firmata connection.
         * @type {?Firmata}
         * @private
         */
        this._firmata = null;

        /**
         * Timeout ID for firmata get hartbeat timeout.
         * @type {number}
         * @private
         */
        this._firmataTimeoutID = null;

        /**
         * Interval ID for firmata send hartbeat.
         * @type {number}
         * @private
         */
        this._firmataIntervelID = null;

        /**
         * A flag that is true while firmata is conncted.
         * @type {boolean}
         * @private
         */
        this._isFirmataConnected = false;

        /**
         * A flag that is true while hartbeat event listener is created.
         * @type {boolean}
         * @private
         */
        this._eventListener = false;

        this._startHartbeat = this._startHartbeat.bind(this);
        this._stopHartbeat = this._startHartbeat.bind(this);
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
        this._stopHartbeat();
        this._serialport.uploadFirmware(DIVECE_OPT);
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
                pnpid: PNPID_LIST
            }
        }, this._onConnect, this.reset);
    }

    /**
     * Called by the runtime when user wants to connect to a certain peripheral.
     * @param {number} id - the id of the peripheral to connect to.
     */
    connect (id) {
        if (this._serialport) {
            this._serialport.connectPeripheral(id, {config: CONFIG});
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
        if (this._firmataTimeoutID) {
            window.clearTimeout(this._firmataTimeoutID);
            this._firmataTimeoutID = null;
        }
        if (this._firmataIntervelID) {
            window.clearInterval(this._firmataIntervelID);
            this._firmataIntervelID = null;
        }
        this._isFirmataConnected = false;
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
     * @param {Uint8Array} message - the message to write
     */
    send (message) {
        if (!this.isConnected()) return;

        // If busy push this data to _pendingData.
        if (this._busy) {
            this._pendingData.push(message.toString());
            return;
        }

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

        const data = Base64Util.uint8ArrayToBase64(message);

        this._serialport.write(data, 'base64').then(() => {
            this._busy = false;

            // If _pendingData is not empty call this func to send _pendingData.
            if (this._pendingData.length !== 0) {
                this.send(this._pendingData.shift().split(','));
                window.clearTimeout(this._busyTimeoutID);
            }
        });
    }

    /**
     * Start send/recive hartbeat timer.
     * @private
     */
    _startHartbeat () {
        this._firmataIntervelID = window.setInterval(
            () => {
                if (this._runtime.getCurrentIsRealtimeMode()) {
                    // Send reportVersion request as hartbeat.
                    this._firmata.reportVersion(() => { });
                }
            }, FrimataHartbeatInterval);
        this._firmataTimeoutID = window.setTimeout(() => {
            this._isFirmataConnected = false;
            if (this._runtime.getCurrentIsRealtimeMode()) {
                this._serialport.handleRealtimeDisconnectError(ConnectFirmataTimeout);
            }
        }, FrimataHartbeatTimeout);
    }

    /**
     * Stop send/recive hartbeat timer.
     * @private
     */
    _stopHartbeat () {
        window.clearInterval(this._firmataIntervelID);
        this._firmataIntervelID = null;
        window.clearInterval(this._firmataTimeoutID);
        this._firmataTimeoutID = null;
    }

    /**
     * Starts reading data from peripheral after serialport has connected to it.
     * @private
     */
    _onConnect () {
        this._serialport.read(this._onMessage);
        this._firmata = new Firmata(this.send.bind(this));

        if (this._runtime.getCurrentIsRealtimeMode()) {
            this._startHartbeat();
        }

        if (!this._eventListener) {
            this._eventListener = true;
            this._runtime.on(this._runtime.constructor.PROGRAM_MODE_UPDATE, data => {
                if (data.isRealtimeMode) {
                    this._startHartbeat();
                    this._isFirmataConnected = false;
                } else {
                    this._stopHartbeat();
                }
            });

            // If time out means failed to connect firmata.
            this._firmata.on('reportversion', () => {
                if (!this._isFirmataConnected) {
                    this._isFirmataConnected = true;
                    if (this._runtime.getCurrentIsRealtimeMode()) {
                        this._serialport.handleRealtimeConnectSucess(ConnectFirmataSuccess);
                    }
                }

                window.clearTimeout(this._firmataTimeoutID);
                this._firmataTimeoutID = window.setTimeout(() => {
                    this._isFirmataConnected = false;
                    if (this._runtime.getCurrentIsRealtimeMode()) {
                        this._serialport.handleRealtimeDisconnectError(ConnectFirmataTimeout);
                    }
                }, FrimataHartbeatTimeout);
            });

        }
    }

    /**
     * Process the sensor data from the incoming serialport characteristic.
     * @param {object} base64 - the incoming serialport data.
     * @private
     */
    _onMessage (base64) {
        // parse data
        const data = Base64Util.base64ToUint8Array(base64);
        this._firmata.onReciveData(data);
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

    /**
     * @param {PIN} pin - the pin to set.
     * @param {MODE} mode - the pin mode to set.
     * @return {Promise} - a Promise that resolves when writing to peripheral.
     */
    setPinMode (pin, mode) {
        pin = this.parsePin(pin);
        switch (mode) {
        case Mode.Input:
            mode = this._firmata.MODES.INPUT;
            break;
        case Mode.Output:
            mode = this._firmata.MODES.OUTPUT;
            break;
        case Mode.InputPullup:
            mode = this._firmata.MODES.PULLUP;
            break;
        }
        return this._firmata.pinMode(pin, mode);
    }
}

/**
 * Scratch 3.0 blocks to interact with a Arduino Uno peripheral.
 */
class Scratch3MicrobitDevice {
    /**
     * @return {string} - the ID of this extension.
     */
    static get DEVICE_ID () {
        return 'microbit';
    }

    get PINS_MENU () {
        return [
            {
                text: '0',
                value: Pins.D0
            },
            {
                text: '1',
                value: Pins.D1
            }
        ];
    }

    get MODE_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'arduinoUno.modeMenu.input',
                    default: 'Input',
                    description: 'label for input pin mode'
                }),
                value: Mode.Input
            },
            {
                text: formatMessage({
                    id: 'arduinoUno.modeMenu.output',
                    default: 'Output',
                    description: 'label for output pin mode'
                }),
                value: Mode.Output
            }
        ];
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
        this._peripheral = new Microbit(this.runtime, Scratch3MicrobitDevice.DEVICE_ID);
    }

    /**
     * @returns {Array.<object>} metadata for this extension and its blocks.
     */
    getInfo () {
        return [{
            id: 'display',
            name: formatMessage({
                id: 'microbit.category.pins',
                default: 'Display',
                description: 'The name of the microbit device display category'
            }),
            color1: '#CF63CF',
            color2: '#C94FC9',
            color3: '#BD42BD',
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
                    opcode: 'showNumber',
                    text: formatMessage({
                        id: 'microbit.display.showNumber',
                        default: 'show number [NUM]',
                        description: 'microbit show number'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        NUM: {
                            type: ArgumentType.NUMBER,
                            defaultValue: '0'
                        }
                    }
                },
                {
                    opcode: 'showString',
                    text: formatMessage({
                        id: 'microbit.display.showString',
                        default: 'show string [TEXT]',
                        description: 'microbit show string'
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
                    opcode: 'clearScreen',
                    text: formatMessage({
                        id: 'microbit.display.clearScreen',
                        default: 'clear screen',
                        description: 'microbit clear screen'
                    }),
                    blockType: BlockType.COMMAND
                }
            ],
            menus: {
            }
        },
        {
            id: 'pin',
            name: formatMessage({
                id: 'arduinoUno.category.pins',
                default: 'Pins',
                description: 'The name of the arduino uno device pin category'
            }),
            color1: '#4C97FF',
            color2: '#3373CC',
            color3: '#3373CC',

            blocks: [
                {
                    opcode: 'setPinMode',
                    text: formatMessage({
                        id: 'arduinoUno.pins.setPinMode',
                        default: 'set pin [PIN] mode [MODE]',
                        description: 'arduinoUno set pin mode'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PIN: {
                            type: ArgumentType.STRING,
                            menu: 'pins',
                            defaultValue: Pins.D0
                        },
                        MODE: {
                            type: ArgumentType.STRING,
                            menu: 'mode',
                            defaultValue: Mode.Input
                        }
                    }
                }
            ],
            menus: {
                pins: {
                    items: this.PINS_MENU
                },
                mode: {
                    items: this.MODE_MENU
                }
            }
        }
        ];
    }

    /**
     * Set pin mode.
     * @param {object} args - the block's arguments.
     * @return {Promise} - a Promise that resolves after the set pin mode is done.
     */
    // setPinMode (args) {
    //     this._peripheral.setPinMode(args.PIN, args.MODE);
    //     return new Promise(resolve => {
    //         setTimeout(() => {
    //             resolve();
    //         }, SerialportSendInterval);
    //     });
    // }
}

module.exports = Scratch3MicrobitDevice;
