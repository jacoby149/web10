// see stuff about a friend + friend group
// pictures, media , text about them. 
// also configure ( manage notifications / unfriend / unfollow )

import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import Contract from './Contract';

function Contracts({ I }) {
    const contract_items = I.services.map((d,i)=>
        <Contract I={I} key={i} data ={d} />
    )
    return (
        <>
            <div style={{ margin: "15px 0px 0px 0px" }} className="center-container"><b>Contracts - jacoby149</b></div>
            {contract_items}
        </>
    )
}

function ContractPage({ I }) {
    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I}></TopBar>
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t tel>
                    <Contracts I={I} />
                </R>
            </R>
        </R>
    );
}

export default ContractPage;
