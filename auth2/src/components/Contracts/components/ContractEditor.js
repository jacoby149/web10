
import React from 'react';
import { Websites, WhiteList, BlackList } from './ContractComponents';

//return <button onClick={()=>contractI.view()}>back</button>
function ContractEditor({ I, contractI }) {
    return (
        <div style={{ maxWidth: "800px", margin: "auto" }}>
            <div className="card setting" style={{ margin: "20px" }}>
                <header className="card-header">
                    <p className="card-header-title">
                        {contractI.mode === "edit" ?
                            <i onClick={contractI.clearChanges} style={{ color: "gray", marginRight: "15px" }} className={"fa fa-2x fa-circle-xmark font-weight-bold"}></i> : ""
                        }
                        {contractI.data.service}
                    </p>
                    {contractI.mode === "edit" ?
                        <div>
                            <button onClick={contractI.saveChanges} style={{ margin: "15px", width: "130px" }} className={"button is-primary is-small"}>Save Changes
                                <i style={{ marginLeft: "10px" }} className={"fa fa-check font-weight-bold"}></i>
                            </button>
                        </div>
                        :
                        <button onClick={contractI.toggleHide} className="card-header-icon" aria-label="more options">
                            <span className="icon">
                                <i className={contractI.hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                            </span>
                        </button>
                    }
                </header>
                <div style={contractI.hide ? { display: "none" } : {}} className="card-content">
                    <div className="content">
                        <u>Websites/IPs</u> : <Websites contractI={contractI}></Websites>
                        <div style={{ marginTop: "5px" }}>
                        </div>

                        <WhiteList contractI={contractI} />

                        <BlackList contractI={contractI} />
                    </div>

                </div>
                <footer style={contractI.hide ? { display: "none" } : {}} className="card-footer">
                    <a  href="#" className="card-footer-item">
                        add site
                        <i style={{ marginLeft: "7px" }} className="fas fa-globe" aria-hidden="true"></i> &nbsp;
                    </a>
                    <a href="#" className="card-footer-item">
                        allow-user
                        <i style={{ marginLeft: "7px" }} className="fas fa-user" aria-hidden="true"></i></a>
                    <a href="#" className="card-footer-item">
                        block-user
                        <i style={{ marginLeft: "7px" }} className="fas fa-road-barrier" aria-hidden="true"></i></a>
                </footer>
            </div>
        </div>
    )
}

export default ContractEditor;