import mockFeed from "./MockFeed";

// only take the posts that have my name for the wall.
const mockWall = mockFeed.filter((post)=>post.web10==="api.web10.app/jacoby149")

export default mockWall;