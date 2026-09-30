import JSZip from 'jszip'
import uniq from 'lodash/uniq'

// Note: Guide should be updated if the list of valid extensions is changed.
// https://guide.form.gov.sg/faq/faq/attachments
export const VALID_EXTENSIONS = [
  '.asc',
  '.avi',
  '.bmp',
  '.cer',
  '.class',
  '.csv',
  '.dat',
  '.dgn',
  '.doc',
  '.docx',
  '.dot',
  '.dwf',
  '.dwg',
  '.dxf',
  '.ent',
  '.eps',
  '.gif',
  '.gz',
  '.htm',
  '.html',
  '.jfif',
  '.jpeg',
  '.jpg',
  '.log',
  '.mov',
  '.mpeg',
  '.mpg',
  '.mpp',
  '.msg',
  '.mso',
  '.oa',
  '.odb',
  '.odf',
  '.odg',
  '.odp',
  '.ods',
  '.odt',
  '.p7m',
  '.p7s',
  '.pcx',
  '.pdf',
  '.png',
  '.pot',
  '.pps',
  '.ppsx',
  '.ppt',
  '.pptx',
  '.psd',
  '.pub',
  '.rtf',
  '.svg',
  '.sxc',
  '.sxd',
  '.sxi',
  '.sxw',
  '.tar',
  '.tif',
  '.tiff',
  '.txt',
  '.vcf',
  '.vsd',
  '.wav',
  '.wmv',
  '.xls',
  '.xlsx',
  '.xml',
  '.zip',
]

export const VALID_WHITELIST_FILE_EXTENSIONS = ['.csv']

/**
 * Extracts the file extension of a given filename.
 *
 * @param filename name of the file to check the extension for
 * @return the file extension if it exists, otherwise an empty string.
 */
export const getFileExtension = (filename: string): string => {
  const splits = filename.split('.')
  if (splits.length < 2) {
    return ''
  }
  return `.${splits[splits.length - 1]}`
}

/**
 * Checks whether the given file extension is valid against the list of valid
 * extensions.
 *
 * @param ext the file extension to check
 * @return `true` if the file extension is invalid, otherwise `false`.
 */
export const isInvalidFileExtension = (ext: string): boolean =>
  !VALID_EXTENSIONS.includes(ext.toLowerCase())

export const MAX_NESTED_ZIP_DEPTH = 3
export const MAX_ZIP_ENTRIES = 10000
export const DEFAULT_MAX_DECOMPRESSED_ZIP_BYTES = 20 * 1024 * 1024

export class ZipInspectionLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipInspectionLimitError'
  }
}

/**
 * Mutable budget shared across all zip inspections of a single submission,
 * so that the total work done cannot exceed the configured limits.
 */
export type ZipInspectionBudget = {
  remainingDecompressedBytes: number
  remainingEntries: number
}

export const createZipInspectionBudget = (
  maxDecompressedBytes: number = DEFAULT_MAX_DECOMPRESSED_ZIP_BYTES,
  maxEntries: number = MAX_ZIP_ENTRIES,
): ZipInspectionBudget => ({
  remainingDecompressedBytes: maxDecompressedBytes,
  remainingEntries: maxEntries,
})

/**
 * Decompresses a zip entry while enforcing the decompressed byte budget,
 * aborting as soon as the budget is exceeded instead of inflating the
 * whole entry into memory.
 */
const readZipEntryWithinBudget = (
  dataFormat: 'nodebuffer',
  fileEntry: JSZip.JSZipObject,
  budget: ZipInspectionBudget,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = fileEntry.nodeStream(dataFormat)
    stream.on('data', (chunk: Buffer) => {
      budget.remainingDecompressedBytes -= chunk.length
      if (budget.remainingDecompressedBytes < 0) {
        stream.pause()
        stream.removeAllListeners()
        chunks.length = 0
        return reject(
          new ZipInspectionLimitError(
            'Decompressed size of nested zip files exceeds limit',
          ),
        )
      }
      chunks.push(chunk)
    })
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })

/**
 * Dives into a zip file and recursively checks if it contains
 * any invalid files. A file is deemed invalid if its file extension
 * is not valid as checked by isInvalidFileExtension.
 *
 * Nested zip files are inspected up to MAX_NESTED_ZIP_DEPTH levels deep,
 * and the total number of entries and decompressed bytes of nested zips are
 * bounded by the given budget. Exceeding any limit rejects with a
 * ZipInspectionLimitError.
 *
 * @param dataFormat the format of the file to use in JSZip. Only `nodebuffer` is supported.
 * @param file the file to check
 * @param budget the inspection budget, which may be shared across multiple calls
 * @return array of invalid file extensions in given zip file
 */
export const getInvalidFileExtensionsInZip = (
  dataFormat: 'nodebuffer',
  file: Buffer,
  budget: ZipInspectionBudget = createZipInspectionBudget(),
): Promise<string[]> => {
  const checkZipForInvalidFiles = async (
    file: Buffer,
    depth: number,
  ): Promise<string[]> => {
    const zip = await JSZip.loadAsync(file)
    const fileEntries: JSZip.JSZipObject[] = []
    let entryCount = 0
    zip.forEach((_relativePath, fileEntry) => {
      entryCount++
      if (!fileEntry.dir) fileEntries.push(fileEntry)
    })

    budget.remainingEntries -= entryCount
    if (budget.remainingEntries < 0) {
      throw new ZipInspectionLimitError('Number of zip entries exceeds limit')
    }

    const invalidFileExtensions: string[] = []
    for (const fileEntry of fileEntries) {
      const fileExt = getFileExtension(fileEntry.name)
      if (isInvalidFileExtension(fileExt)) {
        invalidFileExtensions.push(fileExt)
      } else if (fileExt === '.zip') {
        if (depth >= MAX_NESTED_ZIP_DEPTH) {
          throw new ZipInspectionLimitError('Zip nesting depth exceeds limit')
        }
        const nestedZip = await readZipEntryWithinBudget(
          dataFormat,
          fileEntry,
          budget,
        )
        invalidFileExtensions.push(
          ...(await checkZipForInvalidFiles(nestedZip, depth + 1)),
        )
      }
    }

    return uniq(invalidFileExtensions)
  }
  return checkZipForInvalidFiles(file, 0)
}
