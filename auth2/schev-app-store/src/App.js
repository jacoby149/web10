import React from 'react';
import Authenticator from './components/Authenticator'
import AppStore from './components/AppStore'

/* Top Pane Site Branding Component */
function App(){
    
    /* App Mode State */
    const [mode,setMode] = React.useState("app_store")


    return mode == "authenticator" ? <Authenticator setMode = {setMode}/> : mode == "app_store" ? <AppStore setMode =  {setMode}/> : null
}

export default App;
