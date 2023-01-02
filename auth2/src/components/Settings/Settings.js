// see stuff about a friend + friend group
// pictures, media , text about them. 
// also configure ( manage notifications / unfriend / unfollow )

import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import Phone from '../CredentialPage/FormInputs/Phone';
import ConfirmationPass from '../CredentialPage/FormInputs/ConfirmationPass';

function Settings({ I }) {
    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I}></TopBar>
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t tel>
                    <div className="card setting">
                        <header class="card-header">
                            <p class="card-header-title">
                                Account Details
                            </p>
                            <button class="card-header-icon" aria-label="more options">
                                <span class="icon">
                                    <i class="fas fa-angle-down" aria-hidden="true"></i>
                                </span>
                            </button>
                        </header>
                        <div class="card-content">
                            <div class="content">
                                username : <a>jacoby149</a><br></br>
                                credit plan : <a>2 credits / month</a><br></br>
                                space plan : <a>1000MB</a><br></br>
                                credits_spent_this_month : <a>0.19873 credits</a><br></br>
                                space_utilization : <a>87.24MB</a>
                            </div>
                        </div>
                        <footer class="card-footer">
                            <a href="#" class="card-footer-item">Space Plan</a>
                            <a href="#" class="card-footer-item">Credit Plan</a>
                            <a href="#" class="card-footer-item">Subscriptions</a>
                        </footer>
                    </div>

                    <div className="card setting">
                        <header class="card-header">
                            <p class="card-header-title">
                                Change Phone Number
                            </p>
                            <button class="card-header-icon" aria-label="more options">
                                <span class="icon">
                                    <i class="fas fa-angle-down" aria-hidden="true"></i>
                                </span>
                            </button>
                        </header>
                        <div class="card-content">
                            <div class="content">
                                <div style={{ width: "300px" }}>
                                    <Phone I={I}></Phone>
                                    <ConfirmationPass I={I}></ConfirmationPass>
                                </div>
                                <button className='button is-warning is-small'>Change Phone Number</button>
                            </div>
                        </div>
                    </div>
                    <div className="box contract">
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
