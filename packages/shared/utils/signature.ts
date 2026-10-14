import { SignatureVectorArray } from '../types'

export const SIGNATURE_STROKE_SIZE = 8
export const SIGNATURE_STROKE_THINNING = 0.5
export const SIGNATURE_STROKE_SMOOTHING = 0.5
export const SIGNATURE_STROKE_STREAMLINE = 0.5

export const SIGNATURE_OUTPUT_PADDING_DEFAULT = 10
export const SIGNATURE_OUTPUT_STROKE_FILL_STYLE = 'black'

export const BOX_HEIGHT_DEFAULT = 1
export const BOX_WIDTH_DEFAULT = 1

export const SIGNATURE_CAPTURED_STRING = 'Signature captured'

export const SIGNATURE_MAX_STROKES = 1000
export const SIGNATURE_MAX_POINTS = 20000

/**
 *  converts a vectorArray to a string output
 * @param input - signature vector array
 * @returns JSON stringified vector array
 */
export const convertToSignatureStringOutput = (
  input: SignatureVectorArray,
): string => {
  return JSON.stringify(input)
}

/**
 * converts a vectorArray to a string output
 * @param input - JSON stringified vector array
 * @returns signature vector array
 */
export const convertToSignatureVectorArray = (
  input: string,
): SignatureVectorArray => {
  return JSON.parse(input)
}

const isSignaturePoint = (point: unknown): point is [number, number, number] =>
  Array.isArray(point) &&
  point.length === 3 &&
  point.every((n) => typeof n === 'number' && Number.isFinite(n))

/**
 * Checks that the input is a well-formed signature vector array of finite
 * [x, y, pressure] points, within the stroke and point limits.
 * @param input - value to check
 * @returns true if input is a valid SignatureVectorArray
 */
export const isValidSignatureVectorArray = (
  input: unknown,
): input is SignatureVectorArray => {
  if (!Array.isArray(input) || input.length > SIGNATURE_MAX_STROKES) {
    return false
  }
  let totalPoints = 0
  for (const stroke of input) {
    if (!Array.isArray(stroke)) return false
    totalPoints += stroke.length
    if (totalPoints > SIGNATURE_MAX_POINTS) return false
    if (!stroke.every(isSignaturePoint)) return false
  }
  return true
}

type BoundingBox = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * returns a boundingBox containing the inputted signatureArray, removing whitespace around the input
 * @param vectorArray - signature vector array
 * @returns BoundingBox with min/max for X and Y coordinates
 */
export const getBoundingBox = (
  vectorArray: SignatureVectorArray,
): BoundingBox => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const stroke of vectorArray) {
    for (const [x, y] of stroke) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}

export const getSignatureFileName = ({
  fieldId,
  timestamp,
  isSvg = false,
}: {
  fieldId: string
  timestamp?: string // incase we want to add timestamp in the future
  isSvg?: boolean
}): string => {
  const fileName = [
    'Signature_Captured_',
    fieldId,
    timestamp ? `_${timestamp}` : '',
  ].join('')

  const fileExtension = isSvg ? 'svg' : 'png'
  return `${fileName}.${fileExtension}`
}
