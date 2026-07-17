import React from 'react';
import { Websites, WhiteList, BlackList } from './ContractComponents';

function ContractViewer({ I, contractI }: { I: Record<string, any>, contractI: Record<string, any> }) {
    const [deleteConfirm, setDeleteConfirm] = React.useState("");
    const [wipeConfirm, setWipeConfirm] = React.useState("");
    const [showDelete, setShowDelete] = React.useState(false);
    const [showWipe, setShowWipe] = React.useState(false);
    const serviceName = contractI.data.service;

    if (serviceName === "*") return null;

    return (
        <div style={{ maxWidth: "800px", margin: "auto" }}>
            <div className="card setting" style={{ margin: "20px" }}>
                <header className="card-header">
                    <p className="card-header-title">
                        {serviceName}
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
                    <a href="#" className="card-footer-item" onClick={() => contractI.edit()}>
                        change terms
                        <i style={{ marginLeft: "7px" }} className="fas fa-pencil" aria-hidden="true"></i>
                    </a>
                    <a href="#" style={{ color: "#bb2124" }} className="card-footer-item" onClick={() => setShowDelete(!showDelete)}>
                        delete terms
                        <i style={{ marginLeft: "7px" }} className="fas fa-trash" aria-hidden="true"></i>
                    </a>
                    <a href="#" style={{ color: "#bb2124" }} className="card-footer-item" onClick={() => setShowWipe(!showWipe)}>
                        wipe data
                        <i style={{ marginLeft: "7px" }} className="fas fa-fire" aria-hidden="true"></i>
                    </a>
                </footer>
            </div>
            {showDelete && (
                <div className="card setting" style={{ margin: "20px", border: "1px solid #bb2124" }}>
                    <div className="card-content">
                        <div className="content" style={{ color: "#bb2124" }}>
                            <p>Delete Service Terms Record</p>
                            <p>Type service name to confirm:</p>
                            <input
                                value={deleteConfirm}
                                onChange={(e) => setDeleteConfirm(e.target.value)}
                                placeholder={serviceName}
                                style={{ backgroundColor: "#222", color: "lightgreen", padding: "5px", width: "200px" }}
                            />
                            <button
                                onClick={() => {
                                    if (deleteConfirm === serviceName) {
                                        I.deleteService(serviceName);
                                        setShowDelete(false);
                                    } else {
                                        I.setStatus("Type the service name to confirm deletion");
                                    }
                                }}
                                className="button is-small is-danger"
                                style={{ marginTop: "5px" }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showWipe && (
                <div className="card setting" style={{ margin: "20px", border: "1px solid crimson" }}>
                    <div className="card-content">
                        <div className="content" style={{ color: "crimson" }}>
                            <p>Wipe All Service Data</p>
                            <p>Type service name to confirm:</p>
                            <input
                                value={wipeConfirm}
                                onChange={(e) => setWipeConfirm(e.target.value)}
                                placeholder={serviceName}
                                style={{ backgroundColor: "#222", color: "lightgreen", padding: "5px", width: "200px" }}
                            />
                            <button
                                onClick={() => {
                                    if (wipeConfirm === serviceName) {
                                        I.wipeServiceData(serviceName);
                                        setShowWipe(false);
                                    } else {
                                        I.setStatus("Type the service name to confirm wipe");
                                    }
                                }}
                                className="button is-small is-black"
                                style={{ marginTop: "5px" }}
                            >
                                Wipe
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ContractViewer;