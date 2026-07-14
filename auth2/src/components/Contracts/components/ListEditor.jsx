import React from 'react'

function usePermission() {
    const permissionI = {};
    [permissionI.entry, permissionI.setEntry] = React.useState(
        {
            provider: "",
            username: "",
            create: false,
            read: false,
            update: false,
            delete: false
        }
    )
    permissionI.setCreate = function (create) {
        const newEntry = { ...permissionI.entry, create: create }
        permissionI.setEntry(newEntry)
    }
    permissionI.setRead = function (read) {
        const newEntry = { ...permissionI.entry, read: read }
        permissionI.setEntry(newEntry)
    }
    permissionI.setUpdate = function (update) {
        const newEntry = { ...permissionI.entry, update: update }
        permissionI.setEntry(newEntry)
    }
    permissionI.setDelete = function (d) {
        const newEntry = { ...permissionI.entry, delete: d }
        permissionI.setEntry(newEntry)
    }
    permissionI.setProvider = function (p) {
        const newEntry = { ...permissionI.entry, provider: p }
        permissionI.setEntry(newEntry)
    }
    permissionI.setUsername = function (u) {
        const newEntry = { ...permissionI.entry, username: u }
        permissionI.setEntry(newEntry)
    }
    permissionI.reset = function () {
        permissionI.setEntry(
            {
                provider: "",
                username: "",
                create: false,
                read: false,
                update: false,
                delete: false
            }
        )
    }
    return permissionI;
}

function WhiteListEditor({ contractI }) {
    const permissionI = usePermission();
    function add(entry) {
        if (entry.create || entry.read || entry.update || entry.delete) {
            if (entry.provider !== "" && entry.username !== "") {
                contractI.addWhiteList(entry);
                permissionI.reset();
            }
        }
    }
    return (
        <div style={{ marginTop: "15px" }}>
            <input value={permissionI.entry.provider} onChange={(e) => permissionI.setProvider(e.target.value)} style={{ color: "black", marginRight: "5px", width: "120px" }} placeholder="web10.app" type="text"></input>
            <input value={permissionI.entry.username} onChange={(e) => permissionI.setUsername(e.target.value)} style={{ color: "black", width: "120px" }} placeholder="jacoby149" type="text"></input>
            <button onClick={() => add(permissionI.entry)} style={{ marginLeft: "5px" }}><i style={{ color: "#99aacc", marginRight: "3px" }} className={"fa fa-circle-plus font-weight-bold"}></i>allow</button>

            <div style={{ marginTop: "5px" }}>
                <label className="checkbox">
                    <input checked={permissionI.entry.create} onChange={(e) => permissionI.setCreate(e.target.checked)} style={{ margin: '0px 4px' }} type="checkbox" />
                    create
                </label>
                <label className="checkbox">
                    <input checked={permissionI.entry.read} onChange={(e) => permissionI.setRead(e.target.checked)} style={{ margin: '0px 4px' }} type="checkbox" />
                    read
                </label>
                <label className="checkbox">
                    <input checked={permissionI.entry.update} onChange={(e) => permissionI.setUpdate(e.target.checked)} style={{ margin: '0px 4px' }} type="checkbox" />
                    update
                </label>
                <label className="checkbox">
                    <input checked={permissionI.entry.delete} onChange={(e) => permissionI.setDelete(e.target.checked)} style={{ margin: '0px 4px' }} type="checkbox" />
                    delete
                </label>
            </div>

        </div>
    )
}

function BlackListEditor({ contractI }) {
    const permissionI = usePermission();
    function add(entry) {
        if (entry.create || entry.read || entry.update || entry.delete) {
            if (entry.provider !== "" && entry.username !== "") {
                contractI.addBlackList(entry);
                permissionI.reset();
            }
        }
    }
    return (
        <div style={{ marginTop: "15px" }}>
            <input value={permissionI.entry.provider} onChange={(e) => permissionI.setProvider(e.target.value)} style={{ color: "black", marginRight: "5px", width: "120px" }} placeholder="web10.app" type="text"></input>
            <input value={permissionI.entry.username} onChange={(e) => permissionI.setUsername(e.target.value)} style={{ color: "black", width: "120px" }} placeholder="jacoby149" type="text"></input>
            <button onClick={() => add(permissionI.entry)} style={{ marginLeft: "5px" }}><i style={{ color: "#99aacc", marginRight: "3px" }} className={"fa fa-circle-plus font-weight-bold"}></i>block</button>

            <div style={{ marginTop: "5px" }}>
                <label className="checkbox">
                    <input checked={permissionI.entry.create} onChange={(e) => permissionI.setCreate(e.target.checked)} style={{ margin: '0px 4px' }} type="checkbox" />
                    create
                </label>
                <label className="checkbox">
                    <input checked={permissionI.entry.read} onChange={(e) => permissionI.setRead(e.target.checked)} style={{ margin: '0px 4px' }} type="checkbox" />
                    read
                </label>
                <label className="checkbox">
                    <input checked={permissionI.entry.update} onChange={(e) => permissionI.setUpdate(e.target.checked)} style={{ margin: '0px 4px' }} type="checkbox" />
                    update
                </label>
                <label className="checkbox">
                    <input checked={permissionI.entry.delete} onChange={(e) => permissionI.setDelete(e.target.checked)} style={{ margin: '0px 4px' }} type="checkbox" />
                    delete
                </label>
            </div>

        </div>
    )
}


export { WhiteListEditor, BlackListEditor };