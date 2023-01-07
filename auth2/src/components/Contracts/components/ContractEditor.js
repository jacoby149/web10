
import React from 'react';
import { Websites, WhiteList, BlackList } from './ContractComponents';
import SiteEditor from './SiteEditor';
import ListEditor from './ListEditor';

//return <button onClick={()=>contractI.view()}>back</button>
function ContractEditor({ I, contractI }) {
    // all site allow block
    const [editorMode, setEditorMode] = React.useState("all")
    return (
        <div style={{ maxWidth: "800px", margin: "auto" }}>
            <div className="card setting" style={{ margin: "20px" }}>
                <header className="card-header">
                    <p className="card-header-title">
                        {contractI.mode === "edit" && editorMode === "all" ?
                            <i onClick={contractI.clearChanges} style={{ color: "gray", marginRight: "15px" }} className={"fa fa-2x fa-circle-xmark font-weight-bold"}></i> : ""
                        }
                        {contractI.data.service}
                    </p>
                    {contractI.mode === "edit" ?
                        editorMode === "all" ?
                            <div>
                                <button onClick={contractI.saveChanges} style={{ margin: "15px", width: "130px" }} className={"button is-primary is-small"}>Save Changes
                                    <i style={{ marginLeft: "10px" }} className={"fa fa-check font-weight-bold"}></i>
                                </button>
                            </div> :
                            <div>
                                <button onClick={() => setEditorMode("all")} style={{ margin: "15px", width: "100px" }} className={"button is-warning is-small"}>Go Back
                                    <i style={{ marginLeft: "10px" }} className={"fa fa-rotate-left font-weight-bold"}></i>
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
                    {editorMode !== "all" ?
                        "" :
                        <div className="content">
                            <u>Websites/IPs</u> : <Websites contractI={contractI}></Websites>
                            <div style={{ marginTop: "5px" }}>
                            </div>

                            <WhiteList contractI={contractI} />

                            <BlackList contractI={contractI} />
                        </div>
                    }
                    {editorMode !== "site" ?
                        "" :
                        <div className="content">
                            <u>Websites/IPs</u> : <Websites contractI={contractI}></Websites>
                            <div style={{ marginTop: "5px" }}>
                            </div>
                            <SiteEditor contractI={contractI} />
                        </div>
                    }
                    {editorMode !== "allow" ?
                        "" :
                        <>
                            <WhiteList contractI={contractI} />
                            <ListEditor contractI={contractI}></ListEditor>
                        </>

                    }
                    {editorMode !== "block" ?
                        "" :
                        <>
                            <BlackList contractI={contractI} />
                            <ListEditor contractI={contractI}></ListEditor>
                        </>
                    }

                </div>
                {editorMode === "all" ?
                    <footer style={contractI.hide ? { display: "none" } : {}} className="card-footer">
                        <a href="#" onClick={() => setEditorMode("site")} className="card-footer-item">
                            sites
                            <i style={{ marginLeft: "7px" }} className="fas fa-globe" aria-hidden="true"></i> &nbsp;
                        </a>
                        <a href="#" onClick={() => setEditorMode("allow")} className="card-footer-item">
                            allowed
                            <i style={{ marginLeft: "7px" }} className="fas fa-user" aria-hidden="true"></i></a>
                        <a href="#" onClick={() => setEditorMode("block")} className="card-footer-item">
                            blocked
                            <i style={{ marginLeft: "7px" }} className="fas fa-road-barrier" aria-hidden="true"></i></a>
                    </footer> : ""
                }
            </div>
        </div>
    )
}

export default ContractEditor;