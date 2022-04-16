import { StatusBar } from "expo-status-bar";
import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, Button, TextInput } from "react-native";

export default function App() {
  const [auth, setAuth] = useState(false);
  const [provider, setProvider] = useState("api.web10.app");
  const [user, setUser] = useState("jacoby149");
  if (auth)
    return <Stop user={user} provider={provider} setAuth={setAuth}></Stop>;
  else return <Login setAuth={setAuth}></Login>;
}

function Login({ setAuth }) {
  return (
    <View style={styles.container}>
      <Text style={{ color: "white" }}>web10 encrytor login</Text>
      <View style={{ margin: 5 }}>
        <TextInput
          style={{ backgroundColor: "white", width: 200 }}
          placeholder=" username"
        ></TextInput>
      </View>
      <View style={{ marginBottom: 5 }}>
        <TextInput
          style={{ backgroundColor: "white", width: 200 }}
          placeholder=" password"
        ></TextInput>
      </View>
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
      <View style={{ position: "absolute", top: 50, left: 30 }}>
        <Button
          title="export keys"
          onPress={() => setAuth(true)}
          color="purple"
        ></Button>
      </View>
      <View style={{ position: "absolute", top: 90, left: 30 }}>
        <Button
          title="import keys"
          onPress={() => setAuth(true)}
          color="teal"
        ></Button>
      </View>
      <View style={{ position: "absolute", bottom: 27 }}>
        <Text style={{ color: "white" }}>Site : docs.web10.app/mailer</Text>
        </View>
        <View style={{ position: "absolute", bottom: 10 }}>

        <Text style={{ color: "white" }}>Shared Secret : x0203049</Text>
        </View>

      <Text style={{ color: "white" }}>
        hello {provider}/{user}
      </Text>
      <Text style={{ color: "white" }}>web10 encrytor is running</Text>
      <View style={{ margin: 5 }}>
        <Button
          title="log out"
          onPress={() => setAuth(false)}
          color="purple"
        ></Button>
      </View>
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
