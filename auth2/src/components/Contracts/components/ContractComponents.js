{/* <div key={i} style={{marginLeft:"15px"}}><a>- {site}</a></div> */ }

function Tag({ text, color }) {
    return <span style={{ margin: "0px 4px 4px 0px" }} className={`tag is-${color} is-light is-normal`}>{text} {/*<button className="delete is-small"></button>*/}</span>
}

function Websites({ contractI }) {
    const site_items = contractI.data.cross_origins.map((site, i) => {
        return <Tag key={i} text={site} color={"info"} />
    })
    return (<div style={{ marginLeft: "8px", marginTop: "5px" }}>{site_items}</div>)
}

function PermissionsList({ permissions, title }) {
    const permission_items = permissions.map((p, i) => {
        const create = p.create ? <Tag text="create" color="primary" /> : ""
        const read = p.read ? <Tag text="read" color="info" /> : ""
        const update = p.update ? <Tag text="create" color="warning" /> : ""
        const del = p.delete ? <Tag text="create" color="danger" /> : ""

        return (

            <div key={i}>
                <a style={{ marginLeft: "15px" }}> {p.provider}/{p.username} : </a>
                {create}
                {read}
                {update}
                {del}
                {/* <i style={{ color: "red", marginLeft: "5px" }} className={"fa fa-trash font-weight-bold"}></i> */}
            </div>

        )
    })
    return (
        permissions.length > 0 ?
            <div style={{ marginTop: "10px" }}> <div style={{ marginBottom: "4px" }}><u>{title}</u> :</div> {permission_items}</div> :
            <></>
    )
}

function BlackList({ contractI }) {
    return <PermissionsList permissions={contractI.data.blacklist} title={"Blocked users"} />
}

function WhiteList({ contractI }) {
    return <PermissionsList permissions={contractI.data.whitelist} title={"Allowed users"} />
}

export { Websites, BlackList, WhiteList }