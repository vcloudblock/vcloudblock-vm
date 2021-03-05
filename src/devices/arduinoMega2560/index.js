const formatMessage = require('format-message');
const Buffer = require('buffer').Buffer;

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const ProgramModeType = require('../../extension-support/program-mode-type');
const Serialport = require('../../io/serialport');
const Base64Util = require('../../util/base64-util');

const Firmata = require('../../lib/firmata/firmata');

/**
 * The list of USB device filters.
 * @readonly
 */
const PNPID_LIST = [
    // https://github.com/arduino/Arduino/blob/1.8.0/hardware/arduino/avr/boards.txt#L175-L186
    'USB\\VID_2341&PID_0010',
    'USB\\VID_2341&PID_0042',
    'USB\\VID_2A03&PID_0010',
    'USB\\VID_2A03&PID_0042',
    'USB\\VID_2341&PID_0210',
    'USB\\VID_2341&PID_0242',
    // For chinese clones that use CH340
    'USB\\VID_1A86&PID_7523'
];

/**
 * Configuration of serialport
 * @readonly
 */
const SERIAL_CONFIG = {
    baudRate: 57600,
    dataBits: 8,
    stopBits: 1
};

/**
 * Configuration of build and flash. Used by arduino_debug and avrdude.
 * @readonly
 */
const DIVECE_OPT = {
    type: 'arduino',
    fqbn: 'arduino:avr:mega:cpu=atmega2560',
    partno: 'atmega2560',
    programmerId: 'wiring',
    baudrate: '115200'
};

/**
 * A string to report connect firmata timeout.
 * @type {formatMessage}
 */
const ConnectFirmataTimeout = formatMessage({
    id: 'arduinoMega2560.connection.connectFirmataTimeout',
    default: 'Timeout when try to connect firmata, please download the firmware first',
    description: 'label for connect firmata timeout'
});

/**
 * A string to report connect firmata success.
 * @type {formatMessage}
 */
const ConnectFirmataSuccess = formatMessage({
    id: 'arduinoMega2560.connection.connectFirmataSuccess',
    default: 'Success to connect firmata',
    description: 'label for connect firmata success'
});

/**
 * A time interval to wait (in milliseconds) while a block that sends a serialport message is running.
 * @type {number}
 */
const SerialportSendInterval = 5;

/**
 * A time interval to send firmata hartbeat(in milliseconds).
 */
const FrimataHartbeatInterval = 2000;

/**
 * A time interval to wait (in milliseconds) before reporting to the serialport socket
 * that heartbeat has stopped coming from the peripheral.
 */
const FrimataHartbeatTimeout = 5000;

const Pins = {
    D0: '0',
    D1: '1',
    D2: '2',
    D3: '3',
    D4: '4',
    D5: '5',
    D6: '6',
    D7: '7',
    D8: '8',
    D9: '9',
    D10: '10',
    D11: '11',
    D12: '12',
    D13: '13',
    D14: '14',
    D15: '15',
    D16: '16',
    D17: '17',
    D18: '18',
    D19: '19',
    D20: '20',
    D21: '21',
    D22: '22',
    D23: '23',
    D24: '24',
    D25: '25',
    D26: '26',
    D27: '27',
    D28: '28',
    D29: '29',
    D30: '30',
    D31: '31',
    D32: '32',
    D33: '33',
    D34: '34',
    D35: '35',
    D36: '36',
    D37: '37',
    D38: '38',
    D39: '39',
    D40: '40',
    D41: '41',
    D42: '42',
    D43: '43',
    D44: '44',
    D45: '45',
    D46: '46',
    D47: '47',
    D48: '48',
    D49: '49',
    D50: '50',
    D51: '51',
    D52: '52',
    D53: '53',
    A0: 'A0',
    A1: 'A1',
    A2: 'A2',
    A3: 'A3',
    A4: 'A4',
    A5: 'A5',
    A6: 'A6',
    A7: 'A7',
    A8: 'A8',
    A9: 'A9',
    A10: 'A10',
    A11: 'A11',
    A12: 'A12',
    A13: 'A13',
    A14: 'A14',
    A15: 'A15'
};


const Level = {
    High: '1',
    Low: '0'
};

const Buadrate = {
    B4800: '4800',
    B9600: '9600',
    B19200: '19200',
    B38400: '38400',
    B57600: '57600',
    B115200: '115200'
};

const SerialNo = {
    Serial0: '0',
    Serial1: '1',
    Serial2: '2',
    Serial3: '3'
};

const Mode = {
    Input: 'INPUT',
    Output: 'OUTPUT',
    InputPullup: 'INPUT_PULLUP'
};

const InterrupMode = {
    Rising: 'RISING',
    Falling: 'FALLING',
    Change: 'CHANGE',
    Low: 'LOW'
};

const DataType = {
    WholeNumber: 'WHOLE_NUMBER',
    Decimal: 'DECIMAL',
    String: 'STRING'
};

/**
 * Manage communication with a Arduino Mega2560 peripheral over a OpenBlock Link client socket.
 */
class ArduinoMega2560{

    /**
     * Construct a Arduino communication object.
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
            this._serialport.connectPeripheral(id, {config: SERIAL_CONFIG});
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
        // a message was sent for which we never received a response, because
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

    /**
     * @param {PIN} pin - the pin to set.
     * @param {LEVEL} level - the pin level to set.
     * @return {Promise} - a Promise that resolves when writing to peripheral.
     */
    setDigitalOutput (pin, level) {
        pin = this.parsePin(pin);
        level = parseInt(level, 10);
        return this._firmata.digitalWrite(pin, level);
    }

    /**
     * @param {PIN} pin - the pin to set.
     * @param {VALUE} value - the pwm value to set.
     * @return {Promise} - a Promise that resolves when writing to peripheral.
     */
    setPwmOutput (pin, value) {
        pin = this.parsePin(pin);
        if (value < 0) {
            value = 0;
        }
        if (value > 255) {
            value = 255;
        }
        this._firmata.pinMode(pin, this._firmata.MODES.PWM);
        return this._firmata.pwmWrite(pin, value);
    }

    /**
     * @param {PIN} pin - the pin to read.
     * @return {Promise} - a Promise that resolves when read from peripheral.
     */
    readDigitalPin (pin) {
        pin = this.parsePin(pin);
        return new Promise(resolve => {
            this._firmata.digitalRead(pin, value => {
                resolve(value);
            });
        });
    }

    /**
     * @param {PIN} pin - the pin to read.
     * @return {Promise} - a Promise that resolves when read from peripheral.
     */
    readAnalogPin (pin) {
        pin = this.parsePin(pin);
        // Shifting to analog pin number.
        pin = pin - 14;
        this._firmata.pinMode(pin, this._firmata.MODES.ANALOG);
        return new Promise(resolve => {
            this._firmata.analogRead(pin, value => {
                resolve(value);
            });
        });
    }
}

/**
 * OpenBlock blocks to interact with a Arduino Mega2560 peripheral.
 */
class OpenBlockArduinoMega2560Device {
    /**
     * @return {string} - the ID of this extension.
     */
    static get DEVICE_ID () {
        return 'arduinoMega2560';
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
            },
            {
                text: '2',
                value: Pins.D2
            },
            {
                text: '3',
                value: Pins.D3
            },
            {
                text: '4',
                value: Pins.D4
            },
            {
                text: '5',
                value: Pins.D5
            },
            {
                text: '6',
                value: Pins.D6
            },
            {
                text: '7',
                value: Pins.D7
            },
            {
                text: '8',
                value: Pins.D8
            },
            {
                text: '9',
                value: Pins.D9
            },
            {
                text: '10',
                value: Pins.D10
            },
            {
                text: '11',
                value: Pins.D11
            },
            {
                text: '12',
                value: Pins.D12
            },
            {
                text: '13',
                value: Pins.D13
            },
            {
                text: '14',
                value: Pins.D14
            },
            {
                text: '15',
                value: Pins.D15
            },
            {
                text: '16',
                value: Pins.D16
            },
            {
                text: '17',
                value: Pins.D17
            },
            {
                text: '18',
                value: Pins.D18
            },
            {
                text: '19',
                value: Pins.D19
            },
            {
                text: '20',
                value: Pins.D20
            },
            {
                text: '21',
                value: Pins.D21
            },
            {
                text: '22',
                value: Pins.D22
            },
            {
                text: '23',
                value: Pins.D23
            },
            {
                text: '24',
                value: Pins.D24
            },
            {
                text: '25',
                value: Pins.D25
            },
            {
                text: '26',
                value: Pins.D26
            },
            {
                text: '27',
                value: Pins.D27
            },
            {
                text: '28',
                value: Pins.D28
            },
            {
                text: '29',
                value: Pins.D29
            },
            {
                text: '30',
                value: Pins.D30
            },
            {
                text: '31',
                value: Pins.D31
            },
            {
                text: '32',
                value: Pins.D32
            },
            {
                text: '33',
                value: Pins.D33
            },
            {
                text: '34',
                value: Pins.D34
            },
            {
                text: '35',
                value: Pins.D35
            },
            {
                text: '36',
                value: Pins.D36
            },
            {
                text: '37',
                value: Pins.D37
            },
            {
                text: '38',
                value: Pins.D38
            },
            {
                text: '39',
                value: Pins.D39
            },
            {
                text: '40',
                value: Pins.D40
            },
            {
                text: '41',
                value: Pins.D41
            },
            {
                text: '42',
                value: Pins.D42
            },
            {
                text: '43',
                value: Pins.D43
            },
            {
                text: '44',
                value: Pins.D44
            },
            {
                text: '45',
                value: Pins.D45
            },
            {
                text: '46',
                value: Pins.D46
            },
            {
                text: '47',
                value: Pins.D47
            },
            {
                text: '48',
                value: Pins.D48
            },
            {
                text: '49',
                value: Pins.D49
            },
            {
                text: '50',
                value: Pins.D50
            },
            {
                text: '51',
                value: Pins.D51
            },
            {
                text: '52',
                value: Pins.D52
            },
            {
                text: '53',
                value: Pins.D53
            },
            {
                text: 'A0',
                value: Pins.A0
            },
            {
                text: 'A1',
                value: Pins.A1
            },
            {
                text: 'A2',
                value: Pins.A2
            },
            {
                text: 'A3',
                value: Pins.A3
            },
            {
                text: 'A4',
                value: Pins.A4
            },
            {
                text: 'A5',
                value: Pins.A5
            },
            {
                text: 'A6',
                value: Pins.A6
            },
            {
                text: 'A7',
                value: Pins.A7
            },
            {
                text: 'A8',
                value: Pins.A8
            },
            {
                text: 'A9',
                value: Pins.A9
            },
            {
                text: 'A10',
                value: Pins.A10
            },
            {
                text: 'A11',
                value: Pins.A11
            },
            {
                text: 'A12',
                value: Pins.A12
            },
            {
                text: 'A13',
                value: Pins.A13
            },
            {
                text: 'A14',
                value: Pins.A14
            },
            {
                text: 'A15',
                value: Pins.A15
            }
        ];
    }

    get MODE_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'arduinoMega2560.modeMenu.input',
                    default: 'Input',
                    description: 'label for input pin mode'
                }),
                value: Mode.Input
            },
            {
                text: formatMessage({
                    id: 'arduinoMega2560.modeMenu.output',
                    default: 'Output',
                    description: 'label for output pin mode'
                }),
                value: Mode.Output
            },
            {
                text: formatMessage({
                    id: 'arduinoMega2560.modeMenu.inputPullup',
                    default: 'Input-pullup',
                    description: 'label for input-pullup pin mode'
                }),
                value: Mode.InputPullup
            }
        ];
    }

    get DIGITAL_PINS_MENU () {
        return [
            {
                text: '0',
                value: Pins.D0
            },
            {
                text: '1',
                value: Pins.D1
            },
            {
                text: '2',
                value: Pins.D2
            },
            {
                text: '3',
                value: Pins.D3
            },
            {
                text: '4',
                value: Pins.D4
            },
            {
                text: '5',
                value: Pins.D5
            },
            {
                text: '6',
                value: Pins.D6
            },
            {
                text: '7',
                value: Pins.D7
            },
            {
                text: '8',
                value: Pins.D8
            },
            {
                text: '9',
                value: Pins.D9
            },
            {
                text: '10',
                value: Pins.D10
            },
            {
                text: '11',
                value: Pins.D11
            },
            {
                text: '12',
                value: Pins.D12
            },
            {
                text: '13',
                value: Pins.D13
            },
            {
                text: '14',
                value: Pins.D14
            },
            {
                text: '15',
                value: Pins.D15
            },
            {
                text: '16',
                value: Pins.D16
            },
            {
                text: '17',
                value: Pins.D17
            },
            {
                text: '18',
                value: Pins.D18
            },
            {
                text: '19',
                value: Pins.D19
            },
            {
                text: '20',
                value: Pins.D20
            },
            {
                text: '21',
                value: Pins.D21
            },
            {
                text: '22',
                value: Pins.D22
            },
            {
                text: '23',
                value: Pins.D23
            },
            {
                text: '24',
                value: Pins.D24
            },
            {
                text: '25',
                value: Pins.D25
            },
            {
                text: '26',
                value: Pins.D26
            },
            {
                text: '27',
                value: Pins.D27
            },
            {
                text: '28',
                value: Pins.D28
            },
            {
                text: '29',
                value: Pins.D29
            },
            {
                text: '30',
                value: Pins.D30
            },
            {
                text: '31',
                value: Pins.D31
            },
            {
                text: '32',
                value: Pins.D32
            },
            {
                text: '33',
                value: Pins.D33
            },
            {
                text: '34',
                value: Pins.D34
            },
            {
                text: '35',
                value: Pins.D35
            },
            {
                text: '36',
                value: Pins.D36
            },
            {
                text: '37',
                value: Pins.D37
            },
            {
                text: '38',
                value: Pins.D38
            },
            {
                text: '39',
                value: Pins.D39
            },
            {
                text: '40',
                value: Pins.D40
            },
            {
                text: '41',
                value: Pins.D41
            },
            {
                text: '42',
                value: Pins.D42
            },
            {
                text: '43',
                value: Pins.D43
            },
            {
                text: '44',
                value: Pins.D44
            },
            {
                text: '45',
                value: Pins.D45
            },
            {
                text: '46',
                value: Pins.D46
            },
            {
                text: '47',
                value: Pins.D47
            },
            {
                text: '48',
                value: Pins.D48
            },
            {
                text: '49',
                value: Pins.D49
            },
            {
                text: '50',
                value: Pins.D50
            },
            {
                text: '51',
                value: Pins.D51
            },
            {
                text: '52',
                value: Pins.D52
            },
            {
                text: '53',
                value: Pins.D53
            }
        ];
    }

    get ANALOG_PINS_MENU () {
        return [
            {
                text: 'A0',
                value: Pins.A0
            },
            {
                text: 'A1',
                value: Pins.A1
            },
            {
                text: 'A2',
                value: Pins.A2
            },
            {
                text: 'A3',
                value: Pins.A3
            },
            {
                text: 'A4',
                value: Pins.A4
            },
            {
                text: 'A5',
                value: Pins.A5
            },
            {
                text: 'A6',
                value: Pins.A6
            },
            {
                text: 'A7',
                value: Pins.A7
            },
            {
                text: 'A8',
                value: Pins.A8
            },
            {
                text: 'A9',
                value: Pins.A9
            },
            {
                text: 'A10',
                value: Pins.A10
            },
            {
                text: 'A11',
                value: Pins.A11
            },
            {
                text: 'A12',
                value: Pins.A12
            },
            {
                text: 'A13',
                value: Pins.A13
            },
            {
                text: 'A14',
                value: Pins.A14
            },
            {
                text: 'A15',
                value: Pins.A15
            }
        ];
    }

    get LEVEL_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'arduinoMega2560.levelMenu.high',
                    default: 'High',
                    description: 'label for high level'
                }),
                value: Level.High
            },
            {
                text: formatMessage({
                    id: 'arduinoMega2560.levelMenu.low',
                    default: 'Low',
                    description: 'label for low level'
                }),
                value: Level.Low
            }
        ];
    }

    get PWM_PINS_MENU () {
        return [
            {
                text: '2',
                value: Pins.D2
            },
            {
                text: '3',
                value: Pins.D3
            },
            {
                text: '4',
                value: Pins.D4
            },
            {
                text: '5',
                value: Pins.D5
            },
            {
                text: '6',
                value: Pins.D6
            },
            {
                text: '7',
                value: Pins.D7
            },
            {
                text: '8',
                value: Pins.D8
            },
            {
                text: '9',
                value: Pins.D9
            },
            {
                text: '10',
                value: Pins.D10
            },
            {
                text: '11',
                value: Pins.D11
            },
            {
                text: '12',
                value: Pins.D12
            },
            {
                text: '13',
                value: Pins.D13
            },
            {
                text: '44',
                value: Pins.D44
            },
            {
                text: '45',
                value: Pins.D45
            },
            {
                text: '46',
                value: Pins.D46
            }
        ];
    }

    get INTERRUPT_PINS_MENU () {
        return [
            {
                text: '2',
                value: Pins.D2
            },
            {
                text: '3',
                value: Pins.D3
            },
            {
                text: '18',
                value: Pins.D18
            },
            {
                text: '19',
                value: Pins.D19
            },
            {
                text: '20',
                value: Pins.D20
            },
            {
                text: '21',
                value: Pins.D21
            }
        ];
    }

    get INTERRUP_MODE_MENU () {
        return [
            {
                text: 'rising edge',
                value: InterrupMode.Rising
            },
            {
                text: 'falling edge',
                value: InterrupMode.Falling
            },
            {
                text: 'change edge',
                value: InterrupMode.Change
            },
            {
                text: 'low',
                value: InterrupMode.Low
            }
        ];
    }

    get BAUDTATE_MENU () {
        return [
            {
                text: '4800',
                value: Buadrate.B4800
            },
            {
                text: '9600',
                value: Buadrate.B9600
            },
            {
                text: '19200',
                value: Buadrate.B19200
            },
            {
                text: '38400',
                value: Buadrate.B38400
            },
            {
                text: '57600',
                value: Buadrate.B57600
            },
            {
                text: '115200',
                value: Buadrate.B115200
            }
        ];
    }

    get SERIAL_NO_MENU () {
        return [
            {
                text: '0',
                value: SerialNo.Serial0
            },
            {
                text: '1',
                value: SerialNo.Serial1
            },
            {
                text: '2',
                value: SerialNo.Serial2
            },
            {
                text: '3',
                value: SerialNo.Serial3
            }
        ];
    }

    get DATA_TYPE_MENU () {
        return [
            {
                text: formatMessage({
                    id: 'arduinoMega2560.dataTypeMenu.wholeNumber',
                    default: 'whole number',
                    description: 'label for whole number'
                }),
                value: DataType.WholeNumber
            },
            {
                text: formatMessage({
                    id: 'arduinoMega2560.dataTypeMenu.decimal',
                    default: 'decimal',
                    description: 'label for decimal number'
                }),
                value: DataType.Decimal
            },
            {
                text: formatMessage({
                    id: 'arduinoMega2560.dataTypeMenu.string',
                    default: 'string',
                    description: 'label for string'
                }),
                value: DataType.String
            }
        ];
    }

    /**
     * Construct a set of Arduino blocks.
     * @param {Runtime} runtime - the OpenBlock runtime.
     */
    constructor (runtime) {
        /**
         * The OpenBlock runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        // Create a new Arduino Mega2560 peripheral instance
        this._peripheral = new ArduinoMega2560(this.runtime, OpenBlockArduinoMega2560Device.DEVICE_ID);
    }

    /**
     * @returns {Array.<object>} metadata for this extension and its blocks.
     */
    getInfo () {
        return [
            {
                id: 'pin',
                name: formatMessage({
                    id: 'arduinoMega2560.category.pins',
                    default: 'Pins',
                    description: 'The name of the arduino mega2560 device pin category'
                }),
                color1: '#4C97FF',
                color2: '#3373CC',
                color3: '#3373CC',

                blocks: [
                    {
                        opcode: 'setPinMode',
                        text: formatMessage({
                            id: 'arduinoMega2560.pins.setPinMode',
                            default: 'set pin [PIN] mode [MODE]',
                            description: 'arduinoMega2560 set pin mode'
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
                    },
                    {
                        opcode: 'setDigitalOutput',
                        text: formatMessage({
                            id: 'arduinoMega2560.pins.setDigitalOutput',
                            default: 'set digital pin [PIN] out [LEVEL]',
                            description: 'arduinoMega2560 set digital pin out'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'digitalPins',
                                defaultValue: Pins.D0
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
                            id: 'arduinoMega2560.pins.setPwmOutput',
                            default: 'set pwm pin [PIN] out [OUT]',
                            description: 'arduinoMega2560 set pwm pin out'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'pwmPins',
                                defaultValue: Pins.D3
                            },
                            OUT: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '0'
                            }
                        }
                    },
                    '---',
                    {
                        opcode: 'readDigitalPin',
                        text: formatMessage({
                            id: 'arduinoMega2560.pins.readDigitalPin',
                            default: 'read digital pin [PIN]',
                            description: 'arduinoMega2560 read digital pin'
                        }),
                        blockType: BlockType.BOOLEAN,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'digitalPins',
                                defaultValue: Pins.D0
                            }
                        }
                    },
                    {
                        opcode: 'readAnalogPin',
                        text: formatMessage({
                            id: 'arduinoMega2560.pins.readAnalogPin',
                            default: 'read analog pin [PIN]',
                            description: 'arduinoMega2560 read analog pin'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'analogPins',
                                defaultValue: Pins.A0
                            }
                        }
                    },
                    '---',
                    {

                        opcode: 'setServoOutput',
                        text: formatMessage({
                            id: 'arduinoMega2560.pins.setServoOutput',
                            default: 'set servo pin [PIN] out [OUT]',
                            description: 'arduinoMega2560 set servo pin out'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'pwmPins',
                                defaultValue: Pins.D3
                            },
                            OUT: {
                                type: ArgumentType.ANGLE,
                                defaultValue: '0'
                            }
                        }
                    },
                    '---',
                    {

                        opcode: 'attachInterrupt',
                        text: formatMessage({
                            id: 'arduinoMega2560.pins.attachInterrupt',
                            default: 'attach interrupt pin [PIN] mode [MODE] executes',
                            description: 'arduinoMega2560 attach interrupt'
                        }),
                        blockType: BlockType.CONDITIONAL,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'interruptPins',
                                defaultValue: Pins.D3
                            },
                            MODE: {
                                type: ArgumentType.STRING,
                                menu: 'interruptMode',
                                defaultValue: InterrupMode.Rising
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {

                        opcode: 'detachInterrupt',
                        text: formatMessage({
                            id: 'arduinoMega2560.pins.detachInterrupt',
                            default: 'detach interrupt pin [PIN]',
                            description: 'arduinoMega2560 detach interrupt'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            PIN: {
                                type: ArgumentType.STRING,
                                menu: 'interruptPins',
                                defaultValue: Pins.D3
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    pins: {
                        items: this.PINS_MENU
                    },
                    mode: {
                        items: this.MODE_MENU
                    },
                    digitalPins: {
                        items: this.DIGITAL_PINS_MENU
                    },
                    analogPins: {
                        items: this.ANALOG_PINS_MENU
                    },
                    level: {
                        acceptReporters: true,
                        items: this.LEVEL_MENU
                    },
                    pwmPins: {
                        items: this.PWM_PINS_MENU
                    },
                    interruptPins: {
                        items: this.INTERRUPT_PINS_MENU
                    },
                    interruptMode: {
                        items: this.INTERRUP_MODE_MENU
                    }
                }
            },
            {
                id: 'serial',
                name: formatMessage({
                    id: 'arduinoMega2560.category.serial',
                    default: 'Serial',
                    description: 'The name of the arduino mega2560 device serial category'
                }),
                color1: '#9966FF',
                color2: '#774DCB',
                color3: '#774DCB',

                blocks: [
                    {
                        opcode: 'multiSerialBegin',
                        text: formatMessage({
                            id: 'arduinoMega2560.serial.multiSerialBegin',
                            default: 'serial [NO] begin baudrate [VALUE]',
                            description: 'arduinoMega2560 multi serial begin'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            NO: {
                                type: ArgumentType.NUMBER,
                                menu: 'serialNo',
                                defaultValue: SerialNo.Serial0
                            },
                            VALUE: {
                                type: ArgumentType.STRING,
                                menu: 'baudrate',
                                defaultValue: Buadrate.B9600
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'multiSerialPrint',
                        text: formatMessage({
                            id: 'arduinoMega2560.serial.multiSerialPrint',
                            default: 'serial [NO] print [VALUE]',
                            description: 'arduinoMega2560 multi serial print'
                        }),
                        blockType: BlockType.COMMAND,
                        arguments: {
                            NO: {
                                type: ArgumentType.NUMBER,
                                menu: 'serialNo',
                                defaultValue: SerialNo.Serial0
                            },
                            VALUE: {
                                type: ArgumentType.STRING,
                                defaultValue: 'hello'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'multiSerialAvailable',
                        text: formatMessage({
                            id: 'arduinoMega2560.serial.multiSerialAvailable',
                            default: 'serial [NO] available data length',
                            description: 'arduinoMega2560 multi serial available data length'
                        }),
                        arguments: {
                            NO: {
                                type: ArgumentType.NUMBER,
                                menu: 'serialNo',
                                defaultValue: SerialNo.Serial0
                            }
                        },
                        blockType: BlockType.REPORTER,
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'multiSerialReadAByte',
                        text: formatMessage({
                            id: 'arduinoMega2560.serial.multiSerialReadAByte',
                            default: 'serial [NO] read a byte',
                            description: 'arduinoMega2560 multi serial read a byte'
                        }),
                        arguments: {
                            NO: {
                                type: ArgumentType.NUMBER,
                                menu: 'serialNo',
                                defaultValue: SerialNo.Serial0
                            }
                        },
                        blockType: BlockType.REPORTER,
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    baudrate: {
                        items: this.BAUDTATE_MENU
                    },
                    serialNo: {
                        items: this.SERIAL_NO_MENU
                    }
                }
            },
            {
                id: 'data',
                name: formatMessage({
                    id: 'arduinoMega2560.category.data',
                    default: 'Data',
                    description: 'The name of the arduino mega2560 device data category'
                }),
                color1: '#CF63CF',
                color2: '#C94FC9',
                color3: '#BD42BD',
                blocks: [
                    {
                        opcode: 'dataMap',
                        text: formatMessage({
                            id: 'arduinoMega2560.data.dataMap',
                            default: 'map [DATA] from ([ARG0], [ARG1]) to ([ARG2], [ARG3])',
                            description: 'arduinoMega2560 data map'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            DATA: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '50'
                            },
                            ARG0: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '1'
                            },
                            ARG1: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '100'
                            },
                            ARG2: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '1'
                            },
                            ARG3: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '1000'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    '---',
                    {
                        opcode: 'dataConstrain',
                        text: formatMessage({
                            id: 'arduinoMega2560.data.dataConstrain',
                            default: 'constrain [DATA] between ([ARG0], [ARG1])',
                            description: 'arduinoMega2560 data constrain'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            DATA: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '50'
                            },
                            ARG0: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '1'
                            },
                            ARG1: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '100'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'dataConvert',
                        text: formatMessage({
                            id: 'arduinoMega2560.data.dataConvert',
                            default: 'convert [DATA] to [TYPE]',
                            description: 'arduinoMega2560 data convert'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            DATA: {
                                type: ArgumentType.STRING,
                                defaultValue: '123'
                            },
                            TYPE: {
                                type: ArgumentType.STRING,
                                menu: 'dataType',
                                defaultValue: DataType.WholeNumber
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'dataConvertASCIICharacter',
                        text: formatMessage({
                            id: 'arduinoMega2560.data.dataConvertASCIICharacter',
                            default: 'convert [DATA] to ASCII character',
                            description: 'arduinoMega2560 data convert to ASCII character'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            DATA: {
                                type: ArgumentType.NUMBER,
                                defaultValue: '97'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    },
                    {
                        opcode: 'dataConvertASCIINumber',
                        text: formatMessage({
                            id: 'arduinoMega2560.data.dataConvertASCIINumber',
                            default: 'convert [DATA] to ASCII nubmer',
                            description: 'arduinoMega2560 data convert to ASCII nubmer'
                        }),
                        blockType: BlockType.REPORTER,
                        arguments: {
                            DATA: {
                                type: ArgumentType.STRING,
                                defaultValue: 'a'
                            }
                        },
                        programMode: [ProgramModeType.UPLOAD]
                    }
                ],
                menus: {
                    dataType: {
                        items: this.DATA_TYPE_MENU
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
    setPinMode (args) {
        this._peripheral.setPinMode(args.PIN, args.MODE);
        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, SerialportSendInterval);
        });
    }

    /**
     * Set pin digital out level.
     * @param {object} args - the block's arguments.
     * @return {Promise} - a Promise that resolves after the set pin digital out level is done.
     */
    setDigitalOutput (args) {
        this._peripheral.setDigitalOutput(args.PIN, args.LEVEL);
        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, SerialportSendInterval);
        });
    }

    /**
     * Set pin pwm out value.
     * @param {object} args - the block's arguments.
     * @return {Promise} - a Promise that resolves after the set pin pwm out value is done.
     */
    setPwmOutput (args) {
        this._peripheral.setPwmOutput(args.PIN, args.OUT);
        return new Promise(resolve => {
            setTimeout(() => {
                resolve();
            }, SerialportSendInterval);
        });
    }

    /**
     * Read pin digital level.
     * @param {object} args - the block's arguments.
     * @return {boolean} - true if read high level, false if read low level.
     */
    readDigitalPin (args) {
        return this._peripheral.readDigitalPin(args.PIN);
    }

    /**
     * Read analog pin.
     * @param {object} args - the block's arguments.
     * @return {number} - analog value fo the pin.
     */
    readAnalogPin (args) {
        return this._peripheral.readAnalogPin(args.PIN);
    }
}

module.exports = OpenBlockArduinoMega2560Device;
