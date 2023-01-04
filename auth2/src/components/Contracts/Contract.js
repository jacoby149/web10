import ContractViewer from "./components/ContractViewer";
import useContractInterface from "../../interfaces/ContractInterface";

function Contract({ I, data, isRequest}){
    const contractI=useContractInterface(I,data,isRequest)
    // I , contractI
    return <ContractViewer I={I} contractI={contractI} />
    //ContractEditor Save Changes, Delete Changes
    //RequestViewer Approve Edit Deny
    // RequestEditor Save Changes ||  Cancel Changes
}

export default Contract;