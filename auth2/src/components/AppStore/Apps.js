import useAppListingInterface from "../../interfaces/appListingInterface";

// initApp is the app data before pulling the apps website
function AppListing({ initApp }) {
    const appI = useAppListingInterface(initApp);
    const app = appI.getApp();

    const placeHolderImg = "https://bulma.io/images/placeholders/128x128.png";
    return (
        <div onClick={()=>window.open(app.href, "_blank")} className="box" style={{ margin: "0px 10px 20px 10px", backgroundColor: "#00000000" }}>
            <div className="card-image">
                <figure className="image is-2by2">
                    <img style={{ borderRadius: "10px" }} src={app.img?app.img:placeHolderImg} alt="Placeholder image" />
                </figure>
            </div>
            <article className="media">
                <div className="media-content">
                    <div className="content" style={{ marginTop: "10px" }}>
                        <p>
                            <strong>{app.title}</strong> <br></br><small>{app.hits} hits</small>
                        </p>
                    </div>
                </div>
            </article>
        </div>)
}

function Apps({ I }) {
    const apps = I.apps.map((initApp,index) =>
        <div key={index } style={{width:"150px",display:"inline-block"}}>
            <AppListing initApp={initApp}></AppListing>
        </div>

    )
    return (
        <div className="center-container app-container">
            {apps}
        </div>
    )
}

export { Apps };