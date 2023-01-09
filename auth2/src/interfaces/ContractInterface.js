import React from 'react';

function useContractInterface(I, data = null,isRequest) {
    const contractI = {};
    
    contractI._data = data; //=== null ? null : data;
    [contractI.data, contractI.setData] = React.useState(data);
    [contractI.mode,contractI.setMode] = React.useState("view");
    [contractI._isRequest,contractI._setIsRequest] = React.useState(isRequest);
    [contractI.hide,contractI.setHide] = React.useState(true)

    contractI.toggleHide = function() {
        contractI.setHide(!contractI.hide)
    }

    contractI.clearChanges = function(){
        contractI.setData(contractI._data)
        contractI.view();
    }

    contractI.saveChanges = function(){
        I.changeTerms(contractI.data)
        contractI.view();
    }

    contractI.addSite = function(site){
        const newSites = [...contractI.data.cross_origins,site]
        const newData = {...contractI.data,cross_origins:newSites}
        contractI.setData(newData)
    }

    contractI.deleteSite = function(siteIndex){
        const newSites = contractI.data.cross_origins.filter((c,i)=>i!==siteIndex)
        const newData = {...contractI.data, cross_origins:newSites}
        contractI.setData(newData)
    }

    contractI.addWhiteList = function(permission){
        const newList = [...contractI.data.whitelist,permission]
        const newData = {...contractI.data,whitelist:newList}
        contractI.setData(newData)    
    }

    contractI.deleteWhiteListEntry = function(permissionIndex){
        const newList = contractI.data.whitelist.filter((p,i)=>i!==permissionIndex)
        const newData = {...contractI.data, whitelist:newList}
        contractI.setData(newData)
    }
    contractI.addBlackList = function(permission){
        const newList = [...contractI.data.blacklist,permission]
        const newData = {...contractI.data,blacklist:newList}
        contractI.setData(newData)    
    }

    contractI.deleteBlackListEntry = function(permissionIndex){
        const newList = contractI.data.blacklist.filter((p,i)=>i!==permissionIndex)
        const newData = {...contractI.data, blacklist:newList}
        contractI.setData(newData)
    }

    contractI.isRequest = function(){
        return contractI._isRequest;
    }
    
    contractI.edit = function(){
        contractI.setMode("edit");
    }
    contractI.view = function(){
        contractI.setMode("view");
    }

    return contractI;
}

export default useContractInterface;