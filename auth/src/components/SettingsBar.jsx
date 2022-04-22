import React from "react";
import Select from '../common/fields/Select.jsx';
import { useDataContext, useStyleContext } from "../common/utilities/DataHandler";

const SettingsBar = ({}) => {
    const { theme, setTheme } = useDataContext()
    const styles = useStyleContext(theme)

    const updateTheme = (e) => {
        // TODO: post to db
        setTheme(e.target.value)
    }

    return <div style={styles.test()}>
        <Select
            id={'theme-selector'}
            label={'Select your theme:'}
            inlineLabel={true}
            firstOption={false}
            options={[
                {label: 'Dark', value: 'dark'},
                {label: 'Light', value: 'light'},
                {label: 'Invalid', value: 'invalid'}
            ]}
            onChange={updateTheme}
            invalid={theme === 'invalid'}
        />
    </div>
}

export default SettingsBar;