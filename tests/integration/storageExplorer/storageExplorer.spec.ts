/* eslint-disable @typescript-eslint/no-unsafe-call */
import httpStatusCodes from 'http-status-codes';
import { DirOperations, encryptPath } from '../../../src/common/utilities';
import { getStorageExplorerMiddleware } from '../../../src';
import LoggersHandler from '../../../src/common/utilities/LoggersHandler';
import { StorageExplorerRequestSender } from './helpers/requestSender';
import { innerDirSnap, rootDirSnap } from './snapshots/directory';
import { fileData } from './snapshots/file';
import { decryptedIdRes } from './snapshots/decryptId';
import { app, server } from './helpers/server_test';

describe('Storage Explorer', function () {
  let dirOperaions: DirOperations;
  let requestSender: StorageExplorerRequestSender;
  let logger: LoggersHandler;
  const mountDirs = [
    {
      physical: './MOCKS',
      displayName: '\\First_mount_dir',
    },
    {
      physical: './MOCKS_2',
      displayName: '\\Second_mount_dir',
    },
    {
      physical: './MOCKS_3',
      displayName: '\\Third_mount_dir',
    },
  ];

  beforeEach(function () {
    logger = new LoggersHandler(console);
    app.use(getStorageExplorerMiddleware(mountDirs, logger));
    requestSender = new StorageExplorerRequestSender(app);
    dirOperaions = new DirOperations(logger, mountDirs);
  });

  afterEach(() => {
    afterEach(() => server.close());
  });

  describe('given valid params', () => {
    describe('directory', () => {
      it('should return root dir and match snapshot from mock', async () => {
        const res = await requestSender.getDirectory('/');
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(rootDirSnap);
      });

      it('should return root dir when requested root traversal', async () => {
        const res = await requestSender.getDirectory('/../../../');
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(rootDirSnap);
      });

      it('should return data of inner directories', async () => {
        const res = await requestSender.getDirectory('/\\\\First_mount_dir');
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(innerDirSnap);
      });

      it('should return root dir by id and match snapshot from mock', async () => {
        const res = await requestSender.getDirectoryById('4dt.yTVSoCcyvIqAxvCeeA--');
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(rootDirSnap);
      });

      it('should return data of inner directories by id', async () => {
        const res = await requestSender.getDirectoryById('7JtPOli87ygL..X4xb_1Nw--');
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(innerDirSnap);
      });
    });

    describe('file', () => {
      it('should return file content and match snapshot from mock', async () => {
        const res = await requestSender.getFile('/\\\\First_mount_dir/3D_data/1b/product.json');
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(fileData);
      });

      it('should return file content by id and match snapshot from mock', async () => {
        const physicalPath = dirOperaions.getPhysicalPath('/\\\\First_mount_dir/3D_data/1b/product.json');
        const encryptedNotJsonPath = encryptPath(physicalPath);
        const res = await requestSender.getFileById(encryptedNotJsonPath);
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(fileData);
      });
    });

    describe('decryptId', () => {
      it('should return the correct decrypted path', async () => {
        const directoryId = 'IrGIWn9rTrD77HKJZ.u59qkBpzrcByXx7URL.z0PoD0-';
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
      it('should return 400 if path not found', async () => {
        const { status } = await requestSender.getFile('/\\\\First_mount_dir/3D_data/1b/not_there.json');
        expect(status).toBe(httpStatusCodes.NOT_FOUND);
      });

      it('should return 400 if file is not a JSON', async () => {
        const { status } = await requestSender.getFile('/\\\\First_mount_dir/3D_data/1b/text.txt');
        expect(status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 500 if required query not provided', async () => {
        const { status } = await requestSender.getFileWithoutQuery();
        // When connecting to a real server there's open api which should handle these errors
        // expect(status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });
    });

    describe('file by id', () => {
      it('should return 500 if id is not valid', async () => {
        const { status } = await requestSender.getFileById('iYl0xZ28wqXUIZ_pP_XU0v0i0EhFUpjD1QzJQsD7hO9.dPkcbmbb4pbPjUyek6');
        expect(status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 400 if file is not a JSON', async () => {
        const physicalPath = dirOperaions.getPhysicalPath('/\\\\First_mount_dir/3D_data/1b/text.txt');
        const encryptedNotJsonPath = encryptPath(physicalPath);
        const { status } = await requestSender.getFileById(encryptedNotJsonPath);
        expect(status).toBe(httpStatusCodes.BAD_REQUEST);
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
