import { StatusBar } from "expo-status-bar";
import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, Button, TextInput } from "react-native";

export default function App() {
  const [auth, setAuth] = useState(false);
  const [provider,setProvider] = useState("api.web10.app");
  const [user,setUser] = useState("jacoby149");
  if (auth) return <Stop user={user} provider = {provider} setAuth={setAuth}></Stop>;
  else return <Login setAuth={setAuth}></Login>;
}

function Login({ setAuth }) {
  return (
    <View style={styles.container}>
      <Text style={{ color: "white" }}>web10 encrytor login</Text>
      <br></br>
      <div style={{marginBottom:"5px"}} >
        <TextInput
          style={{ backgroundColor: "white" }}
          placeholder=" username"
        ></TextInput>
      </div>
      <div>
        <TextInput
          style={{ backgroundColor: "white" }}
          placeholder=" password"
        ></TextInput>
      </div>
      <br></br>
      <Button
        title="log in"
        onPress={() => setAuth(true)}
        color="purple"
      ></Button>
      <StatusBar style="auto" />
    </View>
  );
}

function Stop({ user, provider, setAuth }) {
  return (
    <View style={styles.container}>
      <Text style={{ color: "white" }}>hello {provider}/{user}</Text>
      <Text style={{ color: "white" }}>web10 encrytor is running</Text>
      <br></br>
      <Button
        title="log out"
        onPress={() => setAuth(false)}
        color="purple"
      ></Button>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});
