/* Web10 Login / Log out */
function setAuth(authStatus) {
  if (authStatus) auth.innerHTML = "Secure Log Out";
  else auth.innerHTML = "Secure Login";
}
setAuth(wapi.isSignedIn());
wapi.authListen(setAuth);

function toggleAuth() {
  if (wapi.isSignedIn()) {
    wapi.signOut();
    setAuth(false);
  } else {
    wapi.openAuthPortal();
  }
}

/* Web10 service change request */
/* requests access to the crm-contacts, crm-notes, and crm-ledges services */
/* doesn't allow inbound from others.*/
const sirs = [
  {
    body: {
      service: "crm-contacts",
      cross_origins: ["crm.localhost"],
    },
  },
  {
    body: {
      service: "crm-notes",
      cross_origins: ["crm.localhost"],
    },
  },
  {
    body: {
      service: "crm-ledges",
      cross_origins: ["crm.localhost"],
    },
  },
];
wapi.serviceModRequester.requestOnReady(sirs,[]);

/* Web10 CRM Code */

//global variables
var userContacts = {};
var currentIndex = -1;
var userNameInp = document.getElementById("userName");
var userPhoneInp = document.getElementById("userPhone");
var userEmailInp = document.getElementById("userEmail");
var userCompanyInp = document.getElementById("userCompany");
var inps = document.getElementsByTagName("input");
var appStatus = "notes";

//initialize contacts,notes,and ledges from Web10
function init() {
  try {
  } catch (error) {
    if ("Not Authorized" in error) {
      wapi.openAuthPortal();
    }
  }
  var contacts = wapi.read("crm-contacts");
  if (contacts) loadUserContacts(contacts);
}

init();

function toggleStatus() {
  var button = document.getElementById("statusbutton");
  if (button.innerHTML == "Viewing Ledger") {
    button.innerHTML = "Viewing Notes";
    appStatus = "notes";
  } else {
    button.innerHTML = "Viewing Ledger";
    appStatus = "ledger";
  }
  displayData();
}

function loadUserContacts(json) {
  console.log("loading data...");
  //    console.log(json);
  userContacts = JSON.parse(json);
  console.log(userContacts);
  displayData();
}

function modalBannerColor(color) {
  document.getElementById("modalbanner").className = "modal-header " + color;
}

function JSPushContact(id) {
  //Add a contact to our global contacts object with ID returned from MYSQL
  var contacts = {
    name: userNameInp.value,
    company: userCompanyInp.value,
    phone: userPhoneInp.value,
    email: userEmailInp.value,
    id: id,
    color: "yellow",
  };
  userContacts.push(contacts);

  //Display the correct contacts
  displayData();
  clearInputs();
  var jsonContacts = JSON.stringify(userContacts);
}

function addContact() {
  //Make a contact object to submit to MYSQL
  var contact = {
    name: userNameInp.value,
    company: userCompanyInp.value,
    phone: userPhoneInp.value,
    email: userEmailInp.value,
  };

  wapi.create("crm-contacts", contact, JSPushContact);
}

function JSFlipContact(i) {
  function JSFlipContactInner() {
    console.log(i);
    var contact = userContacts[i];
    var green = contact.color == "green";
    var yellow = contact.color == "yellow";
    var red = contact.color == "red";
    var new_color = green ? "red" : red ? "yellow" : yellow ? "green" : "NULL";
    contact.color = new_color;
    modalBannerColor(new_color);
    displayData();
  }
  return JSFlipContactInner;
}

//flips the status of a contact
function flip(i) {
  var contact = userContacts[i];
  console.log("toggling status");
  wapi.update("crm-contacts", contact, JSFlipContact(i));
}

function displayData() {
  var temp = "";

  console.log(userContacts);

  for (var i = 0; i < userContacts.length; i++) {
    var m = userContacts[i].email;
    var short_m = m;

    var max_len = 25;
    if (m && m.length > max_len) {
      short_m = m.slice(0, max_len) + "...";
    }

    var mail =
      '<a href = "mailto:' + m + '" title = "' + m + '">' + short_m + "</a>";
    if (!m) {
      mail = "-";
    }

    var id = userContacts[i].id;
    var company = userContacts[i].company;
    var name = userContacts[i].name;
    var status = userContacts[i].color;
    if (!name) {
      name = "-";
    }
    var modalName =
      '<a href="#" data-toggle="modal" data-target="#' +
      appStatus +
      '" onclick="loadAll(' +
      i +
      ')">' +
      name +
      "</a>";
    var phone = userContacts[i].phone;
    if (!phone) {
      phone = "-";
    }

    temp +=
      "<tr class='" +
      status +
      "'><td>" +
      modalName +
      "</td><td>" +
      company +
      "</td><td>" +
      phone +
      "</td><td>" +
      mail +
      "</td><td><a onclick=\"deleteContact('" +
      name +
      '\')" class="text-danger"><i class="fas fa-minus-circle"></i></a>';
  }
  document.getElementById("tableBody").innerHTML = temp;
  searchFunction();
}

function fillNotes(notes) {
  notes = JSON.parse(notes);
  var log = "";

  for (var z = 0; z < notes.length; z++) {
    var note = notes[z].note;
    var date = notes[z].date;

    log += "<b>" + date + "</b><p>" + note + "</p>";
  }

  document.getElementById("note_log").innerHTML = log;
}

function fillLedger(entries) {
  entries = JSON.parse(entries);
  console.log(entries);
  var log = "";
  for (var z = 0; z < entries.length; z++) {
    var description = entries[z].description;
    var date = entries[z].date;
    var amount = entries[z].amount;
    var recurring = entries[z].recurring;
    var check_number = entries[z].check_number;

    log +=
      "<div class = 'ledge'>" +
      "<p><b>" +
      date +
      "</b></p><p>" +
      "Recurring? : " +
      recurring +
      "</p><p>" +
      "Check Num. : " +
      check_number +
      "</p><p>" +
      "Amount ($) : " +
      amount +
      "</p><p>" +
      "Description: " +
      description +
      "</p>" +
      "</div > ";
  }

  document.getElementById("ledger_log").innerHTML = log;
}

function loadNotes(i) {
  var contact = userContacts[i];
  modalBannerColor(contact.color);
  console.log(contact.color);
  document.getElementById("myModalLabel").innerHTML =
    contact.name +
    " <a class = 'statusbutton' onclick='flip(" +
    i +
    ")'> &#9851;</a> &#128337;";
  currentIndex = i;
  console.log("Index Changed To : " + currentIndex);
  var id = contact.id;
  wapi.read("crm-notes", { id: id }, fillNotes);
}

function loadLedger(i) {
  var contact = userContacts[i];
  modalBannerColor(contact.color);
  console.log(contact.color);
  document.getElementById("ledgerlabel").innerHTML =
    contact.name +
    " <a class = 'statusbutton' onclick='flip(" +
    i +
    ")'> &#9851;</a>";
  currentIndex = i;
  console.log("Index Changed To : " + currentIndex);
  var id = contact.id;
  wapi.read("crm-ledges", { id: id }, fillLedger);
}

function loadAll(i) {
  loadNotes(i);
  loadLedger(i);
}

function loadCurrent() {
  document.getElementById("newnote").value = "";
  document.getElementById("ledgerform").reset();
  return loadAll(currentIndex);
}

function submitNote() {
  var note = document.getElementById("newnote").value;

  wapi.post(
    "crm-notes",
    { note: note, id: userContacts[currentIndex].id },
    loadCurrent
  );
}

function submitLedger() {
  var form = {};
  $("#ledgerform")
    .serializeArray()
    .map(function (x) {
      form[x.name] = x.value;
    });
  form.id = userContacts[currentIndex].id;
  wapi.create("crm-ledges", form, loadCurrent);
}

function clearInputs() {
  for (var i = 0; i < inps.length; i++) {
    inps[i].value = "";
  }
}

function deleteContact(name) {
  var i = 0;
  for (var i = 0; i < userContacts.length; i++) {
    if (userContacts[i].name == name) {
      wapi.delete("crm-contacts", userContacts[i], console.log);
      userContacts.splice(i, 1);
    }
  }

  displayData();
}

//step at the beginning of the search function always.
function statusFilter() {
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

function searchFunction() {
  var input, filter, table, tr, i, currname, currcomp, currphone, curremail;
  //first do color filtering
  statusFilter();
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

searchFunction();

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
