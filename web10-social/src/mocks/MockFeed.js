import mockMedia from "./MockMedia";
import pondPic from "../assets/images/pond.jpg"
import brickPic from "../assets/images/brick.jpg"
import rocksPic from "../assets/images/rocks.jpg"
import squarePic from "../assets/images/square.jpg"
import waterPic from "../assets/images/water.jpg"
import waterfallPic from "../assets/images/waterfall.jpg"

const [pond,brick,rocks,square,water,waterfall] = [
    {
        src:pondPic,
        type:"image"
    },
    {
        src:brickPic,
        type:"image"
    },
    {
        src:rocksPic,
        type:"image"
    },
    {
        src:squarePic,
        type:"image"
    },
    {
        src:waterPic,
        type:"image"
    },
    {
        src:waterfallPic,
        type:"image"
    },
]

const mockFeed = [
    {
        _id:"4759860609",
        web10: "api.web10.app/emily511",
        time: "10:04:59 AM",
        media: [pond],
        html:
            "what up my name is emily makin a post",
    },
    {
        _id:"475983245209",
        web10: "api.web10.app/jacoby149",
        time: "10:04:59 AM",
        media: [brick,rocks],
        html:
            "I wanted to share! I had this _idea for a new internet platform, that I call web10. It gives every user on the internet a domain name for them to control their data. One more time for posterity, it is called web10, it is totally awesome and the future of the internet.",
    },
    {
        _id:"4759",
        web10: "api.web10.app/lilly511",
        time: "10:04:59 AM",
        media: [square,water,waterfall],
        html:
            "what up my name is lilly i am also makin a post",
    },
    {
        _id:"4759209387",
        web10: "api.web10.app/jacoby149",
        time: "10:04:59 AM",
        media: [mockMedia[1],mockMedia[2]],
        html: "This is <i>jacob</i>, making my <b>first</b> post haha.",
    },
    {
        _id:"475920938723498",
        web10: "api.web10.app/tom511",
        time: "10:04:59 AM",
        media: [],
        html: "my name is tom! :)",
    }
]

export default mockFeed;