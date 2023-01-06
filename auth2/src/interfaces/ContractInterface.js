import React from 'react';

function useContractInterface(I, data = null,isRequest) {
    const contractI = {};
    
    [contractI.data, contractI.setData] = React.useState(data);
    [contractI.mode,contractI.setMode] = React.useState("view");
    [contractI._isRequest,contractI._setIsRequest] = React.useState(isRequest);
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