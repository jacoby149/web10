import React from "react";
import ReactDOM from "react-dom";
import Body from "./common/layout/Body";
import SettingsBar from "./components/SettingsBar";
import { DataContext } from "./common/utilities/DataHandler";

const Web10AuthPage = ({}) => {
    // const defaultFormState = {
    //     theme: 'dark' // TODO: get from api call
    // }
    //
    // const { form, setForm, errors } = useForm({
    //     onSubmit: () => console.log(form),
    //     initialValues: defaultFormState,
    //     validations: {
    //         theme: {
    //             isValid: () => form.theme !== 'invalid'
    //         }
    //     }
    // })

    const [theme, setTheme] = React.useState('dark')

    return <DataContext.Provider value={{theme, setTheme}}>
            <SettingsBar />
            <Body>
                hello WRLD
            </Body>
    </DataContext.Provider>
}

ReactDOM.render(
    <Web10AuthPage />,
    document.getElementById("root")
);
