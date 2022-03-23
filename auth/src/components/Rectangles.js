import r from 'react';
var React = window.React;
if (r) React = r;

function pass(props){
  const objectMap = (obj, fn) =>
  Object.fromEntries(
    Object.entries(obj).map(
      ([k, v], i) => [k, fn(v, k, i)]
    )
  )
  
  return objectMap(props,v=>v===true?"true":(v===false?"false":v))
}

function T(props){
  return(
  <C p = "0px 15px 0px 15px"{...pass(props)}>
    <textarea className = {"R " + props.theme} style={{paddingTop:"18px",height:"100%",width:"100%",resize:"none"}} placeholder={props.children}></textarea>
  </C>
  )
}


function C(props){
    const ha = props.ha?props.ha:"left";
    const va = props.va?props.va:"center";
    const p = props.p?props.p:"0px 0px 0px 15px";
    return (
        <R {...pass(props)}>
            <R ns = {props.ns} tel t h={props.h}>
                <div {...pass(props)} style = {{display:"flex",flexWrap:"wrap",height:"100%"}}>
                  <div style={{display:"flex",alignItems:va,width:"100%",justifyContent:ha,padding:p}}>
                    {props.children}
                  </div>
                </div>
            </R>
        </R>
    )
}




/* The Rectangle component */
function R(props){
  
    /* concatenate dictionaries */
    function a(x,y){
        return {...x,...y};
    }

    /* style dictionary */
    var style = {};

    /* float */
    const [t,b,l,r] = [props.t,props.b,props.l,props.r];
    var side = "top";
    if ((t+b+l+r) > 1) console.log("warning conflicting tblrs ! ");
    if (t){side="top";}
    if (b){side="bottom";}
    if (l){side="left";}
    if (r){side="right";}
    
    
    if (l || r){style=a(style,{writingMode:"vertical-lr"});}
    else if (t || b){style=a(style,{writingMode:"horizontal-tb"});}

    /* border sides */
    const [bt,bb,bl,br] = [props.bt,props.bb,props.bl,props.br];
    if (bt){style=a(style,{borderTopStyle:"solid"});}
    if (bb){style=a(style,{borderBottomStyle:"solid"});}
    if (bl){style=a(style,{borderLeftStyle:"solid"});}
    if (br){style=a(style,{borderRightStyle:"solid"});}

    /* noscroll shouldn't be needed....*/
    if (props.ns){style=a(style,{overflow:"hidden"});}
    if (props.h){style=a(style,{});}

    /* rect size */
    const v = (!props.ps || props.ps == "top" || props.ps == "bottom");
    var [s,ms] = [props.s,props.ms];

    if (!props.root){
        if (!s){s="auto";}
        if (v){style= a(style,{height:s,width:"100%"} );} /* for now */
        else {style=a(style,{width:s,height:"100%"});}
    }

    /* pass float orientation to children */
    const updatedChildren = React.Children.map(
      props.children,
      (child, i) => {
        return React.cloneElement(child, {
        //this properties are available as a props in child components
          ps: side,
          theme: props.theme
        });
      }
    );

    /* if collapsed */
    if (props.c){
      style= a( style,{display:"none"} );
    } /* for now */

    
    const isTel = props.tel ? "tel ":"nottel ";
    const isHover = props.h ? "h ":"";
    const ismc = props.mc ? "mc ":"";
    const ismsc = props.msc ? "msc ":"";
    const root = props.root ? "root ":"";
    const theme = props.theme + " ";

    const className = "R " + root + theme + isTel + isHover +ismc +ismsc+ props.className;
    return (
        <div childfloat={side}
            className = {className}
                style = {{...style,...props.style}}>
            {updatedChildren}
        
        </div>
    )
}

export {pass,R,C,T};