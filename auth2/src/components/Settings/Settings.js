// see stuff about a friend + friend group
// pictures, media , text about them. 
// also configure ( manage notifications / unfriend / unfollow )

import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import ChangePhone from './ChangePhone';
import ChangePass from './ChangePassword';
import VerifyPhone
 from './VerifyPhone';
function Settings({ I }) {
    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I}></TopBar>
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t tel>
                    <div style={{margin:"15px 0px 0px 0px"}} className="center-container"><b>Settings - jacoby149</b></div>
                    <div className="card setting">
                        <header class="card-header">
                            <p class="card-header-title">
                                Subscription Details
                            </p>
                            <button class="card-header-icon" aria-label="more options">
                                <span class="icon">
                                    <i class="fas fa-angle-down" aria-hidden="true"></i>
                                </span>
                            </button>
                        </header>
                        <div class="card-content">
                            <div class="content">
                                spent_this_month : <a>0.19873 / 2 credits</a><br></br>
                                space_utilization : <a>87.24MB / 100MB</a>
                            </div>
                        </div>
                        <footer class="card-footer">
                            <a href="#" class="card-footer-item">Space Plan</a>
                            <a href="#" class="card-footer-item">Credit Plan</a>
                            <a href="#" class="card-footer-item">Subscriptions</a>
                        </footer>
                    </div>

                    <VerifyPhone I={I}/>
                    <ChangePhone I={I} />
                    <ChangePass I={I} />


                    <div className="card setting">
                        <header class="card-header">
                            <p class="card-header-title">
                                DevPay
                            </p>
                            <button class="card-header-icon" aria-label="more options">
                                <span class="icon">
                                    <i class="fas fa-angle-down" aria-hidden="true"></i>
                                </span>
                            </button>
                        </header>
                        <footer class="card-footer">
                            <a href="#" class="card-footer-item">Connect To Bank</a>
                            <a href="#" class="card-footer-item">DevPay Stats</a>
                        </footer>
                    </div>
                </R>
            </R>
        </R>
    );
}

export default Settings;
