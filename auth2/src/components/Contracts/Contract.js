import ContractViewer from "./components/ContractViewer";
import ContractEditor from "./components/ContractEditor";
import useContractInterface from "../../interfaces/ContractInterface";
import RequestViewer from "./components/RequestViewer";

function Contract({ I, data, isRequest}){
    const contractI = useContractInterface(I,data,isRequest)
    if (contractI.isRequest()){
        return <RequestViewer I={I} contractI={contractI} />
    }
    if (contractI.mode==="view")
        return <ContractViewer I={I} contractI={contractI} />
    else
        return <ContractEditor I={I} contractI={contractI}></ContractEditor>
        //ContractEditor Save Changes, Delete Changes
    //RequestViewer Approve Edit Deny
    // RequestEditor Save Changes ||  Cancel Changes
}

export default Contract;