import React, { useState} from "react";
import {CodeEditor} from "./Editor"
function ProgrammingNotepad(){
    var [lang, setLang] = useState("");
    let value=""; 
    // eslint-disable-next-line
    if (lang=="CPP" || lang=="C")
    value="c_cpp"
    else
    value=lang.toLowerCase();
    const [code,setCode]=useState("")
    return(
        <div id="home" className="about">
            <div style={{width:"50%",marginLeft:"20%",marginTop:"4%"}}>
                <label >
                    <input type="text" name="Language" list="listcourse" placeholder="Select Language" value={lang} onChange={(event)=>setLang(event.target.value)} autoComplete="false"/>
                    <datalist id="listcourse">
                        <option value="C"></option>
                        <option value="CPP"></option>
                        <option value="Java"></option>
                        <option value="Python"></option>
                        <option value="JavaScript"></option>
                        <option value="CSharp"></option>
                        <option value="Ruby"></option>
                        <option value="R"></option>
                        <option value="Php"></option>
                        <option value="Swift"></option>
                        <option value="Perl"></option>
                        <option value="Pascal"></option>
                        <option value="Rust"></option>
                        <option value="Fortran"></option>
                        <option value="Sql"></option>
                    </datalist>
                </label> 
                <CodeEditor mode={value} title={lang+" Notepad"}  value={code}
            onChange={setCode}/>
            <label><b>NOTE: </b>Compiler backend is not yet configured</label>
            </div>
        </div>
    )
}
export default ProgrammingNotepad;