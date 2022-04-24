//////////////////////
// global variables
//////////////////////
var contacts = [];
var contactIndex = -1;
var viewingType = "notes";
//////////////////////////
/// CRM Init. functions
//////////////////////////

//change view to logged in and initialize contacts
function crmInit() {
  auth.innerHTML = "Secure Log Out";
  loadContacts();
}

///////////////////////
//// WEB10 SETUP
///////////////////////

/* wapi initialization */
//var wapi = wapiInit("https://auth.web10.app")

var wapi =
  window.location.hostname == "crm.localhost"
    ? wapiInit("http://auth.localhost")
    : window.location.hostname == "crm.web10.dev"
      ? wapiInit("https://auth.web10.dev")
      : wapiInit("https://auth.web10.app");

/* Web10 Login / Log out */
if (!wapi.isSignedIn()) wapi.authListen(crmInit);
else crmInit();

function Auth() {
  if (wapi.isSignedIn()) {
    wapi.signOut();
    location.reload();
  } else {
    wapi.openAuthPortal();
  }
}

/* Web10 service change request */
/* requests access to the crm-contacts, crm-notes, and crm-ledges services */
/* doesn't allow inbound from others.*/
const sirs = [
  {
    service: "crm-contacts",
    cross_origins: ["crm.localhost", "crm.web10.app", "crm.web10.dev"],
  },
  {
    service: "crm-notes",
    cross_origins: ["crm.localhost", "crm.web10.app", "crm.web10.dev"],
  },
  {
    service: "crm-ledges",
    cross_origins: ["crm.localhost", "crm.web10.app", "crm.web10.dev"],
  },
];
wapi.SMROnReady(sirs, []);

/////////////////////////////////
///// Read Load Functions
/////////////////////////////////

function loadContacts() {
  wapi.read("crm-contacts").then(function (response) {
    contacts = response.data;
    displayContacts();
  });
}

function loadNotes() {
  document.getElementById("newnote").value = "";
  const c = contacts[contactIndex];
  wapi.read("crm-notes", { id: c._id }).then(function (response) {
    displayModalBannerColor(c.color);
    document.getElementById(
      "myModalLabel"
    ).innerHTML = `${c.name}<a style="text-decoration: none;" class = 'statusbutton' onclick='incrementColor(${contactIndex})'> &#9851;</a>`;
    displayNotes(response.data);
  });
}



//////////////////////////////
//// Add/Create functions
//////////////////////////////

function addContact() {
  var contact = {
    name: userName.value,
    company: userCompany.value,
    phone: userPhone.value,
    email: userEmail.value,
    web10: userWeb10.value,
    color: "green",
  };

  wapi.create("crm-contacts", contact).then(function (response) {
    contacts.push(response.data);
    displayContacts();
    userName.value = "";
    userCompany.value = "";
    userPhone.value = "";
    userEmail.value = "";
    userWeb10.value = "";
  });
}

function submitNote() {
  var note = document.getElementById("newnote").value;
  wapi
    .create("crm-notes", {
      note: note,
      id: contacts[contactIndex]._id,
      date: new Date(),
    })
    .then(loadNotes);
}

////////////////////////////
///// Update functions
////////////////////////////

//rotates the color of a contact
function incrementColor(i) {
  const c = contacts[i];
  var new_color =
    c.color == "green"
      ? "red"
      : c.color == "red"
        ? "yellow"
        : c.color == "yellow"
          ? "green"
          : "green";
  const [query, values] = [{ _id: c._id }, { $set: { color: new_color } }];
  wapi.update("crm-contacts", query, values).then(function () {
    c.color = new_color;
    displayModalBannerColor(new_color);
    displayContacts();
  });
}

function updateContact() {
  var contact = {
    name: userNameUpdate.value,
    company: userCompanyUpdate.value,
    phone: userPhoneUpdate.value,
    email: userEmailUpdate.value,
    web10: userWeb10Update.value,
  };
  wapi
    .update("crm-contacts", { _id: contacts[contactIndex]._id }, { $set: contact })
    .then(loadContacts)
    .catch(
      (error) => (message.innerHTML = `${uF} : ${error.response.data.detail}`)
    );
}

/////////////////////////////
//// Deletion function
/////////////////////////////

function deleteContact(id) {
  // contact deletion link
  var i = 0;
  const ids = contacts.map((c) => c._id)
  const idx = ids.indexOf(id);
  if (idx != -1) {
    var contact = contacts[idx];
    var contactID = contact._id;
    wapi.delete("crm-contacts", contact).then(function () {
      contacts.splice(idx, 1);
      displayContacts();
      wapi.delete("crm-notes", { id: contactID })
    });
  }
}

function deleteNote(id) {
  wapi
    .delete("crm-notes", { _id: id })
    .then(loadNotes)
    .catch(
      (error) => (message.innerHTML = `${dF} : ${error.response.data.detail}`)
    );
}

////////////////////////////////////////
////////// validation functions
///////////////////////////////////////

function validateName() {
  var regex = /^[a-zA-Z0-9]+([a-zA-Z0-9](_|-| )[a-zA-Z0-9])*[a-zA-Z0-9]+$/;
  if (regex.test(userNameInp.value) == true) {
    document.getElementById("nameAlert").style.display = "none";
    return true;
  } else {
    document.getElementById("nameAlert").style.display = "block";
    return false;
  }
}

function validatePhone() {
  var regex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  if (regex.test(userPhoneInp.value) == true) {
    document.getElementById("phoneAlert").style.display = "none";
    return true;
  } else {
    document.getElementById("phoneAlert").style.display = "block";
    return false;
  }
}

function validateEmail() {
  var regex =
    /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  if (regex.test(userEmailInp.value) == true) {
    document.getElementById("mailAlert").style.display = "none";
    return true;
  } else {
    document.getElementById("mailAlert").style.display = "block";
    return false;
  }
}

////////////////////////////////////
////// Display Functions
////////////////////////////////////

function displayModalBannerColor(color) {
  notesmodalbanner.className = `${color} modal-header`;
}

function displayContacts() {
  var temp = ``;
  for (var i = 0; i < contacts.length; i++) {
    const c = contacts[i];

    // make the mail link
    const mailLink = function () {
      const m = c.email;
      const max = 25;
      const short_m = m && m.length > max ? `${m.slice(0, max_len)}...` : m;
      return m ? `<a href = "mailto:${m}" title = "${m}">${short_m}</a>` : "-";
    };

    // name link that toggles the modal data viewer
    var name = c.name ? c.name : "-";
    var nameLink = `<a href="#" data-bs-toggle="modal" data-bs-target="#notes" 
      onclick="contactIndex=${i};loadNotes()">${name}</a>`;

    var web10 = c.web10 ? c.web10 : "-";

    temp += `<tr class="${c.color}">
    <td>${nameLink}</td>
    <td>${c.company ? c.company : "-"}</td>
    <td>${c.phone ? c.phone : "-"}</td>
    <td>${mailLink()}</td>
    <td>${web10}</td>`
  }
  document.getElementById("tableBody").innerHTML = temp;
  searchFunction();
}

function displayNotes(notes) {
  var contact = contacts[contactIndex];
  userNameUpdate.value = contact.name;
  userCompanyUpdate.value = contact.company;
  userPhoneUpdate.value = contact.phone;
  userEmailUpdate.value = contact.email;
  userWeb10Update.value = contact.web10;

  var log = "";
  notes.sort((a, b) => a.data > b.date).reverse();
  for (var z = 0; z < notes.length; z++) {
    var note = notes[z].note;
    var date = notes[z].date;
    var id = notes[z]._id;

    log += `
      <b>${date}</b>
      <p>${note}</p>
      <!--<button onclick="updateNote('${id}')" class="btn btn-info btn-sm">update note</button>-->
      <button onclick="deleteNote('${id}')" class="btn btn-danger btn-sm">delete note</button>
      <br><br>`;
  }

  document.getElementById("note_log").innerHTML = log;
}

//////////////////////////////////////////
/////// Filter and Search Functions
/////////////////////////////////////////

//step at the beginning of the search function always.
function colorFilter() {
  var green = document.getElementById("green");
  var yellow = document.getElementById("yellow");
  var red = document.getElementById("red");
  var table = document.getElementById("myTable");
  var tr = table.getElementsByTagName("tr");
  for (var i = 0; i < tr.length; i++) {
    var row = tr[i];
    var rowclass = row.getAttribute("class");

    if (!red.checked && rowclass == "red") {
      row.style.display = "none";
    } else if (!yellow.checked && rowclass == "yellow") {
      row.style.display = "none";
    } else if (!green.checked && rowclass == "green") {
      row.style.display = "none";
    } else {
      row.style.display = "";
    }
  }
}

// filters displayed contacts by what is in the search field
function searchFunction() {
  var input, filter, table, tr, i, currname, currcomp, currphone, curremail;
  //first do color filtering
  colorFilter();
  input = document.getElementById("myInput");
  filter = input.value.toUpperCase();
  table = document.getElementById("myTable");
  tr = table.getElementsByTagName("tr");
  for (i = 0; i < tr.length; i++) {
    currname = tr[i].getElementsByTagName("td")[0];
    currcomp = tr[i].getElementsByTagName("td")[1];

    //TODO
    currphone = tr[i].getElementsByTagName("td")[2];
    curremail = tr[i].getElementsByTagName("td")[3];

    if (currname && currcomp) {
      currname = currname.textContent || currname.innerText;
      currcomp = currcomp.textContent || currcomp.innerText;
      if (currname.toUpperCase().indexOf(filter) > -1) {
        continue;
      } else if (currcomp.toUpperCase().indexOf(filter) > -1) {
        continue;
      } else {
        tr[i].style.display = "none";
      }
    }
  }
}
