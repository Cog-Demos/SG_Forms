import { SignatureAnswerV4 } from '@opengovsg/formsg-sdk'
import { BasicField } from 'formsg-shared/types'
import {
  isValidSignatureVectorArray,
  SIGNATURE_MAX_INPUT_LENGTH,
} from 'formsg-shared/utils/signature'
import { left, right } from 'fp-ts/lib/Either'
import { flow } from 'fp-ts/lib/function'

import { ProcessedSignatureResponse } from 'src/app/modules/submission/submission.types'
import { ISignatureFieldSchema, OmitUnusedValidatorProps } from 'src/types'

import { ParsedClearFormFieldResponseV4 } from '../../../../types/api'
import {
  ResponseValidator,
  ResponseValidatorConstructor,
} from '../../../../types/field/utils/validation'

type SignatureValidator = ResponseValidator<ProcessedSignatureResponse>
type SignatureValidatorConstructor = (
  signatureField: OmitUnusedValidatorProps<ISignatureFieldSchema>,
) => SignatureValidator

const signatureAnswerValidator: SignatureValidator = (response) => {
  const answerArray: string[] = response.answerArray
  const [type, value] = answerArray
  if (answerArray.length !== 2) {
    return left(`SignatureValidator:\tanswerArray has invalid shape`)
  }
  // Empty signature (e.g. optional field left blank is ['', ''])
  if (value === '' && (type === '' || type === 'draw')) return right(response)
  if (type !== 'draw' || !value) {
    return left(`SignatureValidator:\tanswerArray has invalid shape`)
  }
  if (value.length > SIGNATURE_MAX_INPUT_LENGTH) {
    return left(`SignatureValidator:\tsignature exceeds maximum length`)
  }
  let vectorArray: unknown
  try {
    vectorArray = JSON.parse(value)
  } catch {
    return left(`SignatureValidator:\tsignature is not valid JSON`)
  }
  return isValidSignatureVectorArray(vectorArray)
    ? right(response)
    : left(`SignatureValidator:\tsignature vector array is invalid`)
}

export const constructSignatureValidator: SignatureValidatorConstructor = () =>
  flow(signatureAnswerValidator)

// V4
// V4 signature: answer = { value: [number, number, number][][], type: 'draw' }

type SignatureResponseV4 = ParsedClearFormFieldResponseV4 & {
  fieldType: BasicField.Signature
  answer: SignatureAnswerV4
}

const isSignatureResponseV4: ResponseValidator<
  ParsedClearFormFieldResponseV4,
  SignatureResponseV4
> = (response) => {
  if (response.fieldType !== BasicField.Signature) {
    return left(
      `SignatureValidatorV4.fieldTypeMismatch:\tfieldType is not signature`,
    )
  }
  const { answer } = response as SignatureResponseV4
  // Empty signature (optional field left blank)
  if (Array.isArray(answer?.value) && answer.value.length === 0) {
    return right(response as SignatureResponseV4)
  }
  if (
    !answer ||
    answer.type !== 'draw' ||
    !isValidSignatureVectorArray(answer.value)
  ) {
    return left(
      `SignatureValidatorV4.invalidAnswer:\tsignature vector array is invalid`,
    )
  }
  return right(response as SignatureResponseV4)
}

export const constructSignatureValidatorV4: ResponseValidatorConstructor<
  OmitUnusedValidatorProps<ISignatureFieldSchema>,
  ParsedClearFormFieldResponseV4,
  SignatureResponseV4
> = () => flow(isSignatureResponseV4)
