// function for flattening json
const flattenJSON = (obj = {}, res = {}, extraKey = "") => {
  for (const key in obj) {
    if (typeof obj[key] !== "object") {
      res[extraKey + key] = obj[key];
    } else {
      res[extraKey + key] =
        obj[key].constructor == Object ? `{${Object.keys(obj[key]).length}↴` : `[${obj[key].length}↴`;
      flattenJSON(obj[key], res, `${extraKey}${key}.`);
    }
  }
  return res;
};

export default flattenJSON;
