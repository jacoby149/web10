import React from 'react';

function useContractInterface(I, data = null,isRequest) {
    const contractI = {}
    contractI.data = data

    return contractI;
}

export default useContractInterface;