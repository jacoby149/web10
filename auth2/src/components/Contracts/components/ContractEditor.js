
import React from 'react';
import { Websites, WhiteList, BlackList } from './ContractComponents';

//return <button onClick={()=>contractI.view()}>back</button>
function ContractEditor({ I, contractI }) {
    const [hide, setHide] = React.useState(true);
    function toggleHide() {
        setHide(!hide)
    }
    return (
        <div style={{ maxWidth: "800px", margin: "auto" }}>
            <div className="card setting" style={{ margin: "20px" }}>
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
                {contractI.isRequest() ?
                    ""
                    :
                    <footer style={hide ? { display: "none" } : {}} className="card-footer">
                        <a style={{ color: "gray" }} href="#" className="card-footer-item">
                            view data
                            <i style={{ marginLeft: "7px" }} className="fas fa-database" aria-hidden="true"></i> &nbsp; [TBD]
                        </a>
                        <a href="#" className="card-footer-item" onClick={() => contractI.edit()}>
                            change terms
                            <i style={{ marginLeft: "7px" }} className="fas fa-pencil" aria-hidden="true"></i></a>
                    </footer>
                }
            </div>
        </div>
    )
}

export default ContractEditor;