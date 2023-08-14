import {TextEditor} from "./Editor"
import useLocalStorage from '../hooks/useLocalStorage'
function Notes(){
    const [code,setCode]=useLocalStorage("notes",'')
    return (
        <div className="notes" id="home">
            <div style={{width:"50%",marginLeft:"20%",marginTop:"5%"}}>
            <TextEditor 
             value={code}
             onChange={setCode}
            /></div>
        </div>
    )
}  
export default Notes;