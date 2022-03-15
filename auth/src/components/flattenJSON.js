// function for flattening json
const flattenJSON = (obj = {}, res = {}, extraKey = "") => {
    for (const key in obj) {
      if (typeof obj[key] !== "object") {
        res[extraKey + key] = obj[key];
      } else if (Object.keys(obj[key]).length === 0) {
        res[extraKey + key] = obj[key].constructor == Object ? "{}" : "[]";
      } else {
        flattenJSON(obj[key], res, `${extraKey}${key}.`);
      }
    }
    return res;
  };

export default flattenJSON;