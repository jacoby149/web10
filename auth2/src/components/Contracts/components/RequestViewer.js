import React from 'react';
import { Websites, WhiteList, BlackList } from './ContractComponents';

function RequestViewer({ I, contractI }) {
    return (
        <div style={{ maxWidth: "800px", margin: "auto" }}>
            <div className="card setting" style={{ margin: "20px" }}>
                <header className="card-header">
                    <p className="card-header-title">
                        {contractI.data.service}
                    </p>
                    <button onClick={contractI.toggleHide} className="card-header-icon" aria-label="more options">
                        <span className="icon">
                            <i className={contractI.hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                        </span>
                    </button>
                </header>
                <div style={contractI.hide ? { display: "none" } : {}} className="card-content">
                    <div className="content">
                        <u>Websites/IPs</u> : <Websites contractI={contractI}></Websites>
                        <WhiteList contractI={contractI} />
                        <BlackList contractI={contractI} />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default RequestViewer;