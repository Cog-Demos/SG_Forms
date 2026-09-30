import fs from 'fs'
import JSZip from 'jszip'
import path from 'path'

import {
  createZipInspectionBudget,
  getFileExtension,
  getInvalidFileExtensionsInZip,
  isInvalidFileExtension,
  MAX_NESTED_ZIP_DEPTH,
  ZipInspectionLimitError,
} from '../file-validation'

const RESOURCES = path.join(__dirname, '../../../../__tests__/resources')

describe('File validation utils', () => {
  describe('getFileExtension', () => {
    it('should handle file name with extension', () => {
      const actual = getFileExtension('image.jpg')
      expect(actual).toEqual('.jpg')
    })

    it('should handle file name with no extension', async () => {
      const actual = getFileExtension('image-no-extension')
      expect(actual).toEqual('')
    })

    it('should handle file name with multiple periods', async () => {
      const actual = getFileExtension('file.a.txt')
      expect(actual).toEqual('.txt')
    })

    it('should handle file name with consecutive periodsa', async () => {
      const actual = getFileExtension('file....a.zip')
      expect(actual).toEqual('.zip')
    })
  })

  describe('isInvalidFileExtension', () => {
    it('should return false when given valid extension', () => {
      const actual = isInvalidFileExtension('.jpg')
      expect(actual).toEqual(false)
    })

    it('should return true when given invalid extension', () => {
      const actual = isInvalidFileExtension('.invalid')
      expect(actual).toEqual(true)
    })

    it('should return false when given valid extension that is mixed case', () => {
      const actual = isInvalidFileExtension('.jPG')
      expect(actual).toEqual(false)
    })

    it('should return true when given invalid extension that is mixed case', () => {
      const actual = isInvalidFileExtension('.sPoNgEbOb')
      expect(actual).toEqual(true)
    })
  })

  // Note that blob version is unable to be tested as Jest is running in a node environment.
  describe('getInvalidFileExtensionsInZip with nodebuffer', () => {
    it('should return empty array when there is only valid files', async () => {
      const file = fs.readFileSync(path.join(RESOURCES, 'onlyvalid.zip'))
      const actual = await getInvalidFileExtensionsInZip('nodebuffer', file)
      expect(actual).toEqual([])
    })

    it('should return invalid extensions when zipped files are all invalid file extensions', async () => {
      const file = fs.readFileSync(path.join(RESOURCES, 'onlyinvalid.zip'))
      const actual = await getInvalidFileExtensionsInZip('nodebuffer', file)
      expect(actual).toEqual(['.a', '.abc', '.py'])
    })

    it('should return only invalid extensions when zip has some valid file extensions', async () => {
      const file = fs.readFileSync(path.join(RESOURCES, 'invalidandvalid.zip'))
      const actual = await getInvalidFileExtensionsInZip('nodebuffer', file)
      expect(actual).toEqual(['.a', '.oo'])
    })

    it('should exclude repeated invalid extensions', async () => {
      const file = fs.readFileSync(path.join(RESOURCES, 'repeated.zip'))
      const actual = await getInvalidFileExtensionsInZip('nodebuffer', file)
      expect(actual).toEqual(['.a'])
    })

    it('should exclude folders', async () => {
      const file = fs.readFileSync(path.join(RESOURCES, 'folder.zip'))
      const actual = await getInvalidFileExtensionsInZip('nodebuffer', file)
      expect(actual).toEqual([])
    })

    it('should include invalid extensions in nested zip files', async () => {
      const file = fs.readFileSync(path.join(RESOURCES, 'nestedInvalid.zip'))
      const actual = await getInvalidFileExtensionsInZip('nodebuffer', file)
      expect(actual).toEqual(['.a', '.oo'])
    })

    describe('zip bomb protection', () => {
      const zipWith = (entries: Record<string, Buffer | string>) => {
        const zip = new JSZip()
        Object.entries(entries).forEach(([name, content]) =>
          zip.file(name, content),
        )
        return zip.generateAsync({
          type: 'nodebuffer',
          compression: 'DEFLATE',
        })
      }

      const nestZips = async (levels: number): Promise<Buffer> => {
        let current = await zipWith({ 'file.a': 'invalid' })
        for (let i = 0; i < levels; i++) {
          current = await zipWith({ 'nested.zip': current })
        }
        return current
      }

      it('should inspect nested zips up to the maximum depth', async () => {
        const file = await nestZips(MAX_NESTED_ZIP_DEPTH)
        const actual = await getInvalidFileExtensionsInZip('nodebuffer', file)
        expect(actual).toEqual(['.a'])
      })

      it('should reject zips nested deeper than the maximum depth', async () => {
        const file = await nestZips(MAX_NESTED_ZIP_DEPTH + 1)
        await expect(
          getInvalidFileExtensionsInZip('nodebuffer', file),
        ).rejects.toBeInstanceOf(ZipInspectionLimitError)
      })

      it('should reject nested zips that decompress beyond the byte budget', async () => {
        const innerZip = await new JSZip()
          .file('zeros.txt', Buffer.alloc(2 * 1024 * 1024))
          .generateAsync({ type: 'nodebuffer', compression: 'STORE' })
        const file = await zipWith({ 'bomb.zip': innerZip })
        expect(file.byteLength).toBeLessThan(64 * 1024)

        await expect(
          getInvalidFileExtensionsInZip(
            'nodebuffer',
            file,
            createZipInspectionBudget(1024 * 1024),
          ),
        ).rejects.toBeInstanceOf(ZipInspectionLimitError)
      })

      it('should share the byte budget across nested zips', async () => {
        const innerZip = await new JSZip()
          .file('zeros.txt', Buffer.alloc(600 * 1024))
          .generateAsync({ type: 'nodebuffer', compression: 'STORE' })
        const file = await zipWith({ 'a.zip': innerZip, 'b.zip': innerZip })

        await expect(
          getInvalidFileExtensionsInZip(
            'nodebuffer',
            file,
            createZipInspectionBudget(1024 * 1024),
          ),
        ).rejects.toBeInstanceOf(ZipInspectionLimitError)
      })

      it('should count directory entries towards the entry limit', async () => {
        const zip = new JSZip()
        zip.folder('a')
        zip.folder('b')
        zip.folder('c')
        const file = await zip.generateAsync({ type: 'nodebuffer' })
        await expect(
          getInvalidFileExtensionsInZip(
            'nodebuffer',
            file,
            createZipInspectionBudget(undefined, 2),
          ),
        ).rejects.toBeInstanceOf(ZipInspectionLimitError)
      })

      it('should reject zips with more entries than allowed', async () => {
        const file = await zipWith({ 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' })
        await expect(
          getInvalidFileExtensionsInZip(
            'nodebuffer',
            file,
            createZipInspectionBudget(undefined, 2),
          ),
        ).rejects.toBeInstanceOf(ZipInspectionLimitError)
      })
    })
  })
})
