import { R } from 'rectangles-npm'
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';
import React from 'react';

function Requests({ I }: { I: Record<string, any> }) {
    const [mode, setMode] = React.useState("basic");
    const pendingSIRs = I.SMR?.sirs || [];
    const pendingSCRs = I.SMR?.scrs || [];
    const allRequests = [...pendingSIRs, ...pendingSCRs];

    const handleApprove = (service: any, type: string) => {
        if (type === "new") {
            I.submitSIR(service);
        } else {
            I.changeTerms(service);
        }
    };

    const handleDeny = (service: any) => {
        I.purgeSMR(service);
    };

    return (
        <>
            <div style={{ margin: "15px 0px 0px 0px" }} className="center-container">
                <b>Pending Service Requests</b>
            </div>
            {allRequests.length === 0 ? (
                <div style={{ margin: "20px", textAlign: "center", color: "gray" }}>
                    No pending requests.
                </div>
            ) : (
                allRequests.map((req: any, idx: number) => {
                    const type = pendingSIRs.find((s: any) => s.service === req.service) ? "new" : "change";
                    return (
                        <div key={idx} style={{ maxWidth: "800px", margin: "20px auto" }}>
                            <div className="card setting">
                                <header className="card-header">
                                    <p className="card-header-title">
                                        {type === "new" ? "New Service" : "Service Change"}: {req.service}
                                    </p>
                                </header>
                                <div className="card-content">
                                    <div className="content">
                                        {req.cross_origins && (
                                            <div>
                                                <u>Websites/IPs:</u>{" "}
                                                {req.cross_origins.map((o: string, i: number) => (
                                                    <span key={i} className="tag is-info" style={{ marginRight: "5px" }}>{o}</span>
                                                ))}
                                            </div>
                                        )}
                                        {req.whitelist && (
                                            <div style={{ marginTop: "10px" }}>
                                                <u>Allowed:</u>{" "}
                                                {req.whitelist.map((w: any, i: number) => (
                                                    <span key={i} className="tag is-success" style={{ marginRight: "5px" }}>
                                                        {w.anchor} [{w.allowed.join(", ")}]
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {req.blacklist && (
                                            <div style={{ marginTop: "10px" }}>
                                                <u>Blocked:</u>{" "}
                                                {req.blacklist.map((b: any, i: number) => (
                                                    <span key={i} className="tag is-danger" style={{ marginRight: "5px" }}>
                                                        {b.anchor} [{b.denied.join(", ")}]
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <footer className="card-footer">
                                    <button
                                        onClick={() => handleApprove(req, type)}
                                        className="card-footer-item button is-primary is-small"
                                    >
                                        Approve {type === "new" ? "Service Addition" : "Service Change"}
                                    </button>
                                    <button
                                        onClick={() => handleDeny(req)}
                                        className="card-footer-item button is-danger is-small"
                                    >
                                        Deny
                                    </button>
                                </footer>
                            </div>
                        </div>
                    );
                })
            )}
            {mode === "basic" ? (
                <div style={{ margin: "20px", textAlign: "center" }}>
                    <button onClick={() => setMode("advanced")} className="button is-warning">
                        Show All Details <i className="fa fa-square-plus font-weight-bold"></i>
                    </button>
                </div>
            ) : (
                <div style={{ margin: "20px", textAlign: "center" }}>
                    <button onClick={() => setMode("basic")} className="button is-warning">
                        Hide Details <i className="fa fa-square-minus font-weight-bold"></i>
                    </button>
                </div>
            )}
        </>
    );
}

function RequestPage({ I }: { I: Record<string, any> }) {
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
