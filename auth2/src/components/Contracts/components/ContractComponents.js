{/* <div key={i} style={{marginLeft:"15px"}}><a>- {site}</a></div> */ }

function Tag({ text, color }) {
    return <span style={{ margin: "0px 4px 4px 0px" }} className={`tag is-${color} is-light is-normal`}>{text} {/*<button className="delete is-small"></button>*/}</span>
}

function Websites({ contractI }) {
    const site_items = contractI.data.cross_origins.map((site, i) => {
        return (
            <span key={i} style={{ margin: "0px 4px 4px 0px" }} className={`tag is-info is-light is-normal`}>{site} {contractI.mode === "view" ?
                "" :
                <button style={{ marginLeft: "5px" }} onClick={()=>contractI.deleteSite(i)} className="delete is-small"></button>
            }
            </span>
        )
    })
    return (<div style={{ marginLeft: "8px", marginTop: "5px" }}>{site_items}</div>)
}

function BlackList({ contractI }) {
    const permissions = contractI.data.blacklist
    const permission_items = permissions.map((p, i) => {
        const create = p.create ? <Tag text="create" color="primary" /> : ""
        const read = p.read ? <Tag text="read" color="info" /> : ""
        const update = p.update ? <Tag text="update" color="warning" /> : ""
        const del = p.delete ? <Tag text="delete" color="danger" /> : ""

        return (

            <div key={i}>
                <a style={{ marginLeft: "15px" }}> {p.provider}/{p.username} : </a>
                {create}
                {read}
                {update}
                {del}
                {contractI.mode == "view" ? "" :
                    <i onClick={()=>contractI.deleteBlackListEntry(i)} style={{ color: "#ff7e7e", marginLeft: "5px" }} className={"fa fa-trash font-weight-bold"}></i>
                }
            </div>

        )
    })
    return (
        permissions.length > 0 ?
            <div style={{ marginTop: "10px" }}> <div style={{ marginBottom: "4px" }}><u>{"Blocked Users"}</u> :</div> {permission_items}</div> :
            <></>
    )
}

function WhiteList({ contractI }) {
    const permissions = contractI.data.whitelist
    const permission_items = permissions.map((p, i) => {
        const create = p.create ? <Tag text="create" color="primary" /> : ""
        const read = p.read ? <Tag text="read" color="info" /> : ""
        const update = p.update ? <Tag text="update" color="warning" /> : ""
        const del = p.delete ? <Tag text="delete" color="danger" /> : ""

        return (

            <div key={i}>
                <a style={{ marginLeft: "15px" }}> {p.provider}/{p.username} : </a>
                {create}
                {read}
                {update}
                {del}
                {contractI.mode == "view" ? "" :
                    <i onClick={()=>contractI.deleteWhiteListEntry(i)} style={{ color: "#ff7e7e", marginLeft: "5px" }} className={"fa fa-trash font-weight-bold"}></i>
                }
            </div>

        )
    })
    return (
        permissions.length > 0 ?
            <div style={{ marginTop: "10px" }}> <div style={{ marginBottom: "4px" }}><u>{"Allowed Users"}</u> :</div> {permission_items}</div> :
            <></>
    )
}

export { Websites, BlackList, WhiteList }