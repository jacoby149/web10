import React from "react";
import { useDataContext, useStyleContext } from "../utilities/DataHandler";

const Select = (
    {
        id,
        label,
        firstOption=true,
        options,
        disabled,
        onChange,
        value,
        onBlur,
        disabledText='-',
        style={},
        labelStyle={},
        readOnly=false,
        invalid=false,
        inlineLabel=false,
        isLoading=false
    }
) => {
    let { theme } = useDataContext()
    let styles = useStyleContext(theme)

    if (readOnly || isLoading || (!isLoading && options.length === 0)) {
        disabled = true
    }

    let optionsArray = []

    if (firstOption) {
        optionsArray.push(
            <option key={id + '--1'} value={firstOption.value || ''}>
                {isLoading ? "Loading..." : disabled ? disabledText : firstOption.label || 'Select One'}
            </option>
        )
    }

    options.forEach((option, idx) => {
        optionsArray.push(<option key={id + idx} value={option.value}>{option.label}</option>)
    })

    return <>
        {label
            ? <label
                htmlFor={id}
                style={Object.assign(
                    {},
                    {marginRight: inlineLabel ? '3px' : '0'},
                    styles.test(),
                    labelStyle,
                    invalid ? {color: 'red'} : {},
                    readOnly ? styles.readOnlyLabel() : {}
                )}
            >
                {label} {inlineLabel ? null : <br />}
            </label>
            : null
        }

        <select
            id={id}
            disabled={disabled || null}
            onChange={onChange || null}
            value={value || undefined}
            onBlur={onBlur || null}
            style={Object.assign({}, styles.select(), {marginTop: inlineLabel ? '0' : '4px'}, style, invalid ? styles.error() : {})}
        >
            {optionsArray}
        </select>
    </>
}

export default Select;