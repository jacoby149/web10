import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

export function createValidator(schema: object) {
  return ajv.compile(schema)
}

export interface ValidationResult {
  valid: boolean
  errors?: string[]
}

export function validateRecord(
  validator: ReturnType<typeof ajv.compile>,
  record: unknown
): ValidationResult {
  const valid = validator(record)
  if (!valid) {
    return {
      valid: false,
      errors: validator.errors?.map(e => `${e.instancePath || 'root'}: ${e.message}`).slice(0, 10),
    }
  }
  return { valid: true }
}
