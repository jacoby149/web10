
import {pass,R,C,T} from 'Rectangles.js'
import {Posts} from 'Posts.js'

var wapi = window.wapiInit('https://auth.web10.app');

/* Plain Pad app made of entirely rectangles.js components */
function App(){


    /* Menu Collapsed State */
    const [collapseMenu,setCollapseMenu] = React.useState(false);
    const [collapseSettings,setCollapseSettings] = React.useState(true);
    const [authStatus,setAuthStatus] = React.useState(false);
    

    React.useEffect(() => setAuthStatus(wapi.isSignedIn()),[]);
    React.useEffect(() => wapi.authListen(setAuthStatus),[]);
    React.useEffect(() => wapi.serviceChangeRequester.requestOnReady(["inbox"]));

    function toggleCollapseMenu(){
        setCollapseMenu(!collapseMenu);
    }
    function toggleCollapseSettings(){
        setCollapseSettings(!collapseSettings);
    }
    const [posts, setPosts] = React.useState([{
        "name":"rara",
        "profile":"me.png",
        "time":"10:04:59 AM",
        "images":["lala.png","haha.png"],
        "files":["hehe.pdf","lelel.pdf"],
        "text":"what up my name is rarara makin a post",    
        "email": "raraje@gmail.com",
        "subject": "RARARA"
    }]);
    

    /* Theme Color State */
    const [theme,setTheme] = React.useState("dark")
    function toggleTheme(){
        if (theme=="dark"){setTheme("light")}
        else {setTheme("dark")}
    }


    /* The App Component */
    return (
        <R root t bt bb br bl theme={theme}>
        {/* This is the root rectangle ^^^ */}


            {/* Top Pane */}
            <R l bb s={"70px"} >
                <Branding />                                
                <Icon l ns onClick={toggleCollapseMenu}>bars</Icon>
                <R tel/>
                <R l ns s = {"200px"}>
                    <Auth hook={[authStatus,setAuthStatus]}></Auth>
                    <Icon onClick={toggleTheme}>moon</Icon>
                    <Icon onClick = {() => location.reload(true)}>cog</Icon>
                </R>
            </R>  
            

            {/*Everything Under Top Pane */}
            <R tel l>


                {/* Left Side Pane */}
                <R t ns br c={collapseMenu} s= {"240px"}>
                    <R l s = {"50px"}>
                        <C h s={"100px"}>
                            <h4>User Search : </h4>
                        </C>
                        <T tel ns>Search...</T>    
                    </R>        
                    <R tel bb bt t>
                        <User>Caleb69</User> 
                        <User>Ericc</User> 
                        <User>Jennypenny</User> 
                    </R>
                    <Credits />
                </R>


                {/* Writing Pane */}
                <R t tel>
                    <Posts posts = {posts}></Posts>
                </R>

                
            </R>
        </R>
    )
}

/* The credit/link to the original Plain Pad project */
function Credits(props){
    return(
        <R t {...pass(props)}>
            <C s={"100px"}> 
                <div style={{fontFamily:"monospace"}}>
                   App by <a href = "https://jacobhoffman.tk">Jacob Hoffman</a>
                   <br></br>
                   and Chimdi Alagor
                </div>
            </C>
        </R>
    )
}

function Auth(props) {

    const [authStatus,setAuthStatus] = props.hook

    const login = <a onClick = {()=>wapi.openAuthPortal()}>log in</a>

    const logout = <a onClick = {()=> {
        wapi.signOut();
        setAuthStatus(wapi.isSignedIn());
    }}>log out</a>


    return (<C s={"80px"} {...pass(props)}>
        <div style={{fontFamily:"monospace"}}>
            {authStatus?logout:login}
        </div>
    </C>)

}
function User(props){
    return (
        <C h s={"50px"} {...pass(props)}>
            {props.children}
        </C>
    )
}


/* Custom Rectangles.js Icon Component */
function Icon(props){
    const iconClass = "fa-"+props.children;
    return(
        <C s={"50px"} {...pass(props)}>
            <i className={"fa "+ iconClass +" fa-2x font-weight-bold"}></i>
        </C>
    )
}


/* Top Pane Site Branding Component */
function Branding(props){
    return(
        <R l {...pass(props)}>
            
                <C p = "0 0 0 22" s = {"70px"}>{/* Plain Pad Logo */}
                    <img src = {"alternative.png"} style={{height:"60%"}} />
                </C>
                
                <C mc s = {"120px"}>
                    <div style={{fontFamily:"monospace"}}><h3>Web10<br/> Social</h3></div>
                </C>

        </R>
    )
}

export {App};