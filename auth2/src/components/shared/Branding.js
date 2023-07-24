import { R, C, pass } from "rectangles-npm"

/* Top Pane Site Branding Component */
function Branding(props) {
    const I = props.I;
    return (
        <R l {...pass(props)}>
            <C l ns mc s={"5px"}></C>
            <C l ns mc s={"100px"}>
                <img style={{ width: "40px" }} src={I.logo}></img>
                &nbsp;<div><h3>{I.config.BRAND_TEXT}</h3></div>
            </C>
            <C l ns mc s={"5px"}></C>
        </R>
    )
}

export default Branding;