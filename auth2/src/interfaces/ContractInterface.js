import React from 'react';

function useContractInterface(I, data = null,isRequest) {
    const contractI = {};
    
    [contractI.data, contractI.setData] = React.useState(data);
    [contractI.mode,contractI.setMode] = React.useState("view");
    [contractI._isRequest,contractI._setIsRequest] = React.useState(isRequest);
    [contractI.hide,contractI.setHide] = React.useState(true)

    contractI.toggleHide = function() {
        contractI.setHide(!contractI.hide)
    }

    contractI.clearChanges = function(){
        contractI.view();
    }

    contractI.saveChanges = function(){
        contractI.view();
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