import {C,pass} from "rectangles-npm"

/* Custom Rectangles.js Icon Component */
function Icon(props){
    const iconClass = "fa-"+props.children;
    return(
        <C s={"50px"} {...pass(props)}>
            <i className={"fa "+ iconClass +" fa-2x font-weight-bold"}></i>
        </C>
    )
}

function RawIcon(props){
    const iconClass = "fa-"+props.children;
    return <div onClick={props.onClick} style={{width:"25px",height:"25px",margin:"6px"}}><i className={"fa "+ iconClass +" fa-2x font-weight-bold"}></i></div>
}

export {Icon,RawIcon};