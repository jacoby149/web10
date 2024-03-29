import React from 'react';
import { Websites, WhiteList, BlackList } from './ContractComponents';

function ContractViewer({ I, contractI }) {
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
                <footer style={contractI.hide ? { display: "none" } : {}} className="card-footer">
                    <a style={{ color: "gray" }} href="#" className="card-footer-item"  onClick={() => contractI.openEditor()}>
                        view data
                        <i style={{ marginLeft: "7px" }} className="fas fa-database" aria-hidden="true"></i> &nbsp; [TBD]
                    </a>
                    <a href="#" className="card-footer-item" onClick={() => contractI.edit()}>
                        change terms
                        <i style={{ marginLeft: "7px" }} className="fas fa-pencil" aria-hidden="true"></i>
                    </a>
                    <a href="#" style={{color:"#bb2124"}} className="card-footer-item" onClick={() => contractI.prepDelete()}>
                        delete terms [TBD]
                        <i style={{ marginLeft: "7px" }} className="fas fa-trash" aria-hidden="true"></i>
                    </a>
                </footer>
            </div>
        </div>
    )
}

export default ContractViewer;