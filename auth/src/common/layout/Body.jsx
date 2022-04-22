import React from 'react';
import { useDataContext, useStyleContext } from "../utilities/DataHandler.jsx";

const Body = ({children}) => {
    const { theme } = useDataContext()
    const styles = useStyleContext(theme)

    return <div style={styles.body()}>
        {children}
    </div>
}

export default Body;