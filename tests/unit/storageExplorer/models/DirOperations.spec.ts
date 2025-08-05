import { createWriteStream, Dirent, ReadStream } from 'fs';
import { BadRequestError, ConflictError, NotFoundError } from '@map-colonies/error-types';
import { PassThrough } from 'stream';
import { DirOperations } from '../../../../src/common/utilities';
import { LoggersHandler } from '../../../../src/common/utilities/LoggersHandler';
import { ImountDirObj } from '../../../../src';
import { fileStreamSnap, generateRootDirSnap } from '../snapshots';
import { streamToString } from '../utils';
import { MOCK_FOLDER_PREFIX } from '../../../MOCKS/utils';

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

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createWriteStream: jest.fn((path) => ({
    sm: 'mock result ' + path,
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  })),
}));

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
      // eslint-disable-next-line
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

      const fileStreamError = async () => {
        return dirOperations.getReadStream(notExistsPath);
      };

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
      expect(createWriteStream).toBeCalledTimes(0);
    });

    it('should throw ConflictError if overwrite not set and file already exist', async () => {
      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product.json`;

      const fileStreamError = async () => {
        return dirOperations.getWriteStream(filePath);
      };

      await expect(fileStreamError).rejects.toThrow(ConflictError);
      expect(createWriteStream).toBeCalledTimes(0);
    });

    it('should return IWriteStream object with expected parameters for existing file', async () => {
      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product.json`;

      const res = await dirOperations.getWriteStream(filePath, true);
      expect(res.name).toBe('product.json');
      expect(res).toHaveProperty('stream');
      expect(createWriteStream).toBeCalledTimes(1);
    });

    it('should return IWriteStream object with expected parameters for not existing file', async () => {
      const filePath = `${MOCK_FOLDER_PREFIX}/MOCKS/3D_data/1b/product_not_exist.json`;

      const res = await dirOperations.getWriteStream(filePath);
      expect(res.name).toBe('product_not_exist.json');
      expect(res).toHaveProperty('stream');
      expect(createWriteStream).toBeCalledTimes(1);
    });
  });

  describe('#openReadStream', () => {
    const res = {
      setHeader: jest.fn(),
      write: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
    } as any;

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

      await dirOperations.openReadStream(res, filePath, '');

      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 123);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');

      expect(fakeStream.pipe).toHaveBeenCalledTimes(1);
    });
  });

  describe('#openWriteStream', () => {
    const req = {
      params: {},
      body: {},
      query: { path: '' },
      headers: {},
      pipe: jest.fn((stream) => {
        process.nextTick(() => {
          stream.emit('close');
        });
      }),
    } as any;

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
});
