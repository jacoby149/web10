import React from 'react';

{/* <div key={i} style={{marginLeft:"15px"}}><a>- {site}</a></div> */ }

function Tag({ text,color }) {
    return <span style={{ margin: "0px 4px 4px 0px" }} class={`tag is-${color} is-light is-normal`}>{text} {/*<button class="delete is-small"></button>*/}</span>
}

function Websites({ siteList }) {
    const site_items = siteList.map((site, i) => {
        return <Tag key={i} text={site} color={"info"} />
    })
    return (<div style={{ marginLeft: "8px", marginTop: "5px" }}>{site_items}</div>)
}

function PermissionsList({ permissions, title }) {
    const permission_items = permissions.map((p, i) => {
        const create = p.create ? <Tag text="create" color="primary"/> : ""
        const read = p.read ? <Tag text="read" color="info"/> : ""
        const update = p.update ? <Tag text="create" color="warning"/> : ""
        const del = p.delete ? <Tag text="create" color="danger"/> : ""

        return (
            <div key={i}>
                <a style={{ marginLeft: "15px"}}> {p.provider}/{p.username} : </a>
                    {create}
                    {read}
                    {update}
                    {del}
            </div>
        )
    })
    return (
        permissions.length > 0 ?
            <div style={{marginTop:"10px"}}> <u>{title}</u> : <br></br>{permission_items}</div> :
            <></>
    )
}

function BlackList({ permissions }) {
    return <PermissionsList permissions={permissions} title={"Blocked users"} />
}

function WhiteList({ permissions }) {
    return <PermissionsList permissions={permissions} title={"Allowed users"} />
}


function ContractViewer({ I, data }) {
    //const ContractI = useContractInterface(I);
    const [hide, setHide] = React.useState(true);
    function toggleHide() {
        setHide(!hide)
    }
    return (
        <div className="card setting">
            <header class="card-header">
                <p class="card-header-title">
                    {data.service}
                </p>
                <button onClick={toggleHide} class="card-header-icon" aria-label="more options">
                    <span class="icon">
                        <i class={hide ? "fas fa-angle-right" : "fas fa-angle-down"} aria-hidden="true"></i>
                    </span>
                </button>
            </header>
            <div style={hide ? { display: "none" } : {}} class="card-content">
                <div class="content">
                    <u>Websites/IPs</u> : <Websites siteList={data.cross_origins}></Websites>
                    <WhiteList permissions={data.whitelist} />
                    <BlackList permissions={data.blacklist} />
                </div>
            </div>
            <footer style={hide ? { display: "none" } : {}} class="card-footer">
                <a href="#" class="card-footer-item">
                    view data
                    <i style={{ marginLeft: "7px" }} class="fas fa-database" aria-hidden="true"></i>
                </a>
                <a href="#" class="card-footer-item">
                    change terms
                    <i style={{ marginLeft: "7px" }} class="fas fa-pencil" aria-hidden="true"></i></a>
            </footer>
        </div>
    )
}

export default ContractViewer;