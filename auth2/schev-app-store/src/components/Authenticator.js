import React from 'react';
import {pass,R,C,T,startRectangles} from 'rectangles-npm'
import BookmarkBar from './BookmarkBar';

/* Plain Pad app made of entirely rectangles.js components */
function Authenticator(props){


    /* Menu Collapsed State */
    const [collapse,setCollapse] = React.useState(false);
    function toggleCollapse(){
        setCollapse(!collapse);
    }


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
                <Icon l ns onClick={toggleCollapse}>bars</Icon>
                <R tel />
                <R l ns s = {"160px"}>
                    <Icon>user-circle</Icon>
                    <Icon onClick={toggleTheme}>moon</Icon>
                    <Icon>file</Icon>
                </R>
            </R>  
            
            {/* Bookmark Pane */}

            <BookmarkBar setMode = {props.setMode}></BookmarkBar>

            {/* Bottom Section */}
            <R tel l>


                {/* Side Pane */}
                <R t ns br c={collapse} s= {"240px"}>
                    <R l s = {"50px"}>
                        <C h s={"100px"}>
                            <h4>Search Bar : </h4>
                        </C>
                        <T tel ns>Search...</T>    
                    </R>        
                    <R tel bb bt t>
                        <Note>Note 1 :)</Note> 
                        <Note>Note 2 :)</Note> 
                        <Note>Note 3 :)</Note> 
                    </R>
                    <Credits />
                </R>


                {/* Writing Pane */}
                <R tel t >
                    <T tel>Write a note here...</T>
                </R>

                
            </R>
        </R>
    )
}


/* The credit/link to the original Plain Pad project */
function Credits(props){
    return(
        <R t {...pass(props)}>
            <C s={"70px"}> 
                <div style={{fontFamily:"monospace"}}>
                    <a href = "https://alextselegidis.com/try/plainpad-standalone/#/notes">Plain Pad</a>&nbsp;UI Copy in Rectangles.js
                </div>
            </C>
        </R>
    )
}


/* A custom sub class of Content(C). (Which makes it a subclass of (R))
/* For Custom Rectangle subclasses, make sure to pass props.ps through. */
function Note(props){
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
            
                <C l p = "0 0 0 22px" s = {"70px"}>{/* Plain Pad Logo */}
                    <img src = {"/logo512.png"} style={{height:"60%"}} />
                </C>
                
                <C l ns mc s = {"120px"}>
                    <div style={{fontFamily:"monospace"}}><h3>Plainpad<br/> Design Copy</h3></div>
                </C>

        </R>
    )
}

export default Authenticator;