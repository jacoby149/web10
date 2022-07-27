/**************************************
 * Rectangles.js
 * Houses the R component [Rectangle]
 * The C component [Content Rectangle]
 * The T component [Text Rectangle]
 * pass 
 * - passes rectangle inheritance through new rectangle component definitions.
 * - see the demos.
 * startRectangles 
 * - a function in the framework that must be run after the main react render.
****************************************/
import r from 'react';
var React = window.React;
if (r) React = r;


/**************
 * React Components
 **************/

function T(props) {
  return (
    <C p="0px 15px 0px 15px"{...pass(props)}>
      <textarea className={"R " + props.theme} style={{ paddingTop: "18px", height: "100%", width: "100%", resize: "none" }} placeholder={props.children}></textarea>
    </C>
  )
}

function C(props) {
  const ha = props.ha ? props.ha : "left";
  const va = props.va ? props.va : "center";
  const p = props.p ? props.p : "0px 0px 0px 15px";
  return (
    <R {...pass(props)}>
      <R ns={props.ns} tel t h={props.h}>
        <div {...pass(props)} style={{ display: "flex", flexWrap: "wrap", height: "100%" }}>
          <div style={{ display: "flex", alignItems: va, width: "100%", justifyContent: ha, padding: p }}>
            {props.children}
          </div>
        </div>
      </R>
    </R>
  )
}

/* The Rectangle component */
function R(props) {

  /* concatenate dictionaries */
  function a(x, y) {
    return { ...x, ...y };
  }

  /* style dictionary */
  var style = {};

  /* float */
  const [t, b, l, r] = [props.t, props.b, props.l, props.r];
  var side = "top";
  if ((t + b + l + r) > 1) console.log("warning conflicting tblrs ! ");
  if (t) { side = "top"; }
  if (b) { side = "bottom"; }
  if (l) { side = "left"; }
  if (r) { side = "right"; }


  if (l || r) { style = a(style, { writingMode: "vertical-lr" }); }
  else if (t || b) { style = a(style, { writingMode: "horizontal-tb" }); }

  /* border sides */
  const [bt, bb, bl, br] = [props.bt, props.bb, props.bl, props.br];
  if (bt) { style = a(style, { borderTopStyle: "solid" }); }
  if (bb) { style = a(style, { borderBottomStyle: "solid" }); }
  if (bl) { style = a(style, { borderLeftStyle: "solid" }); }
  if (br) { style = a(style, { borderRightStyle: "solid" }); }

  /* noscroll shouldn't be needed....*/
  if (props.ns) { style = a(style, { overflow: "hidden" }); }
  if (props.h) { style = a(style, {}); }

  /* rect size */
  const v = (!props.ps || props.ps == "top" || props.ps == "bottom");
  var [s, ms] = [props.s, props.ms];

  if (!props.root) {
    if (!s) { s = "auto"; }
    if (v) { style = a(style, { height: s, width: "100%" }); } /* for now */
    else { style = a(style, { width: s, height: "100%" }); }
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
  if (props.c) {
    style = a(style, { display: "none" });
  } /* for now */


  const isTel = props.tel ? "tel " : "nottel ";
  const isHover = props.h ? "h " : "";
  const ismc = props.mc ? "mc " : "";
  const ismsc = props.msc ? "msc " : "";
  const root = props.root ? "root " : "";
  const theme = props.theme + " ";

  const className = "R " + root + theme + isTel + isHover + ismc + ismsc + props.className;
  return (
    <div childfloat={side}
      className={className}
      style={{ ...style, ...props.style }}>
      {updatedChildren}

    </div>
  )
}


/*************************
 * functional helpers
 *************************/

function pass(props) {
  const objectMap = (obj, fn) =>
    Object.fromEntries(
      Object.entries(obj).map(
        ([k, v], i) => [k, fn(v, k, i)]
      )
    )

  return objectMap(props, v => v === true ? "true" : (v === false ? "false" : v))
}

function initTelescope() {
  const telescope = {};
  telescope.adjust = function (tel, sibs, floatSide, hb, vb) {
    const telescopicElement = tel[0];
    if (floatSide == "left" || floatSide == "right") {
      var remainingWidth = sibs.reduce(
        (accumulator, child) => accumulator + child.offsetWidth,
        0
      );
      telescopicElement.style.width = `calc(100% - ${remainingWidth + hb}px)`;
    } else if (floatSide == "top" || floatSide == "bottom") {
      var remainingHeight = sibs.reduce(
        (accumulator, child) => accumulator + child.offsetHeight,
        0
      );
      telescopicElement.style.height = `calc(100% - ${remainingHeight + vb}px)`;
    } else
      console.error("telescope.js side error, neither horizontal or vertical");
  };

  // recursively adjust the webpage based on window size change
  telescope.telescope = function (div) {
    const children = [...div.childNodes].filter((e) =>
      e.classList.contains("R")
    );
    const tel = [...children].filter((e) => e.classList.contains("tel"));
    const sibs = [...children].filter((e) => e.classList.contains("nottel"));
    const floatSide = div.getAttribute("childfloat");
    const hb = (div.hasAttribute("br") ? 1 : 0) + (div.hasAttribute("bl") ? 1 : 0);
    const vb = (div.hasAttribute("bt") ? 1 : 0) + (div.hasAttribute("bb") ? 1 : 0);
    if (tel.length == 1) telescope.adjust(tel, sibs, floatSide, hb, vb);
    else if (tel.length > 1)
      console.error("Warning. too many telescopic rects.");

    /* always recurse */
    children.map((child) => telescope.telescope(child));
  };
  telescope.start = function (root) {
    const e = () => telescope.telescope(root);
    window.addEventListener("resize", e);
    window.addEventListener("click", e);

    //watch mutations too
    const observer = new MutationObserver(e);
    observer.observe(root, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    telescope.telescope(root);
    return () => {
      window.removeEventListener("resize", e);
      window.removeEventListener("click", e);
      observer.disconnect();
    };
  };
  return telescope;
}

function startRectangles(root) {
  window.telescope = initTelescope();
  window.telescope.start(root);
}


/************
 * Exports
 ************/

export { pass, R, C, T, startRectangles };