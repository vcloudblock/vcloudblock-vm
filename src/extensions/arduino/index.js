// Core, Team, and Official extensions can `require` VM code:
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');

// ...or VM dependencies:
const formatMessage = require('format-message');

// Core, Team, and Official extension classes should be registered statically with the Extension Manager.
// See: scratch-vm/src/extension-support/extension-manager.js
class arduino {
    constructor (runtime) {
        /**
         * Store this for later communication with the Scratch VM runtime.
         * If this extension is running in a sandbox then `runtime` is an async proxy object.
         * @type {Runtime}
         */
        this.runtime = runtime;
    }

    /**
     * @return {object} This extension's metadata.
     */
    getInfo () {
        return {
            // Required: the machine-readable name of this extension.
            // Will be used as the extension's namespace.
            id: 'arduinouno',

            // Core extensions only: override the default extension block colors.
            color1: '#FF0099',
            color2: '#DB6E00',

            // 显示在Scratch上的名称
            name: "Arduino UNO",

            // 可选: block图标的URI，在图形块左侧显示
            // blockIconURI: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAAAAACyOJm3AAAAFklEQVQYV2P4DwMMEMgAI/+DEUIMBgAEWB7i7uidhAAAAABJRU5ErkJggg==',

            // 可选: block目录的的URI，在目录中显示，如果没有声明则使用blockIconURI的参数 URI for an icon to be displayed in the blocks category menu.
            // 如果blockIconURI也没有声明则使用默认的圆形
            // menuIconURI: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAAAAACyOJm3AAAAFklEQVQYV2P4DwMMEMgAI/+DEUIMBgAEWB7i7uidhAAAAABJRU5ErkJggg==',

            // 可选: Link to documentation content for this extension.
            // If not present, offer no link.
            docsURI: 'https://....',

            // Required: the list of blocks implemented by this extension,
            // in the order intended for display.
            blocks: [
                {
                    opcode: 'whenButtonPressed',
                    text: formatMessage({
                        id: 'arduinouno.whenButtonPressed',
                        default: 'when [BTN] button pressed',
                        description: 'when the selected button on the micro:bit is pressed'
                    }),
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
                }
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
    };

    /**
     * Implement myReporter.
     * @param {object} args - the block's arguments.
     * @property {string} MY_ARG - the string value of the argument.
     * @returns {string} a string which includes the block argument value.
     */
    whenButtonPressed(args) {
        // console.log(args);
        // util.ioQuery('serial', 'sendMsg', cmd);
        return "as"
    };

    arduino_pin_mode(args) {
        console.log(args);
        return "test"
    }
}

module.exports = arduino;
