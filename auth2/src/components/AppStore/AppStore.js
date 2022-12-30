// see stuff about a friend + friend group
// pictures, media , text about them. 
// also configure ( manage notifications / unfriend / unfollow )

import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import { AppRow } from './Apps'

function AppStore({ I }) {
    const cols = 3;
    const apps1D = [...I.apps]
    const apps2D = [];
    while (apps1D.length) apps2D.push(apps1D.splice(0, cols));

    let appRows = apps2D.map((row, index) => {
        return <AppRow key={index} data={row}></AppRow>
    })
    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I}></TopBar>
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t tel>
                    {appRows}
                    <div className="columns" style={{ width: "100%" }}>
                        <div className="column"></div>
                        <div className="column">
                            <div className="snippet" data-title=".dot-fire">
                                <div className="stage">
                                    <div className="dot-fire"></div>
                                    <br></br>
                                </div>
                            </div>
                        </div>
                    </div>
                </R>
            </R>
        </R>
    );
}

export default AppStore;
