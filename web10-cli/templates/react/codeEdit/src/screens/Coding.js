import React, { useState, useEffect } from "react";
import SplitPane from 'react-split-pane';
import { CssEditor, HtmlEditor, JavascriptEditor } from "./Editor";
import useLocalStorage from '../hooks/useLocalStorage'
function CodeEditor() {
  const [heightValue, setHeightValue] = useState("520px");
  const [codehtml, setCodehtml] = useLocalStorage('html','');
  const [codecss, setCodecss] = useLocalStorage('css','');
  const [codejs, setCodejs] = useLocalStorage('js',''); 
  const [outputValue, setOutputValue] = useState("");
   // eslint-disable-next-line
  useEffect(() => {
    const output = `<html>
                    <style>
                    ${codecss}
                    </style>
                    <body>
                    <script type="text/javascript">
                    ${codejs}
                    </script>
                    ${codehtml}
                    </body>
                  </html>`;
    setOutputValue(output);
  });

  return (
    <div id="home">
     <SplitPane
      split="horizontal"
      minSize={"50%"}
      onDragFinished={(height) => {
        setHeightValue(`${height - 40}px`);
      }}
    >
      <SplitPane split="vertical" minSize={"33%"}>
        <HtmlEditor
          height={heightValue}
          value={codehtml}
          onChange={setCodehtml}
        />
        <SplitPane split="vertical" minSize={"50%"}>
          <CssEditor
            height={heightValue}
            value={codecss}
            onChange={setCodecss}
          />
          <JavascriptEditor
            height={heightValue}
            value={codejs}
            onChange={setCodejs}
          />
        </SplitPane>
      </SplitPane>
      <iframe srcDoc={outputValue} width="100%" height="100%" style={{backgroundColor:"white"}} title="Preview"/>
    </SplitPane>
    </div>
  );
}

export default CodeEditor;