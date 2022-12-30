import { R, C, pass } from "rectangles-npm"
import key_white from "../../assets/images/key_white.png"
import key_black from "../../assets/images/key_black.png"

/* Top Pane Site Branding Component */
function Branding(props) {
    return (
        <R l {...pass(props)}>
            <C l ns mc s={"5px"}></C>
            <C l ns mc s={"100px"}>
                <img style={{ width: "40px" }} src={props.I.theme === "dark" ? key_white : key_black}></img>
                &nbsp;<div><h3>web10</h3></div>
            </C>
            <C l ns mc s={"5px"}></C>
        </R>
    )
}

export default Branding;