import { R, C, pass } from "rectangles-npm"
import Branding from "./Branding"
import { Icon } from "./Icon"
import { Search } from '@chatscope/chat-ui-kit-react'
import styles from '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';


function EditButton() {
    return <i style={{ color: "orange", margin: "10px" }} className={"fa fa-pencil fa-2x font-weight-bold"}></i>
}

function BackButton() {
    return <i style={{ color: "orange", margin: "10px" }} className={"fa fa-arrow-rotate-left fa-2z  font-weight-bold"}></i>
}


function EditBulletin() {
    return <i style={{ color: "pink", margin: "10px" }} className={"fa fa-trash fa-2x font-weight-bold"}></i>
}

/* Top Bar of web10 */
function TopBar(props) {
    const I = props.I;

    return (
        <R l bb s={"55px"} {...pass(props)}>
            <Branding I={I} />
            <R l s={"110px"}>
                <Icon onClick={I.toggleMenuCollapsed}>bars</Icon>
                <Icon onClick={I.toggleTheme}>moon</Icon>
            </R>
            <C l tel>

                <Search onClearClick={() => I.runSearch("")} onChange={(v) => I.runSearch(v)} style={{ width: "100%", marginRight: "10px" }} placeholder="Search..." />

            </C>
            <C t s={"75px"}>
                {I.mode==="appstore"?
                    <button className="button is-primary is-small" onClick={() => I.setMode("login")}>Login</button>:
                    <button className="button is-info is-small" onClick={() => I.setMode("appstore")}>Apps</button>
                }
            </C>
            <R t s={"30px"}></R>
        </R>
    )
}

export default TopBar;