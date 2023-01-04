import ContractViewer from "./ContractViewer";

function Contract({ I, data }){
    const contractI={}
    return <ContractViewer I={I} data={data} />
}

export default Contract;