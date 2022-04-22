export const styles = (theme='dark') => ({
    /**
     * Get style object for the label of a read-only field.
     *
     * @param additionalStyles
     * @returns {{color: string, fontSize: string, fontWeight: string}}
     */
    readOnlyLabel: (additionalStyles={}) => {
        return Object.assign(
            {},
            {
                fontWeight: 'bold',
                fontSize: '12px',
                color: 'dimgray'
            },
            additionalStyles
        )
    },

    /**
     * Get style object for an invalid field.
     *
     * @param additionalStyles
     * @returns {{border: string, color: string, outlineColor: string}}
     */
    error: (additionalStyles={}) => {
        return Object.assign(
            {},
            {
                border: '1px solid red',
                color: 'red',
                outlineColor: 'red'
            },
            additionalStyles
        )
    },

    /**
     * For test purposes.
     *
     * @param additionalStyles
     * @returns {{backgroundColor: string} & {backgroundColor: string} & {color: string} & {color: string}}
     */
    test: (additionalStyles={}) => {
        return Object.assign(
            {},
            // TODO: better way to do apply generals from themes. keep theme definitions in themes.js and automatically apply in this file?
            theme === 'dark'
                ? {backgroundColor: 'black'}
                : {backgroundColor: 'white'},
            theme === 'light'
                ? {color: 'black'}
                : {color: 'white'},
            additionalStyles
        )
    },

    /**
     * Styles the `Select` component.
     *
     * @param additionalStyles
     * @returns {{padding: string, width: string} & {backgroundColor: string} & {color: string}}
     */
    select: (additionalStyles={}) => {
        return Object.assign(
            {},
            {width: '150px', padding: '6px'},
            styles(theme).test(),
            additionalStyles
        )
    },

    /**
     * Main page container.
     *
     * @param additionalStyles
     * @returns {{width: string, height: string}}
     */
    body: (additionalStyles={}) => {
        return Object.assign(
            {},
            {width: '100vw', height: '100vh'},
            styles(theme).test(),
            additionalStyles
        )
    }
})