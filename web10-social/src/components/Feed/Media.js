function Content({ type, src, I, postI }) {
    const content = type === "image" ?
        <img style={{ marginTop: "5px", marginRight: "5px", height: "128px" }} src={src} /> :
        <video src={src} style={{ height: "128px", marginTop: "5px", marginRight: "5px" }} controls >
            Your browser does not support audio in video tag.
        </video>

    return content;
}

function Media({ type, src, I, postI,idx }) {
    return (<div style={{display: "inline-block"}}>
        {postI.mode === "view" ?
            "" :
            <i onClick={()=>postI.deleteMedia(idx)} style={{ position: "absolute", color: "#ffff77dd", marginTop: "8px", marginLeft: "5px",zIndex:1 }} className={"fa fa-2x fa-rectangle-xmark font-weight-bold"}></i>}
        {
            postI.mode === "create" ?
                <Content type={type} src={src}></Content>
                :
                <Content type={type} src={src}></Content>}
    </div>
    );

}

export default Media;