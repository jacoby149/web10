// see stuff about a friend + friend group
// pictures, media , text about them. 
// also configure ( manage notifications / unfriend / unfollow )

import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';

function Settings({ I }) {
    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I}></TopBar>
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t tel>
                    <div style={{ backgroundColor: "#FFE799" }} className="box contract">
                        Subscription
                    </div>
                    <div style={{ backgroundColor: "#D7FFEE" }} className="box contract">
                        Phone Number
                    </div>
                    <div style={{ backgroundColor: "white" }} className="box contract">
                        Password
                    </div>
                    <div style={{ backgroundColor: "white" }} className="box contract">
                        DevPay
                    </div>
                </R>
            </R>
        </R>
    );
}

export default Settings;
