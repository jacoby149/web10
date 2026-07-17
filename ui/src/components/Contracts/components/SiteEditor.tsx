import React from 'react';

function SiteEditor({ contractI }) {
    const [value, setValue] = React.useState("");
    const addSite = function () {
        if (value !== "") {
            contractI.addSite(value)
            setValue("");
        }
    }
    return (
        <div style={{ marginTop: "10px" }}>
            <input value={value} onChange={(e) => { setValue(e.target.value) }} style={{ marginLeft: "10px", color: "black", width: "140px" }} placeholder="website.com" type="text"></input>
            <button onClick={addSite} style={{ marginLeft: "5px" }}><i style={{ color: "#99aacc", marginRight: "3px" }} className={"fa fa-circle-plus font-weight-bold"}></i>add</button>
        </div>
    )
}

export default SiteEditor;