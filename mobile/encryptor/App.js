import { StatusBar } from "expo-status-bar";
import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, Button, TextInput } from "react-native";
import PhoneInput from "react-native-phone-number-input";
import CodeInput from 'react-native-confirmation-code-input';

export default function App() {
  const [auth, setAuth] = useState(false);
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState("api.web10.app");
  const [user, setUser] = useState("jacoby149");
  if (auth)
    return <Main user={user} provider={provider} setAuth={setAuth} setPhone={setPhone}></Main>;
  if (phone !== "")
    return <Verify phone={phone} setPhone={setPhone} setAuth={setAuth}></Verify>
  else return <PhoneEntry setPhone={setPhone}></PhoneEntry>;
}

function PhoneEntry({ setPhone }) {
  var num = "";
  return (
    <View style={styles.container}>
      <Text style={{ color: "white" }}>web10 encrytor login</Text>
      <View style={{ margin: 5 }}>
        <PhoneInput defaultCode="US"
          onChangeFormattedText={(c) => num = c}></PhoneInput>
      </View>
      <View style={{ margin: 5 }}>
        <Button
          title="verify Number"
          onPress={() => setPhone(num)}
          color="purple"
        ></Button>
        <StatusBar style="auto" />
      </View>
    </View>
  );
}

function Verify({ phone, setPhone,setAuth }) {
  return (
    <View style={styles.container}>
      <View style={{ position: "absolute", top: 20 }}>
        <Text style={{ color: "white", marginBottom: 10 }}> {phone}</Text>
      </View>
      <View style={{ position: "absolute", top: 50 }}>
        <Button color="purple"
          title="change number" onPress={() => setPhone("")}></Button>
        <StatusBar style="auto" />
      </View>

      <Text style={{ color: "white" }}>Enter Verification Code</Text>
      <View style={{ height: 50 }}>
        <CodeInput
          keyboardType="numeric"
          codeLength={6}
          compareWithCode='123456'
          autoFocus={false}
          containerStyle={{ margin: 50 }}
          codeInputStyle={{ fontWeight: '800' }}
          onFulfill={(isValid, code) => { 
            if (isValid) setAuth(true)
          }}
      />
      </View>

      <View style={{ marginTop: 25 }}>
        <Button title="resend code" onPress={() => setPhone("")}></Button>
        <StatusBar style="auto" />
      </View>
    </View>
  );
}


function Main({ user, provider, setAuth,setPhone }) {
  return (
    <View style={styles.container}>
      <View style={{ position: "absolute", top: 50, left: 30 }}>
        <Button
          title="export keys"
          color="purple"
        ></Button>
      </View>
      <View style={{ position: "absolute", top: 90, left: 30 }}>
        <Button
          title="import keys"
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
          onPress={() => {
            setAuth(false);
            setPhone("");
          }}
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
