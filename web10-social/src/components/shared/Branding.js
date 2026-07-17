import {R,C,pass} from "rectangles-npm"

/* Top Pane Site Branding Component */
function Branding(props){
    return(
        <R l {...pass(props)}>                            
                <C l ns mc s = {"120px"}>
                    <div><h3>web10 - social</h3></div>
                </C>
        </R>
    )
}

export default Branding;