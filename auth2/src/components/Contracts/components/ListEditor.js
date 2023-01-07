function ListEditor({contractI}) {
    return (
        <div style={{ marginTop: "15px" }}>
            <input style={{ color: "black", marginRight: "5px", width: "120px" }} placeholder="web10.app" type="text"></input>
            <input style={{ color: "black", width: "120px" }} placeholder="jacoby149" type="text"></input>                                
            <button style={{marginLeft:"5px"}}><i onClick={contractI.clearChanges} style={{ color: "#99aacc",marginRight:"3px" }} className={"fa fa-circle-plus font-weight-bold"}></i>allow</button>

            <div style={{ marginTop: "5px" }}>
                <label className="checkbox">
                    <input style={{ margin: '0px 4px' }} type="checkbox" />
                    create
                </label>
                <label className="checkbox">
                    <input style={{ margin: '0px 4px' }} type="checkbox" />
                    read
                </label>
                <label className="checkbox">
                    <input style={{ margin: '0px 4px' }} type="checkbox" />
                    update
                </label>
                <label className="checkbox">
                    <input style={{ margin: '0px 4px' }} type="checkbox" />
                    delete
                </label>
            </div>

        </div>
    )
}

export default ListEditor;