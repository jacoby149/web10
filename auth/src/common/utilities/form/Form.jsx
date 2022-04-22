// TODO: figure out why Form.jsx has an error with babel
import React from 'react';

/**
 * Manage form state for Web10 Auth Hub.
 *
 * Validations should follow the structure of the form with the following format:
 *   Keys can contain either an object with required: true or a custom isValid function. Example:
 *      validations: {
 *          rootKey1: {
 *              subKey1: {
 *                  required: true
 *              },
 *              subKey2: {
 *                  isValid: () => return true if valid else false
 *              }
 *          }
 *      }
 *
 * You may also provide a special key `oneOf` which is an object housing a group of key names that exist in the form
 * at the depth of the `oneOf` key, and they are matched with an isValid function to run. If this isValid callback fails,
 * all the keys are invalid. If it passes, all keys are valid. Example:
 *      validations: {
 *          rootKey1: {
 *              oneOf: [
 *                  {keys: ['subKey1', 'subKey2'], isValid: () => return true if valid else false}
 *              ]
 *          }
 *      }
 *
 * Conditional blocks work such that any validations contained within a `conditions` key will only be run if the willValidate
 * function evaluates to true. Otherwise, these validations are not processed. As with `oneOf`, `conditions` must exist
 * at the proper depth for the keys it encompasses, with the caveat that this one supports the recursive nature of nested JSON.
 * Example:
 *      validations: {
 *          rootKey1: {
 *              conditions: [
 *                  {
 *                      willValidate: () => return true to run validations else false,
 *                      validations: {
 *                          subKey1: {
 *                              required: true
 *                          },
 *                          subKey2: {
 *                              isValid: () => return true if valid else false
 *                          }
 *                      }
 *                  }
 *              ]
 *          }
 *      }
 *
 *
 * @param options
 * @param options.onSubmit      Form submit action.
 * @param options.initialValues Initial Values for the form state. Usually passed in as a separately declared "defaultFormState" object.
 * @param options.validations   Validations for required fields.
 *
 * @returns {{handleSubmit: handleSubmit, form: unknown, checkField: (function(*, *)), validations: ({}|{}), setForm: (value: unknown) => void, setErrors: (value: (((prevState: {}) => {}) | {})) => void, errors: {}, validate: (function(*, *): {})}}
 */
export const useForm = (options) => {
    const [form, setForm] = React.useState(options.initialValues || {})
    const [errors, setErrors] = React.useState({})
    const [isInValidationMode, setIsInValidationMode] = React.useState(false)
    const validations = options.validations || {}

    React.useEffect(() => {
        if (Object.keys(errors).length > 0) {
            setIsInValidationMode(true)
        }
    }, [errors])

    React.useEffect(() => {
        if (isInValidationMode) {
            setErrors({...validate(form, validations)})
        }
    }, [form])

    const checkField = (value, validation) => {
        return (
            validation.isValid?.() === false ||
            validation.required && (
                typeof value === 'undefined' ||
                value === null ||
                value === ''
            )
        )
    }

    const validate = (form, validations) => {
        let errors = {}
        for (let key in validations) {
            if (typeof validations[key] === 'object') {
                if (key === 'conditions') {
                    validations[key].forEach((condition) => {
                        if (condition.willValidate?.() === true) {
                            for (let validation in condition.validations) {
                                let conditionalErrors = validate(form, condition.validations)
                                if (Object.keys(conditionalErrors).length > 0) {
                                    errors = Object.assign({}, errors || {}, conditionalErrors)
                                }
                            }
                        }
                    })
                } else if (key === 'oneOf') {
                    validations[key].forEach((condition) => {
                        if (condition.isValid() === false) {
                            condition.keys.forEach((key) => {
                                errors[key] = true
                            })
                        }
                    })
                } else if (validations[key].required || validations[key].isValid) {
                    if (checkField(form[key], validations[key])) {
                        errors[key] = true
                    }
                } else {
                    let nestedErrors = validate(form[key], validations[key])
                    if (Object.keys(nestedErrors).length > 0) {
                        errors[key] = Object.assign({}, errors[key] || {}, nestedErrors)
                    }
                }
            }
        }
        return errors
    }

    const handleSubmit = () => {
        let newErrors = validate(form, validations)

        if (Object.keys(newErrors).length > 0) {
            setErrors({...newErrors})
            return
        }

        if (options.onSubmit) {
            options.onSubmit()
        }
    }

    return {
        form,
        setForm,
        handleSubmit,
        errors,
        setErrors,
        checkField,
        validate,
        validations
    }
}

export const FormContext = React.createContext(null)

export const useFormContext = () => React.useContext(FormContext)
