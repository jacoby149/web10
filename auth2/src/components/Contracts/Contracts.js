// see stuff about a friend + friend group
// pictures, media , text about them. 
// also configure ( manage notifications / unfriend / unfollow )

import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import Contract from './Contract';

function Contracts({ I }) {
    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I}></TopBar>
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t tel>
                <Contract I={I} service={"contacts"}/>
                <Contract I={I} service={"posts"} />
                <Contract I={I} service={"identity"} />
                </R>
            </R>
        </R>
    );
}

export default Contracts;
