function display(data){
  console.log(data)
  const apps = data["apps"]
  registeredUsers.innerHTML = data["users"];
  var mbs = (data["storage"]/(1024*1024)).toFixed(2);
  liberatedData.innerHTML = `${mbs}MB`;
  appCount.innerHTML = apps.length;
  totalVisits.innerHTML = apps.reduce((a, b) => a["visits"] + b["visits"], 0)
  displayApps(apps)
}

function displayApps(apps){
  appTable.innerHTML = ""
  const max = 20
  for (const i in apps){
    const app = apps[i];
    var appText = app["url"];
    if (appText.length>max) appText=appText.slice(0,max)
    appTable.innerHTML += ` <tr>
                              <td><a href="${app["url"]}">${appText}</a></td>
                              <td>${app["visits"]}</td>
                            </tr> `
  }
}

console.log("starting")
axios
  .post("http://api.localhost/stats")
  .then((response) => {
    display(response.data);
  })
  .catch((error) => console.log(error));

