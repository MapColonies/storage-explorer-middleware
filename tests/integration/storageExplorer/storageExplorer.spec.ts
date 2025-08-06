/* eslint-disable @typescript-eslint/no-unsafe-call */
import { constants, unlink, promises } from 'fs';
import httpStatusCodes from 'http-status-codes';
import { DirOperations, encryptZlibPath } from '../../../src/common/utilities';
import getStorageExplorerMiddleware, { IFile } from '../../../src';
import { LoggersHandler } from '../../../src/common/utilities';
import { MOCK_FOLDER_PREFIX } from '../../MOCKS/utils';
import { StorageExplorerRequestSender } from './helpers/requestSender';
import { innerDirSnap, rootDirSnap } from './snapshots/directory';
import { fileData } from './snapshots/file';
import { decryptedIdRes } from './snapshots/decryptId';
import { app, server } from './helpers/server_test';

describe('Storage Explorer', function () {
  let dirOperaions: DirOperations;
  let requestSender: StorageExplorerRequestSender;
  let logger: Record<string, unknown>;
  const mountDirs = [
    {
      physical: `${MOCK_FOLDER_PREFIX}/MOCKS`,
      displayName: '\\First_mount_dir',
      includeFilesExt: ['tif'],
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

  beforeEach(function () {
    logger = console as unknown as Record<string, unknown>;
    app.use(getStorageExplorerMiddleware(mountDirs, logger));
    requestSender = new StorageExplorerRequestSender(app);
    dirOperaions = new DirOperations(logger as unknown as LoggersHandler, mountDirs);
  });

  afterEach(() => {
    server.close();
  });

  describe('given valid params', () => {
    describe('directory', () => {
      it('should return root dir and match snapshot from mock', async () => {
        const res = await requestSender.getDirectory('/');
        const body = (res.body as IFile[]).sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1));
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(body).toMatchObject(rootDirSnap.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1)));
      });

      it('should return root dir when requested root traversal', async () => {
        const res = await requestSender.getDirectory('/../../../');
        const body = res.body as IFile[];
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(body).toMatchObject(rootDirSnap.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1)));
      });

      it('should return data of inner directories', async () => {
        const res = await requestSender.getDirectory('/\\\\First_mount_dir');
        const body = (res.body as IFile[]).sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1));
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(body).toMatchObject(innerDirSnap.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1)));
      });

      it('should return root dir by id and match snapshot from mock', async () => {
        const res = await requestSender.getDirectoryById('eJzTBwAAMAAw');
        const body = (res.body as IFile[]).sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1));
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(body).toMatchObject(rootDirSnap.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1)));
      });

      it('should return data of inner directories by id', async () => {
        const res = await requestSender.getDirectoryById('eJzT0y9JLS4p1vf1d_YOhpAAPNUF6Q--');
        const body = (res.body as IFile[]).sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1));
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(body).toMatchObject(innerDirSnap.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1)));
      });
    });

    describe('file', () => {
      it('should return file content and match snapshot from mock', async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/3D_data/1b/product.json');
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(fileData);
      });

      it('should return 200 when sending buffer size parameter', async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/3D_data/1b/product.json', '1000000');
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(fileData);
      });

      it('should return file content by id and match snapshot from mock', async () => {
        const physicalPath = dirOperaions.getPhysicalPath('/\\\\First_mount_dir/3D_data/1b/product.json');
        const encryptedNotJsonPath = await encryptZlibPath(physicalPath);
        const res = await requestSender.getFileById(encryptedNotJsonPath);
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(fileData);
      });

      it('should return 200 for a MIME text file', async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/3D_data/1b/text.txt');
        expect(res.type).toBe('text/plain');
        expect(res.status).toBe(httpStatusCodes.OK);
      });

      it('should return 200 for a MIME ZIP file', async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/zipFile.zip');
        expect(res.type).toBe('application/zip');
        expect(res.status).toBe(httpStatusCodes.OK);
      });
    });

    describe('uploadFile', () => {
      it('should write a new file', async () => {
        const res = await requestSender.writeStreamFile('/\\\\Second_mount_dir/zipFile.zip');
        expect(res.status).toBe(httpStatusCodes.CREATED);

        let isFileExist = false;

        try {
          await promises.access(`${MOCK_FOLDER_PREFIX}/MOCKS_2/zipFile.zip`, constants.F_OK);
          isFileExist = true;
        } catch {
          isFileExist = false;
        }

        expect(isFileExist).toBe(true);

        unlink(`${MOCK_FOLDER_PREFIX}/MOCKS_2/zipFile.zip`, () => {
          console.log('Delete file successfully');
        });
      });

      it(`should return the file content when file extension is missing`, async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/textFileWithoutSuffix');
        expect(res.text).toBe('just a file'); // Ask If Should Put It In Seperated File
        expect((res.headers as { contentType?: string }).contentType).toBeUndefined();
        expect(res.status).toBe(httpStatusCodes.OK);
      });
    });

    describe('decryptId', () => {
      it('should return the correct decrypted path', async () => {
        const directoryId = 'eJzT0y9JLS4p1vf1d_YOhpAAPNUF6Q--';
        const res = await requestSender.getDecryptedId(directoryId);
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(decryptedIdRes);
      });
    });
  });

  describe('given invalid params', () => {
    describe('directory', () => {
      it('should return 400 if path not found', async () => {
        const { status } = await requestSender.getDirectory('/\\\\First_mount_dir/3D_data/1b/3b');
        expect(status).toBe(httpStatusCodes.NOT_FOUND);
      });

      it('should return 400 if a file path supplied', async () => {
        const { status } = await requestSender.getDirectory('/\\\\First_mount_dir/3D_data/1b/metadata.json');
        expect(status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 500 if required query not provided', async () => {
        const { status } = await requestSender.getDirectoryWithoutQuery();
        // When connecting to a real server there's open api which should handle these errors
        // expect(status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 400 for invalid path (Directories traversal)', async () => {
        const { status } = await requestSender.getDirectory('../../../');
        expect(status).toBe(httpStatusCodes.BAD_REQUEST);
      });
    });

    describe('file', () => {
      it('should return 404 if path not found', async () => {
        const { status } = await requestSender.getStreamFile('/\\\\First_mount_dir/3D_data/1b/not_there.json');
        expect(status).toBe(httpStatusCodes.NOT_FOUND);
      });

      it('should return 400 if required query not provided', async () => {
        const { status } = await requestSender.getFileWithoutQuery();
        // When connecting to a real server there's open api which should handle these errors
        expect(status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 400 if buffer size in not a number', async () => {
        const { status } = await requestSender.getStreamFile('/\\\\First_mount_dir/zipFile.zip', 'NaN');
        expect(status).toBe(httpStatusCodes.BAD_REQUEST);
      });
    });

    describe('file by id', () => {
      it('should return 500 if id is not valid', async () => {
        const { status } = await requestSender.getFileById('iYl0xZ28wqXUIZ_pP_XU0v0i0EhFUpjD1QzJQsD7hO9.dPkcbmbb4pbPjUyek6');
        expect(status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 if required query not provided', async () => {
        const { status } = await requestSender.getFileByIdWithoutQuery();
        // When connecting to a real server there's open api which should handle these errors
        // expect(status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });
    });

    describe('decryptId', () => {
      it('should return 500 if id is not valid', async () => {
        const { status } = await requestSender.getDecryptedId('iYl0xZ28wqXUIZ_pP_XU0v0i0EhFUpjD1QzJQsD7hO9.dPkcbmbb4pbPjUyek6');
        expect(status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 if required query not provided', async () => {
        const { status } = await requestSender.getDecryptedIdWithoutQuery();
        // When connecting to a real server ther's open api which should handle these errors
        // expect(status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });
    });
  });

  describe('given invalid route', function () {
    it('should return 404', async () => {
      const { status } = await requestSender.getNoValidRoute();
      expect(status).toBe(httpStatusCodes.NOT_FOUND);
    });

    it('should also return 404 for main route', async () => {
      const { status } = await requestSender.getNoValidUrl();
      expect(status).toBe(httpStatusCodes.NOT_FOUND);
    });
  });
});
