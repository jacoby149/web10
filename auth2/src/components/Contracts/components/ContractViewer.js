import React from 'react';
import { Websites,WhiteList,BlackList } from './ContractComponents';

function ContractViewer({ I, contractI }) {
    const [hide, setHide] = React.useState(true);
    function toggleHide() {
        setHide(!hide)
    }
    return (
        <div className="card setting">
            <header className="card-header">
                <p className="card-header-title">
                    {contractI.data.service}
                </p>
                <button onClick={toggleHide} className="card-header-icon" aria-label="more options">
                    <span className="icon">
                        <i className={hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <div style={hide ? { display: "none" } : {}} className="card-content">
                <div className="content">
                    <u>Websites/IPs</u> : <Websites contractI={contractI}></Websites>
                    <WhiteList contractI={contractI} />
                    <BlackList contractI={contractI} />
                </div>
            </div>
            <footer style={hide ? { display: "none" } : {}} className="card-footer">
                <a href="#" className="card-footer-item">
                    view data
                    <i style={{ marginLeft: "7px" }} className="fas fa-database" aria-hidden="true"></i>
                </a>
                <a href="#" className="card-footer-item" onClick={()=>contractI.edit()}>
                    change terms
                    <i style={{ marginLeft: "7px" }} className="fas fa-pencil" aria-hidden="true"></i></a>
            </footer>
        </div>
    )
}

export default ContractViewer;