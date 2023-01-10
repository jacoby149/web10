// see stuff about a friend + friend group
// pictures, media , text about them. 
// also configure ( manage notifications / unfriend / unfollow )

import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import Contract from './Contract';
import React from 'react';

function Requests({ I }) {
    const [mode, setMode] = React.useState("basic")
    const contract_items = I.requests.map((d, i) =>
        <Contract I={I} key={i} isRequest={true} data={d} />
    )
    return (
        <>
            <div style={{ margin: "30px 0px 0px 0px" }} className="center-container"><b>Approve crm.web10.app</b>
                <div style={{ marginTop: "20px", margin: "10px" }}>
                    <button className="button is-primary"> Approve And Log In </button>
                </div>
                <div style={{ marginTop: "30px", margin: "20px" }}> see service terms below </div>

                <div style={{ margin: "20px" }}>

                    {mode === "basic" ?
                        <button onClick={() => setMode("advanced")} className="button is-warning"> Show Terms Of Service &nbsp; <i className={"fa fa-square-plus font-weight-bold"}></i> </button>
                        :
                        <button onClick={() => setMode("basic")} className="button is-warning"> Hide Terms of Service &nbsp; <i className={"fa fa-square-minus font-weight-bold"}></i></button>
                    }
                </div>

            </div>
            {mode === "basic" ? "" : <>{contract_items}
                <div style={{ margin: "30px 0px 0px 0px" }} className="center-container">
                    <div style={{ marginTop: "10px" }}>
                        <button className="button is-danger"> Deny And Don't Log In</button>
                    </div></div></>
            }

        </>
    )
}

function RequestPage({ I }) {
    return (
        <R root t bt bb br bl theme={I.theme}>
            <TopBar I={I}></TopBar>
            <R l tel>
                <SideBar I={I}></SideBar>
                <R t tel>
                    <Requests I={I} />
                </R>
            </R>
        </R>
    );
}

export default RequestPage;
