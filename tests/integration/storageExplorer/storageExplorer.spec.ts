// import { constants, unlink, promises } from 'node:fs';
import path from 'node:path';
import httpStatusCodes from 'http-status-codes';
import jestOpenAPI from 'jest-openapi';
import { DirOperations, encryptZlibPath, LoggersHandler } from '../../../src/common/utilities';
import getStorageExplorerMiddleware, { IFile } from '../../../src';
import { MOCK_FOLDER_PREFIX } from '../../MOCKS/utils';
import { StorageExplorerRequestSender } from './helpers/requestSender';
import { innerDirSnap, rootDirSnap } from './snapshots/directory';
import { fileData } from './snapshots/file';
import { decryptedIdRes } from './snapshots/decryptId';
import { app, server } from './helpers/server_test';

jestOpenAPI(path.join(__dirname, '../../../examples-files/openapi3.yaml'));

const bufferToString = (buffer: number[]) => {
  return String.fromCharCode(...buffer);
};

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
        expect(res).toSatisfyApiSpec();
      });

      it('should return root dir when requested root traversal', async () => {
        const res = await requestSender.getDirectory('/../../../');
        const body = res.body as IFile[];
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(body).toMatchObject(rootDirSnap.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1)));
        expect(res).toSatisfyApiSpec();
      });

      it('should return data of inner directories', async () => {
        const res = await requestSender.getDirectory('/\\\\First_mount_dir');
        const body = (res.body as IFile[]).sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1));
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(body).toMatchObject(innerDirSnap.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1)));
        expect(res).toSatisfyApiSpec();
      });

      it('should return root dir by id and match snapshot from mock', async () => {
        const res = await requestSender.getDirectoryById('eJzTBwAAMAAw');
        const body = (res.body as IFile[]).sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1));
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(body).toMatchObject(rootDirSnap.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1)));
        expect(res).toSatisfyApiSpec();
      });

      it('should return data of inner directories by id', async () => {
        const res = await requestSender.getDirectoryById('eJzT0y9JLS4p1vf1d_YOhpAAPNUF6Q--');
        const body = (res.body as IFile[]).sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1));
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(body).toMatchObject(innerDirSnap.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1)));
        expect(res).toSatisfyApiSpec();
      });
    });

    describe('file', () => {
      it('should return file content and match snapshot from mock', async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/3D_data/1b/product.json');
        expect(res.type).toBe('application/octet-stream');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(JSON.parse(bufferToString(res.body as number[]))).toMatchObject(fileData);
        expect(res).toSatisfyApiSpec();
      });

      it('should return 200 when sending buffer size parameter', async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/3D_data/1b/product.json', '1000000');
        expect(res.type).toBe('application/octet-stream');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(JSON.parse(bufferToString(res.body as number[]))).toMatchObject(fileData);
        expect(res).toSatisfyApiSpec();
      });

      it('should return file content by id and match snapshot from mock', async () => {
        const physicalPath = dirOperaions.getPhysicalPath('/\\\\First_mount_dir/3D_data/1b/product.json');
        const encryptedNotJsonPath = await encryptZlibPath(physicalPath);
        const res = await requestSender.getFileById(encryptedNotJsonPath);
        expect(res.type).toBe('application/octet-stream');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(JSON.parse(bufferToString(res.body as number[]))).toMatchObject(fileData);
        expect(res).toSatisfyApiSpec();
      });

      it('should return 200 for a MIME text file', async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/3D_data/1b/text.txt');
        expect(res.type).toBe('application/octet-stream');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(bufferToString(res.body as number[])).toMatch('Txt file test');
        expect(res).toSatisfyApiSpec();
      });

      it('should return 200 for a MIME ZIP file', async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/zipFile.zip');
        expect(res.type).toBe('application/octet-stream');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res).toSatisfyApiSpec();
      });

      it(`should return the file content when file extension is missing`, async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/textFileWithoutSuffix');
        expect(res.body).toBeInstanceOf(Buffer);
        expect((res.headers as { contentType?: string }).contentType).toBeUndefined();
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(bufferToString(res.body as number[])).toMatch('just a file');
        expect(res).toSatisfyApiSpec();
      });
    });

    /******************************************************************** */
    // Currently, we don't have any upload scenarios.
    // This will be used when it becomes relevant in the future (probably should be revised).
    /******************************************************************** */
    // describe('uploadFile', () => {
    //   it('should write a new file', async () => {
    //     const res = await requestSender.writeStreamFile('/\\\\Second_mount_dir/zipFile.zip');
    //     expect(res.status).toBe(httpStatusCodes.CREATED);

    //     let isFileExist = false;

    //     try {
    //       await promises.access(`${MOCK_FOLDER_PREFIX}/MOCKS_2/zipFile.zip`, constants.F_OK);
    //       isFileExist = true;
    //     } catch {
    //       isFileExist = false;
    //     }

    //     unlink(`${MOCK_FOLDER_PREFIX}/MOCKS_2/zipFile.zip`, () => {
    //       console.log('Delete file successfully');
    //     });

    //     expect(res).toSatisfyApiSpec();
    //     expect(isFileExist).toBe(true);
    //   });
    // });

    describe('decryptId', () => {
      it('should return the correct decrypted path', async () => {
        const directoryId = 'eJzT0y9JLS4p1vf1d_YOhpAAPNUF6Q--';
        const res = await requestSender.getDecryptedId(directoryId);
        expect(res.type).toBe('application/json');
        expect(res.status).toBe(httpStatusCodes.OK);
        expect(res.body).toMatchObject(decryptedIdRes);
        expect(res).toSatisfyApiSpec();
      });
    });
  });

  describe('given invalid params', () => {
    describe('directory', () => {
      it('should return 400 if a file path supplied', async () => {
        const res = await requestSender.getDirectory('/\\\\First_mount_dir/3D_data/1b/metadata.json');
        expect(res.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(res).toSatisfyApiSpec();
      });

      it('should return 404 if path not found', async () => {
        const res = await requestSender.getDirectory('/\\\\First_mount_dir/3D_data/1b/3b');
        expect(res.status).toBe(httpStatusCodes.NOT_FOUND);
        expect(res).toSatisfyApiSpec();
      });

      it('should return 500 if required query not provided', async () => {
        const res = await requestSender.getDirectoryWithoutQuery();
        // When connecting to a real server there's open api which should handle these errors
        // expect(status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(res.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(res).toSatisfyApiSpec();
      });

      it('should return 400 for invalid path (Directories traversal)', async () => {
        const res = await requestSender.getDirectory('../../../');
        expect(res.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(res).toSatisfyApiSpec();
      });
    });

    describe('file', () => {
      it('should return 404 if path not found', async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/3D_data/1b/not_there.json');
        expect(res.status).toBe(httpStatusCodes.NOT_FOUND);
        expect(res).toSatisfyApiSpec();
      });

      it('should return 400 if required query not provided', async () => {
        const res = await requestSender.getFileWithoutQuery();
        // When connecting to a real server there's open api which should handle these errors
        expect(res.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(res).toSatisfyApiSpec();
      });

      it('should return 400 if buffer size in not a number/undefined', async () => {
        const res = await requestSender.getStreamFile('/\\\\First_mount_dir/zipFile.zip', 'NaN');
        expect(res.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(res).toSatisfyApiSpec();
      });
    });

    /******************************************************************** */
    // Currently, we don't have any upload scenarios.
    // This will be used when it becomes relevant in the future (probably should be revised).
    /******************************************************************** */
    // describe('uploadFile', () => {
    //   it('should return 404 if path directory not found', async () => {
    //     const res = await requestSender.writeStreamFile('/\\\\First_mount_dir/3D_data/1b/not_exist_dir/not_there.json');
    //     expect(res.status).toBe(httpStatusCodes.NOT_FOUND);
    //     expect(res).toSatisfyApiSpec();
    //   });

    //   it('should return 400 if buffer size in not a number/undefined', async () => {
    //     const res = await requestSender.writeStreamFile('/\\\\First_mount_dir/zipFile.zip', 'NaN');
    //     expect(res.status).toBe(httpStatusCodes.BAD_REQUEST);
    //     expect(res).toSatisfyApiSpec();
    //   });
    // });

    describe('file by id', () => {
      it('should return 500 if id is not valid', async () => {
        const res = await requestSender.getFileById('iYl0xZ28wqXUIZ_pP_XU0v0i0EhFUpjD1QzJQsD7hO9.dPkcbmbb4pbPjUyek6');
        expect(res.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(res).toSatisfyApiSpec();
      });

      it('should return 500 if required query not provided', async () => {
        const res = await requestSender.getFileByIdWithoutQuery();
        // When connecting to a real server there's open api which should handle these errors
        // expect(status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(res.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(res).toSatisfyApiSpec();
      });
    });

    describe('decryptId', () => {
      it('should return 500 if id is not valid', async () => {
        const res = await requestSender.getDecryptedId('iYl0xZ28wqXUIZ_pP_XU0v0i0EhFUpjD1QzJQsD7hO9.dPkcbmbb4pbPjUyek6');
        expect(res.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(res).toSatisfyApiSpec();
      });

      it('should return 500 if required query not provided', async () => {
        const res = await requestSender.getDecryptedIdWithoutQuery();
        // When connecting to a real server ther's open api which should handle these errors
        // expect(status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(res.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(res).toSatisfyApiSpec();
      });
    });
  });

  describe('given invalid route', function () {
    it('should return 404', async () => {
      const res = await requestSender.getNoValidRoute();
      expect(res.status).toBe(httpStatusCodes.NOT_FOUND);
    });

    it('should also return 404 for main route', async () => {
      const res = await requestSender.getNoValidUrl();
      expect(res.status).toBe(httpStatusCodes.NOT_FOUND);
    });
  });
});
