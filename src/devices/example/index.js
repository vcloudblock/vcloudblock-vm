// Deive is just a special peripheral extension

// Core, Team, and Official extensions can `require` VM code:
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const ProgramModeType = require('../../extension-support/program-mode-type');
const Serialport = require('../../io/serialport');
const Base64Util = require('../../util/base64-util');

// ...or VM dependencies:
const formatMessage = require('format-message');

/* A list of USB device filters. If include '*' means disable the filter */
const PNPID_LIST = [
    //https://github.com/arduino/Arduino/blob/1.8.0/hardware/arduino/avr/boards.txt#L51-L58
    'USB\\VID_2341&PID_0043',
    'USB\\VID_2341&PID_0001',
    'USB\\VID_2A03&PID_0043',
    'USB\\VID_2341&PID_0243',
    // For chinese clones that use CH340
    'USB\\VID_1A86&PID_7523'
    // Uncomment this to close filter
    // '*'
];

/* Configuration of serialport */
const CONFIG = {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1
};

/**
 * Manage communication with this device over a Scrath Link client socket.
 */
class SomeDevice {
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

        /**
         * Register this device as a PeripheralExtension.
         * Tell the runtime this extension need harware/software connection.
         */
        this._runtime.registerPeripheralExtension(extensionId, this);

        /**
         * The id of the extension this peripheral belongs to.
         */
        this._extensionId = extensionId;
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
}

/**
 * Scratch 3.0 blocks to interact with the device.
 */
class Scratch3SomeDevice {
    /**
     * @return {string} - the ID of this extension.
     */
    static get DEVICE_ID () {
        return 'someDevice';
    }

    /**
     * Construct a set of SomeDevice blocks.
     * @param {Runtime} runtime - the Scratch 3.0 runtime.
     */
    constructor (runtime) {
        /**
         * The Scratch 3.0 runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // Create a new SomeDevice peripheral instance
        this._peripheral = new SomeDevice(this.runtime, Scratch3SomeDevice.DEVICE_ID);
    }

    /**
     * @returns {Array.<object>} metadata for this device and its blocks.
     */
    getInfo () {
        return [
            {
                // Required: the machine-readable name of this category.
                id: 'category1',

                // Required: the human-readable name of this category as string.
                name: formatMessage({
                    default: 'Category1',
                    description: 'XXXX',
                    id: 'someDevice.category.category1',
                }),

                // Override the default category block colors.
                color1: '#4C97FF',
                color2: '#3373CC',
                color3: '#3373CC',

                // Optional: URI for a block icon, to display at the edge of each block for this
                // category. Data URI OK.
                blockIconURI: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAAAAACyOJm3AAAAFklEQVQYV2P4DwMMEMgAI/+DEUIMBgAEWB7i7uidhAAAAABJRU5ErkJggg==',

                // Optional: URI for an icon to be displayed in the blocks category menu.
                // If not present, the menu will display the block icon, if one is present.
                // Otherwise, the category menu shows its default filled circle.
                // Data URI OK.
                menuIconURI: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAAAAACyOJm3AAAAFklEQVQYV2P4DwMMEMgAI/+DEUIMBgAEWB7i7uidhAAAAABJRU5ErkJggg==',

                // Required: the list of blocks implemented by this category,
                // in the order intended for display.
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
                id: 'category2',
                name: formatMessage({
                    default: 'Category2',
                    description: 'XXXX',
                    id: 'someDevice.category.category2',
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
            // ...more categories
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
        console.log('motorWrite');
    }

    displayClear() {
        console.log('displayClear');
    }
}

module.exports = Scratch3SomeDevice;
