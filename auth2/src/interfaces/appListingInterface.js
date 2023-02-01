import axios from "axios";
import React from "react";

// pulls the app information from the publisher.
function useAppListingInterface(initApp) {
    const appLI = {};
    [appLI.app,appLI.setApp] = React.useState(initApp);
    React.useEffect(() => {
        return
        // fetch(`${initApp.href}manifest.json`)
        //     .then((r) => {
        //         console.log(r)
        //     });
    }, [initApp])

    appLI.getApp = function(){
        return appLI.app;
    }

    return appLI;
}

export default useAppListingInterface;