import { CanvasRenderingContext2D, createCanvas } from 'canvas'
import { SignatureVectorArray } from 'formsg-shared/types'
import {
  BOX_HEIGHT_DEFAULT,
  BOX_WIDTH_DEFAULT,
  getBoundingBox,
  isValidSignatureVectorArray,
  SIGNATURE_OUTPUT_PADDING_DEFAULT,
  SIGNATURE_OUTPUT_STROKE_FILL_STYLE,
  SIGNATURE_STROKE_SIZE,
  SIGNATURE_STROKE_SMOOTHING,
  SIGNATURE_STROKE_STREAMLINE,
  SIGNATURE_STROKE_THINNING,
} from 'formsg-shared/utils/signature'
import getStroke from 'perfect-freehand'

// Upper bound on rendered output so signature data cannot dictate canvas size
export const SIGNATURE_PNG_MAX_WIDTH = 2000
export const SIGNATURE_PNG_MAX_HEIGHT = 1000

export const convertToSignaturePngBuffer = (
  vectorArray: SignatureVectorArray,
  padding = SIGNATURE_OUTPUT_PADDING_DEFAULT,
): Buffer => {
  if (!isValidSignatureVectorArray(vectorArray)) return Buffer.alloc(0)

  // Calculate bounding box
  const { minX, minY, maxX, maxY } = getBoundingBox(vectorArray)
  const boxWidth = maxX - minX || BOX_WIDTH_DEFAULT
  const boxHeight = maxY - minY || BOX_HEIGHT_DEFAULT

  // Drawing size includes padding on all sides
  const drawingWidth = boxWidth + 2 * padding
  const drawingHeight = boxHeight + 2 * padding
  if (!Number.isFinite(drawingWidth) || !Number.isFinite(drawingHeight)) {
    return Buffer.alloc(0)
  }

  // default dpr to 3 for overall sharpness, scaling down to fit the max size
  const scale = Math.min(
    3,
    SIGNATURE_PNG_MAX_WIDTH / drawingWidth,
    SIGNATURE_PNG_MAX_HEIGHT / drawingHeight,
  )
  const canvasWidth = Math.min(
    SIGNATURE_PNG_MAX_WIDTH,
    Math.max(1, Math.ceil(drawingWidth * scale)),
  )
  const canvasHeight = Math.min(
    SIGNATURE_PNG_MAX_HEIGHT,
    Math.max(1, Math.ceil(drawingHeight * scale)),
  )

  const canvas = createCanvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  // Scale the context to account for dpr / downscaling
  ctx.scale(scale, scale)

  // Draw strokes
  for (const stroke of vectorArray) {
    if (stroke.length === 0) continue
    const normalizedStroke = stroke.map(([x, y, pressure]) => [
      x - minX + padding,
      y - minY + padding,
      pressure,
    ])
    const pathData = getStroke(normalizedStroke, {
      size: SIGNATURE_STROKE_SIZE,
      thinning: SIGNATURE_STROKE_THINNING,
      smoothing: SIGNATURE_STROKE_SMOOTHING,
      streamline: SIGNATURE_STROKE_STREAMLINE,
    })

    ctx.fillStyle = SIGNATURE_OUTPUT_STROKE_FILL_STYLE
    drawStroke(ctx, pathData)
  }

  // Return PNG buffer
  return canvas.toBuffer('image/png')
}

const drawStroke = (ctx: CanvasRenderingContext2D, stroke: number[][]) => {
  if (!stroke.length) return
  ctx.beginPath()
  ctx.moveTo(stroke[0][0], stroke[0][1])
  for (let i = 1; i < stroke.length; i++) {
    ctx.lineTo(stroke[i][0], stroke[i][1])
  }
  ctx.closePath()
  ctx.fill()
}

export const convertToSignaturePngDataUri = (
  vectorArray: SignatureVectorArray,
): string => {
  const pngBuffer: Buffer = convertToSignaturePngBuffer(vectorArray)
  if (pngBuffer.length === 0) return ''

  const base64 = pngBuffer.toString('base64')
  return `data:image/png;base64,${base64}`
}
