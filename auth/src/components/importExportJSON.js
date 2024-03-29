//IMPORTING

/* 
https://gomakethings.com/how-to-upload-and-process-a-json-file-with-vanilla-js/
<label for="file">File to upload</label>
<input type="file" id="importer" accept=".json">
<button onclick=handleSubmit>Upload</button>

/**
 * Handle submit events
 * @param  {Event} event The event object
 */
 
function handleSubmit (event) {
	event.preventDefault();
	var file = document.getElementById("importer")
	if (!file.value.length) return;
	let reader = new FileReader();
	reader.onload = pushFile;
	reader.readAsText(file.files[0]);
}

/**
 * Log the uploaded file to the console
 * @param {event} Event The file loaded event
 */

//promise chain importing
function pushFile (event) {
	let str = event.target.result;
	let json = JSON.parse(str);
  var curr = null;
  for (const [i, n] of json.entries()){
    if (curr===null){
      return//curr=wapi.create()
    }
    else curr = curr.then(()=>curr).catch()
  }
}

//exporting
function downloadObjJSON(obj, name) {
  var dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(obj));
  var downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", name + ".json");
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export {downloadObjJSON}