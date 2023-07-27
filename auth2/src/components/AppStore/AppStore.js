// see stuff about a friend + friend group
// pictures, media , text about them. 
// also configure ( manage notifications / unfriend / unfollow )

import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import { Apps } from './Apps';

import { Box, Dropdown, Icon, DropdownItem } from 'react-bulma-components';

function AppStore({ I }) {
    return (
            <R root t bt bb br bl theme={I.theme}>
                <TopBar I={I}></TopBar>
                <R l tel>
                    <SideBar I={I}></SideBar>
                    <R t tel>
                        <div className="center-container stat-container">
                            <div className="statistic">{I.appStoreStats.users} users </div>
                            <div className="statistic">{I.appStoreStats.apps} apps</div>
                            <div className="statistic">{I.appStoreStats.hits} hits</div>
                            <div className="statistic">{I.appStoreStats.data}MBs data</div>
                        </div>
                        <div style={{ margin: "15px 0px 5px 0px" }} className="center-container"><b><u>Top web10 apps.</u></b></div>
                        <Apps I={I}></Apps>
                        <br></br>
                        <div className="center-container">
                            <div className="lds-ellipsis">
                                <div></div>
                                <div></div>
                                <div></div>
                                <div></div>
                            </div>
                        </div>
                    </R>
                </R>
                <div style={{
                position: 'absolute',
                bottom: 5,
                right: 5,
                // margin: 10,
                justifyContent: 'center',
                // // height: 600,
                // minHeight: '100vh'
            }}>
                <Dropdown
                    closeOnSelect={true}
                    icon={<Icon><i aria-hidden="true" className="fas fa-angle-up" /></Icon>}
                    label="Create An App!"
                    color='info'
                    up='true'
                    right='true'
                // hoverable='true'
                >
                    <Dropdown.Item renderAs="a" value="other">
                        Wordpress
                    </Dropdown.Item>
                    <Dropdown.Item renderAs="a" value="item">
                        Xano + Wized + Webflow
                    </Dropdown.Item>
                    <Dropdown.Item renderAs="a" value="other">
                        Replit
                    </Dropdown.Item>
                    <Dropdown.Item renderAs="a" value="other">
                        npx-create
                    </Dropdown.Item>
                </Dropdown>
            </div>

            </R>

    );
}

export default AppStore;
