import { R, C, pass } from "rectangles-npm"

/* Top Bar of web10 social */
function SideBar(props) {
    const I = props.I;
    return (
        <R t br c={I.menuCollapsed} s={"220px"} {...pass(props)}>
            <R t tel>
                <C onClick={() => I.setMode("appstore")} t bb h s={"40px"} va="center">
                    App Store
                </C>
                {I.isAuthenticated() ?
                    <R t tel>
                        <C onClick={() => I.setMode("settings")} t bb h s={"40px"} va="center">
                            Settings
                        </C>
                        <C onClick={() => I.setMode("contracts")} t bb h s={"40px"} va="center">
                            Contracts
                        </C>
                        <C onClick={() => I.setMode("requests")} t bb h s={"40px"} va="center">
                            Active Request
                        </C>
                        {/* <C onClick={() => I.setMode("contracts")} t bb h s={"40px"} va="center">
                    FAQ
                </C> */}
                        <C onClick={() => I.logout()} t bb h s={"40px"} va="center">
                            <i style={{ color: "orange" }}><u>Log Out</u></i>
                        </C>
                    </R> :
                    <C onClick={() => I.setMode("login")} t bb h s={"40px"} va="center">
                        <i style={{ color: "orange" }}><u>Log In</u></i>
                    </C>
                }
            </R>
            <R bt>
                <C s={"60px"}>
                    <div style={{ fontFamily: "monospace" }}>
                        Invented by Jacob Hoffman<br></br>
                        <a href="https://docs.web10.app">the web10 SDK docs page</a>
                    </div>
                </C>

            </R>
        </R>
    )
}

export default SideBar;