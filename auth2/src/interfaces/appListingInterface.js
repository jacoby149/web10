import axios from "axios";
import React from "react";

// pulls the app information from the publisher.
function useAppListingInterface(initApp, I) {
    const appLI = {};
    [appLI.app, appLI.setApp] = React.useState(initApp);
    React.useEffect(() => {
        if (!I.isMock) {
            const provider = window.location.protocol === "https:" ?
                "https://api.web10.app" :
                "http://api.localhost"
            axios.get(`${provider}/pwa_listing?url=${initApp.href}`)
                .then((r) => {
                    console.log(r.data);
                    const icons = r.data.icons
                    const icon = icons && icons.length > 0 ?
                    icons[icons.length - 1].src:
                    null;
                    const imgURL = icon?`${initApp.href}${icon}`:null;
                    appLI.setApp({
                        ...appLI.app,
                        title: r.data.name,
                        img: imgURL
                    })
                });
        }
    }, [initApp])

    appLI.getApp = function () {
        return appLI.app;
    }

    return appLI;
}

export default useAppListingInterface;