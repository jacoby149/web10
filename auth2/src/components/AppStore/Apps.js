function AppListing({ title, img,hits }) {
    const placeHolderImg = "https://bulma.io/images/placeholders/128x128.png";
    return (
        <div className="box" style={{ margin: "0px 10px 20px 10px", backgroundColor: "#00000000" }}>
            <div className="card-image">
                <figure className="image is-2by2">
                    <img style={{ borderRadius: "10px" }} src={img?img:placeHolderImg} alt="Placeholder image" />
                </figure>
            </div>
            <article className="media">
                <div className="media-content">
                    <div className="content" style={{ marginTop: "10px" }}>
                        <p>
                            <strong>{title}</strong> <br></br><small>{hits} hits</small>
                        </p>
                    </div>
                </div>
            </article>
        </div>)
}

function Apps({ I }) {
    const apps = I.apps.map((e,index) =>
        <div key={index } style={{width:"150px",display:"inline-block"}}>
            <AppListing title={e.title} img={e.img} hits={e.hits.toLocaleString()}></AppListing>
        </div>

    )
    return (
        <div className="center-container app-container">
            {apps}
        </div>
    )
}

export { Apps };