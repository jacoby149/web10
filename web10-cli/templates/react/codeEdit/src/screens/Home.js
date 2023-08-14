import {Link} from "react-router-dom"
function Home(){
    return(
        <div id="home"  height="100%" style={{ minHeight: '100%' }}>
            <div className="left" style={{ minHeight: '100%' }}>
                <h1>Create</h1>
                <h1>Compile</h1>
                <h1>Collaborate</h1>
                <br />
                <h2>Anytime, Anyplace</h2>
                <br />
                <Link to="/coding"><button className="button"><i className="far fa-arrow-alt-circle-right"></i><span className="span1">  Get Started</span></button></Link>
            </div>
            <div className="right"style={{ minHeight: '100%' }} >
            <img src="https://res.cloudinary.com/yash06/image/upload/v1611999021/Project%20Images/svg-pro-features_kil6lz.svg"  width="590px" alt="avator"/>
            </div>
        </div>
    )
}
export default Home;