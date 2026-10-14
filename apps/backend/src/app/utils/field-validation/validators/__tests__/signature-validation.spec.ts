import {
  generateDefaultField,
  generateDefaultFieldV4,
} from '__tests__/unit/backend/helpers/generate-form-data'
import { ObjectId } from 'bson'
import { BasicField } from 'formsg-shared/types'
import {
  SIGNATURE_MAX_COORDINATE,
  SIGNATURE_MAX_INPUT_LENGTH,
  SIGNATURE_MAX_POINTS,
} from 'formsg-shared/utils/signature'

import {
  ValidateFieldError,
  ValidateFieldErrorV4,
} from 'src/app/modules/submission/submission.errors'
import { ProcessedSignatureResponse } from 'src/app/modules/submission/submission.types'
import { validateField, validateFieldV4 } from 'src/app/utils/field-validation'
import { ParsedClearFormFieldResponseV4 } from 'src/types/api'

const VALID_SIGNATURE = [
  [
    [10, 10, 0.5],
    [20, 25, 0.5],
    [30, 15, 0.5],
  ],
]

const makeSignatureResponse = (
  answerArray: string[],
): ProcessedSignatureResponse => ({
  _id: new ObjectId().toHexString(),
  question: 'Signature question',
  fieldType: BasicField.Signature,
  answerArray: answerArray as [string, string],
  isVisible: true,
})

describe('Signature field validation', () => {
  const formField = generateDefaultField(BasicField.Signature)

  it('should allow a valid drawn signature', () => {
    const response = makeSignatureResponse([
      'draw',
      JSON.stringify(VALID_SIGNATURE),
    ])
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isOk()).toBe(true)
  })

  it.each([
    ['canonical blank', ['', '']],
    ['blank draw', ['draw', '']],
  ])('should allow an empty signature (%s)', (_, answerArray) => {
    const response = makeSignatureResponse(answerArray)
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isOk()).toBe(true)
  })

  it.each([
    ['malformed JSON', ['draw', 'x']],
    ['non-array JSON', ['draw', '5']],
    ['non-numeric points', ['draw', '[[["a","b","c"]]]']],
    ['non-finite points', ['draw', '[[[0,0,0.5],[1e999,0,0.5]]]']],
    ['wrong point arity', ['draw', '[[[0,0]]]']],
    ['unknown signature type', ['text', JSON.stringify(VALID_SIGNATURE)]],
    ['blank value with unknown type', ['text', '']],
    ['extra answerArray entries', ['draw', '', 'extra']],
    ['empty vector array', ['draw', '[]']],
    ['strokes without points', ['draw', '[[]]']],
    [
      'out-of-range coordinates',
      ['draw', `[[[0,0,0.5],[${SIGNATURE_MAX_COORDINATE + 1},0,0.5]]]`],
    ],
    [
      'overflowing coordinates',
      ['draw', '[[[-1.7e308,0,0.5],[1.7e308,0,0.5]]]'],
    ],
    ['over-length input', ['draw', ' '.repeat(SIGNATURE_MAX_INPUT_LENGTH + 1)]],
    [
      'too many points',
      [
        'draw',
        JSON.stringify([
          Array.from({ length: SIGNATURE_MAX_POINTS + 1 }, () => [0, 0, 0.5]),
        ]),
      ],
    ],
  ])('should reject %s', (_, answerArray) => {
    const response = makeSignatureResponse(answerArray)
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })
})

describe('Signature field validation V4', () => {
  const formField = generateDefaultFieldV4(BasicField.Signature)
  const makeSignatureResponseV4 = (
    answer: unknown,
  ): ParsedClearFormFieldResponseV4 =>
    ({
      fieldType: BasicField.Signature,
      question: 'Signature',
      answer,
      provenance: {},
    }) as ParsedClearFormFieldResponseV4

  it('should allow a valid drawn signature', () => {
    const validateResult = validateFieldV4({
      formId: 'formId',
      formField,
      response: makeSignatureResponseV4({
        type: 'draw',
        value: VALID_SIGNATURE,
      }),
      isVisible: true,
    })
    expect(validateResult.isOk()).toBe(true)
  })

  it.each(['', 'draw'])(
    "should allow an empty signature with type '%s'",
    (type) => {
      const validateResult = validateFieldV4({
        formId: 'formId',
        formField,
        response: makeSignatureResponseV4({ type, value: [] }),
        isVisible: true,
      })
      expect(validateResult.isOk()).toBe(true)
    },
  )

  it('should reject an empty signature with an unknown type', () => {
    const validateResult = validateFieldV4({
      formId: 'formId',
      formField,
      response: makeSignatureResponseV4({ type: 'text', value: [] }),
      isVisible: true,
    })
    expect(validateResult.isErr()).toBe(true)
  })

  it.each([
    ['non-numeric points', [[['a', 'b', 'c']]]],
    ['strokes without points', [[]]],
    [
      'overflowing coordinates',
      [
        [
          [-Number.MAX_VALUE, 0, 0.5],
          [Number.MAX_VALUE, 0, 0.5],
        ],
      ],
    ],
  ])('should reject a signature with %s', (_, value) => {
    const validateResult = validateFieldV4({
      formId: 'formId',
      formField,
      response: makeSignatureResponseV4({ type: 'draw', value }),
      isVisible: true,
    })
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toBeInstanceOf(
      ValidateFieldErrorV4,
    )
  })
})
