// Core, Team, and Official extensions can `require` VM code:
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');
const Serialport = require('../../io/serialport');
const Base64Util = require('../../util/base64-util');

// ...or VM dependencies:
const formatMessage = require('format-message');

/* A list of USB device filters. If include '*' means disable the filter */
const PNPID_LIST = [
    'USB\\VID_1A86&PID_7523'
    // '*'
];

/* Configuration of serialport */
const CONFIG = {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1
};

/**
 * A string to report to the BLE socket when the micro:bit has stopped receiving data.
 * @type {string}
 */
const SerialportDataStoppedError = 'Arduino UNO extension stopped receiving data';

/**
 * A time interval to wait (in milliseconds) before reporting to the serialport socket
 * that data has stopped coming from the peripheral.
 */
const SerialportTimeout = 4500;

// Core, Team, and Official extension classes should be registered statically with the Extension Manager.
// See: scratch-vm/src/extension-support/extension-manager.js
class Arduino {

    /**
     * Construct a MicroBit communication object.
     * @param {Runtime} runtime - the Scratch 3.0 runtime
     * @param {string} extensionId - the id of the extension
     */
    constructor (runtime, extensionId) {
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
        this._runtime.registerPeripheralExtension(extensionId, this);

        /**
         * The id of the extension this peripheral belongs to.
         */
        this._extensionId = extensionId;

        /**
         * Interval ID for data reading timeout.
         * @type {number}
         * @private
         */
        this._timeoutID = null;

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

        this.reset = this.reset.bind(this);
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
        this._serialport = new Serialport(this._runtime, this._extensionId, {
            filters: {
                pnpid: PNPID_LIST,
            }
        }, this._onConnect, this.reset);
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
     * Disconnect from the micro:bit.
     */
    disconnect () {
        if (this._serialport) {
            this._serialport.disconnect();
        }
        // this.reset();
    }

    /**
     * Reset all the state and timeout/interval ids.
     */
    reset () {
        // if (this._timeoutID) {
        //     window.clearTimeout(this._timeoutID);
        //     this._timeoutID = null;
        // }
    }

    /**
     * Return true if connected to the micro:bit.
     * @return {boolean} - whether the micro:bit is connected.
     */
    isConnected () {
        let connected = false;
        if (this._serialport) {
            connected = this._serialport.isConnected();
        }
        return connected;
    }

    /**
     * Send a message to the peripheral BLE socket.
     * @param {number} command - the BLE command hex.
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
 * Scratch 3.0 blocks to interact with a Arduino peripheral.
 */
class Scratch3Arduinolocks {

    /**
     * @return {string} - the name of this extension.
     */
    static get EXTENSION_NAME () {
        return 'Arduino UNO';
    }

    /**
     * @return {string} - the ID of this extension.
     */
    static get EXTENSION_ID () {
        return 'arduinouno';
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

        // Create a new Arduino peripheral instance
        this._peripheral = new Arduino(this.runtime, Scratch3Arduinolocks.EXTENSION_ID);
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: Scratch3Arduinolocks.EXTENSION_ID,
            name: Scratch3Arduinolocks.EXTENSION_NAME,

            // 可选: block图标的URI，在图形块左侧显示
            // blockIconURI: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAAAAACyOJm3AAAAFklEQVQYV2P4DwMMEMgAI/+DEUIMBgAEWB7i7uidhAAAAABJRU5ErkJggg==',

            // 可选: block目录的的URI，在目录中显示，如果没有声明则使用blockIconURI的参数 URI for an icon to be displayed in the blocks category menu.
            // 如果blockIconURI也没有声明则使用默认的圆形
            // menuIconURI: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAAAAACyOJm3AAAAFklEQVQYV2P4DwMMEMgAI/+DEUIMBgAEWB7i7uidhAAAAABJRU5ErkJggg==',

            // 显示连接按钮的属性
            showStatusButton: true,

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
                    }
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
                    text: formatMessage({
                        id: 'microbit.clearDisplay',
                        default: 'clear display',
                        description: 'display nothing on the micro:bit display'
                    }),
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
        };
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
        const text = 'Hello';

        const output = new Uint8Array(text.length);

        for (let i = 0; i < text.length; i++) {
            output[i] = text.charCodeAt(i);
        }
        this._peripheral.send(0x11, output);
        console.log('send');
    }
}

module.exports = Scratch3Arduinolocks;
