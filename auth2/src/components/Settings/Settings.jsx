// see stuff about a friend + friend group
// pictures, media , text about them. 
// also configure ( manage notifications / unfriend / unfollow )

import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import ChangePhone from './ChangePhone';
import ChangePass from './ChangePassword';
import VerifyPhone from './VerifyPhone';
import Subscription from './Subscription';
import DevPay from './DevPay';

function Settings({ I }) {
    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I}></TopBar>
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t tel>
                    <div style={{ margin: "15px 0px 0px 0px" }} className="center-container"><b>Settings - jacoby149</b></div>
                    <div style={{maxWidth:"800px",margin:"auto"}}>
                    <Subscription I={I} />
                    {I.isVerified() ?
                        <ChangePhone I={I} /> :
                        <VerifyPhone I={I} />
                    }
                    <ChangePass I={I} />
                    <DevPay I={I} />
                    </div>
                </R>
            </R>
        </R>
    );
}

export default Settings;
