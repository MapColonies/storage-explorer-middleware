/* eslint-disable @typescript-eslint/unbound-method */
// because of mocking res.setHeader and fakeStream.pipe
import { createWriteStream, Dirent, ReadStream, WriteStream, constants, unlink, promises } from 'node:fs';
import { EventEmitter, PassThrough } from 'stream';
import { join } from 'node:path';
import { BadRequestError, ConflictError, HttpError, NotFoundError } from '@map-colonies/error-types';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { DirOperations } from '../../../../src/common/utilities';
import { LoggersHandler } from '../../../../src/common/utilities/LoggersHandler';
import { ImountDirObj } from '../../../../src';
import { fileStreamSnap, generateRootDirSnap } from '../snapshots';
import { streamToString } from '../utils';
import { MOCK_FOLDER_PREFIX } from '../../../MOCKS/utils';
import { MAX_BUFFER_SIZE } from '../../../../src/storageExplorer/controllers/storageExplorer.controller';

let dirOperations: DirOperations;
let logger;
const mountDirs: ImountDirObj[] = [
  {
    physical: `${MOCK_FOLDER_PREFIX}/MOCKS`,
    displayName: '\\First_mount_dir',
  },
  {
    physical: `${MOCK_FOLDER_PREFIX}/MOCKS_2`,
    displayName: '\\Second_mount_dir',
  },
  {
    physical: `${MOCK_FOLDER_PREFIX}/MOCKS_3`,
    displayName: '\\Third_mount_dir',
  },
];

const mockWriteStream: WriteStream = {
  write: jest.fn(),
  end: jest.fn(),
  on: jest.fn(),
} as unknown as WriteStream;

jest.mock('node:fs', (): typeof import('node:fs') => {
  return {
    ...jest.requireActual('node:fs'),
    createWriteStream: jest.fn(() => mockWriteStream),
  };
});

const getFilterUnsupportedExtFunction = (path: string): ((dirent: Dirent) => boolean) => {
  const currentMountDir = mountDirs.find((mount) => (path + '/').startsWith(`${mount.physical}/`));

  if (typeof currentMountDir === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return (_): boolean => true;
  }

  return (file): boolean => {
    const { name } = file;
    const fileExt = file.name.split('.')[1];
    if (typeof currentMountDir.includeFilesExt !== 'undefined' && !file.isDirectory()) {
      return currentMountDir.includeFilesExt.includes(fileExt) || name === 'metadata.json';
    }

    return true;
  };
};

describe('storage explorer dirOperations', () => {
  beforeEach(function () {
    logger = new LoggersHandler(console as unknown as Record<string, unknown>);
    dirOperations = new DirOperations(logger, mountDirs);
    jest.clearAllMocks();
  });

  describe('#getPhysicalPath', () => {
    it('should return correct physical path mapped from config', () => {
      const displayPath = '/\\\\First_mount_dir/3D_data/1b/product.json';
      const mappedPath = dirOperations.getPhysicalPath(displayPath);
      const expectedVal = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product.json`;
      expect(mappedPath).toBe(expectedVal);
    });

    it('should throw an error for invalid path', () => {
      const invalidPath = '../'; // starts with a dot
      const physicalPathError = () => {
        return dirOperations.getPhysicalPath(invalidPath);
      };

      expect(physicalPathError).toThrow(BadRequestError);
      expect(physicalPathError).toThrow('fp.error.path_invalid');
    });
  });

  describe('#generateRootDir', () => {
    it('should return "virtual" root dir with all mountDirs from config', async () => {
      const generatedRootDirs = await dirOperations.generateRootDir();
      const rootDir = generatedRootDirs.map((item) => {
        const { modDate, ...rest } = item;
        return rest;
      });
      const expectedVal = generateRootDirSnap;
      expect(rootDir).toMatchObject(expectedVal);
    });
  });

  describe('#getDirectoryContent', () => {
    it('should return Dirent content', async () => {
      const dirPath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b`;
      const dirent = await dirOperations.getDirectoryContent(dirPath, getFilterUnsupportedExtFunction(dirPath));
      expect(dirent).toEqual(expect.arrayContaining<Dirent>(dirent));
      const hasMetadata = dirent.some((dir) => dir.name === 'metadata.json');
      expect(hasMetadata).toBe(true);
    });

    it('should throw an error if dir not exists', async () => {
      const notExistsPath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/3b`;

      await expect(dirOperations.getDirectoryContent(notExistsPath, getFilterUnsupportedExtFunction(notExistsPath))).rejects.toThrow(NotFoundError);
      await expect(dirOperations.getDirectoryContent(notExistsPath, getFilterUnsupportedExtFunction(notExistsPath))).rejects.toThrow(
        'fp.error.file_not_found'
      );
    });

    it('should throw an error if path is not a dir', async () => {
      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/metadata.json`;

      await expect(dirOperations.getDirectoryContent(filePath, getFilterUnsupportedExtFunction(filePath))).rejects.toThrow(BadRequestError);
      await expect(dirOperations.getDirectoryContent(filePath, getFilterUnsupportedExtFunction(filePath))).rejects.toThrow(
        'fp.error.path_is_not_dir'
      );
    });
  });

  describe('#getReadStream', () => {
    it('should return IReadStream object with file content as a ReadStream', async () => {
      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product.json`;
      const fileStream = await dirOperations.getReadStream(filePath);

      expect(fileStream).toHaveProperty('stream');
      expect(fileStream).toHaveProperty('contentType');
      expect(fileStream).toHaveProperty('size');
      expect(fileStream).toHaveProperty('name');
      expect(fileStream.stream).toBeInstanceOf(ReadStream);

      const fileContent = await streamToString(fileStream.stream);
      expect(JSON.parse(fileContent)).toMatchObject(fileStreamSnap);
    });

    it('should throw an error if file not exists', async () => {
      const notExistsPath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product_not_exist.json`;

      const fileStreamError = dirOperations.getReadStream(notExistsPath);

      await expect(fileStreamError).rejects.toThrow(NotFoundError);
      await expect(fileStreamError).rejects.toThrow('fp.error.file_not_found');
    });
  });

  describe('#getWriteStream', () => {
    it('should throw ConflictError if overwrite is false and file already exist', async () => {
      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product.json`;
      const overwrite = false;

      const fileStreamError = dirOperations.getWriteStream(filePath, overwrite);

      await expect(fileStreamError).rejects.toThrow(ConflictError);
      expect(createWriteStream).toHaveBeenCalledTimes(0);
    });

    it('should throw ConflictError if overwrite not set and file already exist', async () => {
      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product.json`;

      const fileStreamError = async () => {
        return dirOperations.getWriteStream(filePath);
      };

      await expect(fileStreamError).rejects.toThrow(ConflictError);
      expect(createWriteStream).toHaveBeenCalledTimes(0);
    });

    it('should return IWriteStream object with expected parameters for existing file', async () => {
      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product.json`;

      const res = await dirOperations.getWriteStream(filePath, true);
      expect(res.name).toBe('product.json');
      expect(res).toHaveProperty('stream');
      expect(createWriteStream).toHaveBeenCalledTimes(1);
    });

    it('should return IWriteStream object with expected parameters for not existing file', async () => {
      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product_not_exist.json`;

      const res = await dirOperations.getWriteStream(filePath);
      expect(res.name).toBe('product_not_exist.json');
      expect(res).toHaveProperty('stream');
      expect(createWriteStream).toHaveBeenCalledTimes(1);
    });
  });

  describe('#openReadStream', () => {
    const res = {
      setHeader: jest.fn().mockImplementationOnce(() => {
        console.log('setHeader');
      }),
      write: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
    } as unknown as jest.Mocked<Response>;

    it('should set headers and invoke pipe stream', async () => {
      const fakeStream = new PassThrough();
      fakeStream.pipe = jest.fn().mockReturnValue(res);

      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product.json`;

      dirOperations.getReadStream = jest.fn().mockResolvedValue({
        stream: fakeStream,
        contentType: 'application/json',
        size: 123,
        name: 'file.txt',
      });

      await dirOperations.openReadStream(res, filePath, '', MAX_BUFFER_SIZE);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 123);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');

      expect(fakeStream.pipe).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if file size is more then 10 Mebibyte and response type not declare as stream', async () => {
      const fakeStream = new PassThrough();

      fakeStream.pipe = jest.fn().mockReturnValue(res);

      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product.json`;

      dirOperations.getReadStream = jest.fn().mockResolvedValue({
        stream: fakeStream,
        contentType: 'application/json',
        size: 11534336,
        name: 'file.txt',
      });

      await expect(dirOperations.openReadStream(res, filePath, '', MAX_BUFFER_SIZE)).rejects.toThrow(
        new HttpError('Content Too Large', StatusCodes.REQUEST_TOO_LONG)
      );
    });
  });

  describe('#openWriteStream', () => {
    const req = {
      params: {},
      body: {},
      query: { path: '' },
      headers: {},
      pipe: jest.fn().mockImplementationOnce((stream: EventEmitter) => {
        process.nextTick(() => {
          stream.emit('close');
        });
      }),
    } as unknown as jest.Mocked<Request>;

    it('should invoke pipe stream', async () => {
      const fakeStream = new PassThrough();

      dirOperations.getWriteStream = jest.fn().mockResolvedValue({
        stream: fakeStream,
        name: 'file.txt',
      });

      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product_not_exist.json`;

      await dirOperations.openWriteStream(req, filePath, '');

      expect(req.pipe).toHaveBeenCalledTimes(1);
    });
  });

  describe('#createZipAndOpenReadStream', () => {
    it('should create a zip file when files are found', async () => {
      const fsReal: typeof import('fs') = jest.requireActual('node:fs');

      const folderPath = `${MOCK_FOLDER_PREFIX}/PRODUCT`;
      const name = 'Product';
      const zipFilePath: string = join(folderPath, name + '.zip');

      const fileStream: WriteStream = fsReal.createWriteStream(zipFilePath);

      await dirOperations.createZipAndOpenReadStream(fileStream, folderPath, name, '', MAX_BUFFER_SIZE);

      let isFileExist = false;

      try {
        await promises.access(zipFilePath, constants.F_OK);
        isFileExist = true;
      } catch {
        isFileExist = false;
      }

      expect(isFileExist).toBe(true);

      unlink(zipFilePath, (err) => {
        if (err) {
          console.warn(`Failed to delete file at ${zipFilePath}:`, err.message);
        } else {
          console.log(`Deleted file: ${zipFilePath}`);
        }
      });
    });

    it('should throw an error if no files with the specified name are found in the folder', async () => {
      const folderPath = `${MOCK_FOLDER_PREFIX}/MOCKS`;
      const name = 'noSuchAFile';

      const fakeStream = new PassThrough();

      const createZip = async (allowedExtensions?: string[]) => {
        return dirOperations.createZipAndOpenReadStream(fakeStream, folderPath, name, '', MAX_BUFFER_SIZE, allowedExtensions);
      };

      const testCases = [
        { allowedExtensions: undefined, expectedError: 'fp.error.file_not_found' },
        { allowedExtensions: ['.', '!@#', 'notExistExtension'], expectedError: 'fp.error.file_not_found' },
        { allowedExtensions: [''], expectedError: 'fp.error.file_not_found' },
        { allowedExtensions: [], expectedError: 'fp.error.file_not_found' },
      ];

      for (const { allowedExtensions, expectedError } of testCases) {
        await expect(createZip(allowedExtensions)).rejects.toThrow(expectedError);
        await expect(createZip(allowedExtensions)).rejects.toBeInstanceOf(NotFoundError);
      }
    });

    it('should throw an error if no folder in the path', async () => {
      const folderPath = `${MOCK_FOLDER_PREFIX}/MOCKS/NotExistFolder`;
      const name = 'Product';

      const fakeStream = new PassThrough();

      const createZip = async () => {
        return dirOperations.createZipAndOpenReadStream(fakeStream, folderPath, name, '', MAX_BUFFER_SIZE);
      };

      await expect(createZip()).rejects.toBeInstanceOf(NotFoundError);
      await expect(createZip()).rejects.toThrow(`fp.error.path_is_not_dir`);
    });
  });
});
