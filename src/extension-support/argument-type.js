/**
 * Block argument types
 * @enum {string}
 */
const ArgumentType = {
    /**
     * Numeric value with angle picker
     */
    ANGLE: 'angle',

    /**
     * Boolean value with hexagonal placeholder
     */
    BOOLEAN: 'Boolean',

    /**
     * Numeric value with color picker
     */
    COLOR: 'color',

    /**
     * Numeric value with text field
     */
    NUMBER: 'number',

    /**
     * String value with text field
     */
    STRING: 'string',

    /**
     * String value with matrix field
     */
    MATRIX: 'matrix',

    /**
     * MIDI note number with note picker (piano) field
     */
    NOTE: 'note',

    /**
     * Numeric value with slider field. from 0 to 255
     */
    UINT8_NUMBER: 'uint8_number',

    /**
     * Numeric value with slider field. from 0 to 1024
     */
    UINT10_NUMBER: 'uint10_number',

    /**
     * Inline image on block (as part of the label)
     */
    IMAGE: 'image'
};

module.exports = ArgumentType;
