import React from "react";
import AceEditor from "react-ace";
import 'brace/mode/text'
import 'brace/mode/javascript'
import 'brace/mode/html'
import 'brace/mode/css'
import 'brace/mode/c_cpp'
import 'brace/mode/python'
import 'brace/mode/r'
import 'brace/mode/ruby'
import 'brace/mode/java'
import 'brace/mode/sql'
import 'brace/mode/php'
import 'brace/mode/pascal'
import 'brace/mode/perl'
import 'brace/mode/swift'
import 'brace/mode/csharp'
import 'brace/mode/rust'
import 'brace/mode/fortran'
import 'brace/theme/monokai'
import styles from "./Editors.module.css";
export const CodeEditor =(props)=>{
  return <Editor theme={"monokai"} {...props} />;
};
export const TextEditor=(props)=>{
    return <Editor mode="text" title={"Notes"} theme={"monokai"} {...props} />;
};
export const JavascriptEditor = (props) => {
  return <Editor mode="javascript" theme="monokai" title={"JS"}  {...props} />;
};
export const HtmlEditor = (props) => {
  return <Editor mode="html" title={"HTML"} theme={"monokai"} {...props} />;
};
export const CssEditor = (props) => {
  return <Editor mode="css" title={"CSS"} theme={"monokai"} {...props} />;
};
const Editor = ({ mode, onChange, value, title, height ,theme}) => {
  return  (
    <div className={styles.editorContainer}>
      <div className={styles.editorTitle}>{title}</div>
      <AceEditor 
        mode={mode}
        name={title}
        theme={theme}
        onChange={onChange}
        fontSize={16}
        width={"100%"}
        height={height}
        value={value}
        showPrintMargin={true}
        showGutter={true}
        tabSize={2}
        setOptions={{ useWorker: false }}
      />
    </div>
  );
};
