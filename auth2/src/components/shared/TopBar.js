import { R, C, pass } from "rectangles-npm"
import Branding from "./Branding"
import { Icon } from "./Icon"
import { Search } from '@chatscope/chat-ui-kit-react'
import styles from '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';


function AppsButton({ I }) {
    return (
        <button className="button is-info is-small" onClick={() => I.setMode("appstore")}>Apps</button>
    );
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
            {I.isAuthenticated() ?
                I.mode === "settings" ?
                    <C t s={"75px"}>
                        <AppsButton I={I} />
                    </C>
                    :
                    <Icon onClick={() => I.setMode("settings")}>gear</Icon>

                :
                <C t s={"75px"}>
                    {I.mode === "appstore" ?
                        I.isAuth ?
                            <button className="button is-primary is-small" onClick={() => I.setMode("login")}>Login</button> :
                            <></>
                        :
                        <AppsButton I={I} />
                    }
                </C>
            }
            <R t s={"30px"}></R>
        </R>
    )
}

export default TopBar;