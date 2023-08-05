import { R, C, pass } from "rectangles-npm"

/* Top Bar of web10 social */
function SideBar(props) {
    const I = props.I;
    return (
        <R t br c={I.menuCollapsed} s={"220px"} {...pass(props)}>
            <R t tel>
                {I.isAuth ?
                    I.isAuthenticated() ?
                        <R t s={"200px"}>
                            <C onClick={() => I.setMode("appstore")} t bb h s={"40px"} va="center">
                                App Store
                            </C>
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
                        </C> :
                    <C></C>
                }
                <R t>
                    {I.isAuth ? <C></C> :
                        <R t>
                            <C onClick={() => I.setMode("forgot")} t bb h s={"40px"} va="center">
                                <i style={{ color: "orange" }}><u>Forgot Password</u></i>
                            </C>
                            <C onClick={() => I.setMode("appstore")} t bb h s={"40px"} va="center">
                                <i >App Store</i>
                            </C>
                            <C onClick={() => window.open("https://docs.web10.app", "_blank")} t bb h s={"40px"} va="center">
                                <i >SDK Docs</i>
                            </C>
                            <C onClick={() => window.open("https://github.com/jacoby149/web10", "_blank")} t bb h s={"40px"} va="center">
                                <i >Host A Node</i>
                            </C>
                        </R>
                    }
                </R>
            </R>
            <R bt>
                <C s={"80px"}>
                    <div style={{ fontFamily: "monospace" }}>
                        Invented by <a href="https://jacobhoffman.tk">Jacob Hoffman</a><br></br>
                        <iframe src="https://ghbtns.com/github-btn.html?user=jacoby149&repo=web10&type=star&count=true&size=large" frameborder="0" scrolling="0" width="170" height="30" title="GitHub" style={{marginTop:"5px"}}></iframe>
                    </div>
                </C>

            </R>
        </R>
    )
}

export default SideBar;