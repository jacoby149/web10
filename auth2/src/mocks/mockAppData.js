import authImg from "../assets/images/key_white.png"
import socialImg from "../assets/images/alternative.png"
import stealthImg from "../assets/images/stealth.jpg"
import fpsImg from "../assets/images/shooter.jpeg"
import crmImg from "../assets/images/GreenStarWhite.png"
import boxImg from "../assets/images/building.png"

var mockPage = [
    {
        title: "web10 auth",
        description: "description1",
        href:"http://auth.localhost",
        img : authImg,
        hits:1194,
    },
    {
        title: "web10 social",
        description: "description2",
        href:"http://localhost:3001",
        img : socialImg,
        hits:785,
    },
    {
        title: "crm",
        description: "description3",
        href:"https://crm.web10.app",
        img : crmImg,
        hits:535,
    },
    {
        title: "ball shooter",
        description: "description3",
        href:"https://jacobhoffman.tk/fps",
        img : fpsImg,
        hits:228,
    },
    {
        title: "painter",
        description: "description3",
        href:"https://threejs.org/examples/webgl_interactive_voxelpainter.html",
        img : boxImg,
        hits:37,
    },
]

export default mockPage;