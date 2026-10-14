import { SignatureVectorArray } from 'formsg-shared/types'
import { SIGNATURE_MAX_COORDINATE } from 'formsg-shared/utils/signature'

import {
  convertToSignaturePngBuffer,
  convertToSignaturePngDataUri,
  SIGNATURE_PNG_MAX_HEIGHT,
  SIGNATURE_PNG_MAX_WIDTH,
} from 'src/app/utils/convert-vector-array-to-png'

// PNG IHDR stores width/height as big-endian uint32 at byte offsets 16 and 20
const getPngDimensions = (buffer: Buffer) => ({
  width: buffer.readUInt32BE(16),
  height: buffer.readUInt32BE(20),
})

describe('convertToSignaturePngBuffer', () => {
  it('should render a normal signature at 3x resolution', () => {
    const signature: SignatureVectorArray = [
      [
        [0, 0, 0.5],
        [100, 50, 0.5],
      ],
    ]
    const { width, height } = getPngDimensions(
      convertToSignaturePngBuffer(signature),
    )
    expect(width).toBe(360)
    expect(height).toBe(210)
  })

  it('should cap canvas size for signatures with a huge bounding box', () => {
    const signature: SignatureVectorArray = [
      [
        [0, 0, 0.5],
        [7646, 7646, 0.5],
      ],
    ]
    const { width, height } = getPngDimensions(
      convertToSignaturePngBuffer(signature),
    )
    expect(width).toBeLessThanOrEqual(SIGNATURE_PNG_MAX_WIDTH)
    expect(height).toBeLessThanOrEqual(SIGNATURE_PNG_MAX_HEIGHT)
  })

  it('should cap canvas size for coordinates at the allowed limit', () => {
    const signature: SignatureVectorArray = [
      [
        [-SIGNATURE_MAX_COORDINATE, 0, 0.5],
        [SIGNATURE_MAX_COORDINATE, 1, 0.5],
      ],
    ]
    const { width, height } = getPngDimensions(
      convertToSignaturePngBuffer(signature),
    )
    expect(width).toBeLessThanOrEqual(SIGNATURE_PNG_MAX_WIDTH)
    expect(height).toBeLessThanOrEqual(SIGNATURE_PNG_MAX_HEIGHT)
  })

  it.each([
    ['a number', 5],
    ['a string', 'x'],
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
  ])('should return an empty buffer for %s', (_, input) => {
    expect(
      convertToSignaturePngBuffer(input as unknown as SignatureVectorArray),
    ).toEqual(Buffer.alloc(0))
  })
})

describe('convertToSignaturePngDataUri', () => {
  it('should return an empty string when there is nothing to render', () => {
    expect(convertToSignaturePngDataUri([[]])).toBe('')
  })
})
