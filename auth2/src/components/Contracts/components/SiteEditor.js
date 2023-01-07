//contractI.clearChanges

function SiteEditor({ contractI }) {
    return (
        <div style={{marginTop:"10px"}}>
            <input style={{ marginLeft:"10px", color: "black",width:"140px" }} placeholder="website.com" type="text"></input>
            <button style={{marginLeft:"5px"}}><i onClick={contractI.clearChanges} style={{ color: "#99aacc",marginRight:"3px" }} className={"fa fa-circle-plus font-weight-bold"}></i>add</button>
        </div>
    )
}

export default SiteEditor;