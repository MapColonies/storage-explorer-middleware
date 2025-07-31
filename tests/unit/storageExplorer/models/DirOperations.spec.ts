import { Dirent, ReadStream } from 'fs';
import { BadRequestError, NotFoundError } from '@map-colonies/error-types';
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

  describe('#getJsonFileStream', () => {
    it('should return IStream object with file content as a ReadStream', async () => {
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
});
