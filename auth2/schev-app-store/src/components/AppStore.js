import React from 'react';
import { pass, R, C, T, startRectangles } from 'rectangles-npm'
import BookmarkBar from './BookmarkBar';
import AppListing from './AppListing';
import './AppStore.css';
import mockPage from './mockAppData';

/* Plain Pad app made of entirely rectangles.js components */
function AppStore({ setMode }) {



    /* Menu Collapsed State */
    const [collapse, setCollapse] = React.useState(false);
    function toggleCollapse() {
        setCollapse(!collapse);
    }


    /* Theme Color State */
    const [theme, setTheme] = React.useState("dark")
    function toggleTheme() {
        if (theme == "dark") { setTheme("light") }
        else { setTheme("dark") }
    }


    let appRows=mockPage.map((row,index)=>{
        const titles = row.map((e)=> e.title)
        const descriptions = row.map((e)=> e.description)
        return <AppRow key={index} titles ={titles} descriptions={descriptions}></AppRow>
    })


    /* The App Component */
    return (
        <R root t bt bb br bl theme={theme}>
            {/* This is the root rectangle ^^^ */}


            {/* Top Pane */}
            <R l bb s={"70px"} >
                <Branding />


                <C t tel >
                    <div class="field" style={{ marginLeft: "20px", marginRight: "20px" }}>
                        <div className="control has-icons-left has-icons-right">
                            {/* change the color of the placeholder below */}
                            <input className="input is-success textInput" type="text" placeholder="Search" style={{ color: "white" }} />
                            <span className="icon is-small is-left" style={{ color: "white" }}>
                                <i className="fas fa-search"></i>
                            </span>
                        </div>
                    </div>
                </C>
                <R l ns s={"160px"}>
                    <Icon>user-circle</Icon>
                    <Icon onClick={toggleTheme}>moon</Icon>
                    <Icon>file</Icon>
                </R>
            </R>

            {/* Bookmark Pane */}

            <BookmarkBar setMode={setMode}></BookmarkBar>

            {/* Bottom Section */}
            <R tel l>

                {/* App Dir */}
                <R tel t >
                    {appRows}
                    <div class="columns" style={{ width: "100%" }}>
                        <div class="column"></div>
                        <div class="column">
                            <div class="snippet" data-title=".dot-fire">
                                <div class="stage">
                                    <div class="dot-fire"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                </R>


            </R>
        </R>

    )
}

function AppRow({titles, descriptions}) {
    return(
    <div class="columns" style={{ width: "100%" }}>
        <div class="column">
            <AppListing title={titles[0]} description={descriptions[0]}></AppListing>
        </div>
        <div class="column">
            <AppListing title={titles[1]} description={descriptions[1]}></AppListing>
        </div>
        <div class="column">
            <AppListing title={titles[2]} description={descriptions[2]}></AppListing>
        </div>
    </div>
)}

/* The credit/link to the original Plain Pad project */
function Credits(props) {
    return (
        <R t {...pass(props)}>
            <C s={"70px"}>
                <div style={{ fontFamily: "monospace" }}>
                    <a href="https://alextselegidis.com/try/plainpad-standalone/#/notes">Plain Pad</a>&nbsp;UI Copy in Rectangles.js
                </div>
            </C>
        </R>
    )
}


/* A custom sub class of Content(C). (Which makes it a subclass of (R))
/* For Custom Rectangle subclasses, make sure to pass props.ps through. */
function Note(props) {
    return (
        <C h s={"50px"} {...pass(props)}>
            {props.children}
        </C>
    )
}


/* Custom Rectangles.js Icon Component */
function Icon(props) {
    const iconClass = "fa-" + props.children;
    return (
        <C s={"50px"} {...pass(props)}>
            <i className={"fa " + iconClass + " fa-2x font-weight-bold"}></i>
        </C>
    )
}


/* Top Pane Site Branding Component */
function Branding(props) {
    return (
        <R l {...pass(props)}>

            <C l p="0 0 0 22px" s={"70px"}>{/* Plain Pad Logo */}
                <img src={"/logo512.png"} style={{ height: "60%" }} />
            </C>

            <C l ns mc s={"120px"}>
                <div style={{ fontFamily: "monospace" }}><h3>Plainpad<br /> Design Copy</h3></div>
            </C>

        </R>
    )
}

export default AppStore;

