import { Dirent, promises as fsPromises } from 'node:fs';
import path from 'path';
import { BadRequestError, HttpError } from '@map-colonies/error-types';
import { RequestHandler, Request } from 'express';
import { StatusCodes } from 'http-status-codes';
import { DirOperations, encryptZlibPath, dencryptZlibPath, LoggersHandler } from '../../common/utilities';
import { ImountDirObj } from '../../common/interfaces';
/* eslint-disable @typescript-eslint/naming-convention */
import IFile from '../models/file.model';

const { stat: statPromise } = fsPromises;

// Should return file content by its id
type GetFileByIdHandler = RequestHandler<undefined, Record<string, unknown>, undefined, { id: string; buffersize?: string }>;

// Should return file stream
type GetFileHandler = RequestHandler<undefined, Record<string, unknown>, undefined, { path: string; buffersize?: string }>;

// Should upload file stream
type UploadFileHandler = RequestHandler<
  Record<string, unknown>,
  Record<string, unknown>,
  undefined,
  { path: string; overwrite?: string; buffersize?: string }
>;

// Should return IFile[] ( directory content )
type GetDirectoryHandler = RequestHandler<undefined, IFile[], undefined, { path: string }>;

// Should return dir content by its id
type GetDirectoryByIdHandler = RequestHandler<undefined, IFile[], undefined, { id: string }>;

// Should decrypt id to path suffix
type DecryptIdHandler = RequestHandler<undefined, { data: string }, undefined, { id: string }>;

const getFileData = async (filePath: string, parentPathEncrypted: string, entry: Dirent): Promise<IFile> => {
  const fileStats = await statPromise(path.join(filePath, entry.name));
  const encryptedPath = await encryptZlibPath(path.join(filePath, entry.name));

  const fileFromEntry: IFile = {
    id: encryptedPath,
    name: entry.name,
    isDir: entry.isDirectory(),
    parentId: parentPathEncrypted,
    size: fileStats.size,
    modDate: fileStats.mtime,
  };

  if (fileFromEntry.isDir) {
    delete fileFromEntry.size;
  }

  return fileFromEntry;
};

// 10 MiB (Mebibytes) or 10 × 1024 × 1024 bytes
export const MAX_FILE_SIZE = 10485760;

// For multiple to reach 10 GiB (Gibibyte)
export const KILO_BYTE = 1024;

export class StorageExplorerController {
  public constructor(
    private readonly logger: LoggersHandler,
    private readonly mountDirs: ImountDirObj[],
    private readonly dirOperations: DirOperations = new DirOperations(logger, mountDirs)
  ) {}

  public getStreamFile: GetFileHandler = async (req, res) => {
    try {
      const path = decodeURIComponent(req.query.path);
      if (!req.query.path || !path) {
        throw new BadRequestError('Missing path in query params');
      }

      const physicalPath: string = this.dirOperations.getPhysicalPath(decodeURIComponent(path));
      const buffersize = Number(req.query.buffersize);
      if (req.query.buffersize !== undefined && Number.isNaN(buffersize)) {
        throw new BadRequestError('Invalid buffersize parameter: must be a number.');
      }

      if (req.headers['x-client-response-type'] === 'stream') {
        await this.dirOperations.openReadStream(res, physicalPath, 'getStreamFile', MAX_FILE_SIZE * KILO_BYTE, buffersize);
      } else {
        await this.dirOperations.openReadStream(res, physicalPath, 'getStreamFile', MAX_FILE_SIZE, buffersize);
      }
    } catch (e) {
      this.logger.error(`[StorageExplorerController][getStreamFile] "${JSON.stringify(e)}"`);
      // TODO: SHOULD BE CONSIDERED TO USE ERROR MIDDLEWARE ({message: } property in this case more like ERR_CODE)
      // ERROR MESSAGE SHOULD LOOKS LIKE fp.error.file_not_found
      res.status((e as HttpError).status || StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e });
    }
  };

  public writeStreamFile: UploadFileHandler = async (req, res) => {
    try {
      const path = decodeURIComponent(req.query.path);
      const overwrite = req.query.overwrite === 'true' ? true : false;
      const contentType = req.headers['content-type'];

      if (!req.query.path || !path) {
        throw new BadRequestError('Missing path in query params');
      }

      const physicalPath = this.dirOperations.getPhysicalPath(path);
      const buffersize = Number(req.query.buffersize);

      if (req.query.buffersize !== undefined && Number.isNaN(buffersize)) {
        throw new BadRequestError('Invalid buffersize parameter: must be a number.');
      }

      if (contentType?.includes('multipart/form-data') === true) {
        await this.dirOperations.openFormDataWriteStream(req as Request, physicalPath, 'writeStreamFile', overwrite, buffersize);
      } else if (contentType === undefined) {
        throw new BadRequestError('File is required');
      } else {
        await this.dirOperations.openWriteStream(req as Request, physicalPath, 'writeStreamFile', overwrite, buffersize);
      }

      res.status(StatusCodes.CREATED).json({});
    } catch (e) {
      res.status((e as HttpError).status || StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e });
    }
  };

  public getFileById: GetFileByIdHandler = async (req, res) => {
    try {
      const fileId: string = req.query.id;
      const pathDecrypted = await dencryptZlibPath(fileId);

      const buffersize = Number(req.query.buffersize);
      if (req.query.buffersize !== undefined && Number.isNaN(buffersize)) {
        throw new BadRequestError('Invalid buffersize parameter: must be a number.');
      }

      await this.dirOperations.openReadStream(res, pathDecrypted, 'getFileById', MAX_FILE_SIZE, buffersize);
    } catch (e) {
      this.logger.error(`[StorageExplorerController][getStreamFile] "${JSON.stringify(e)}"`);
      // TODO: SHOULD BE CONSIDERED TO USE ERROR MIDDLEWARE ({message: } property in this case more like ERR_CODE)
      // ERROR MESSAGE SHOULD LOOKS LIKE fp.error.file_not_found
      res.status((e as HttpError).status || StatusCodes.INTERNAL_SERVER_ERROR).send({ error: (e as HttpError).message || 'An error occurred' });
    }
  };

  public decryptId: DecryptIdHandler = async (req, res, next) => {
    try {
      const encryptedId: string = req.query.id;
      this.logger.info(`[StorageExplorerController][decryptId] decrypting id: "${encryptedId}"`);
      const pathDecrypted = await dencryptZlibPath(encryptedId);
      res.send({ data: pathDecrypted });
    } catch (e) {
      next(e);
    }
  };

  public getDirectory: GetDirectoryHandler = async (req, res, next) => {
    try {
      const path: string = this.dirOperations.getPhysicalPath(req.query.path);
      const dirContentArr = await this.getFilesArray(path);

      res.send(dirContentArr);
    } catch (e) {
      next(e);
    }
  };

  public getdirectoryById: GetDirectoryByIdHandler = async (req, res, next) => {
    try {
      const dirId: string = req.query.id;
      const decryptedPathId = await dencryptZlibPath(dirId);
      const dirContentArr = await this.getFilesArray(decryptedPathId);

      res.send(dirContentArr);
    } catch (e) {
      next(e);
    }
  };

  private readonly getFilterUnsupportedExtFunction = (path: string): ((dirent: Dirent) => boolean) => {
    const currentMountDir = this.mountDirs.find((mount) => (path + '/').startsWith(`${mount.physical}/`));

    if (typeof currentMountDir === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return (_): boolean => true;
    }

    return (file): boolean => {
      const { name } = file;
      const fileExtSplit = file.name.split('.');
      const fileExt = fileExtSplit[fileExtSplit.length - 1];
      if (typeof currentMountDir.includeFilesExt !== 'undefined' && !file.isDirectory()) {
        return currentMountDir.includeFilesExt.includes(fileExt) || name === 'metadata.json';
      }

      return true;
    };
  };

  private readonly getFilesArray = async (path: string): Promise<IFile[]> => {
    if (path === '/') {
      return this.dirOperations.generateRootDir();
    }

    const directoryContent = await this.dirOperations.getDirectoryContent(path, this.getFilterUnsupportedExtFunction(path));
    const encryptedParentPath = await encryptZlibPath(path);
    const dirContentArrayPromise = directoryContent.map(async (entry) => getFileData(path, encryptedParentPath, entry));
    const dirContentArr = await Promise.all(dirContentArrayPromise);

    return dirContentArr;
  };
}
