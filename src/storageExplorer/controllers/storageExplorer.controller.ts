import { Dirent, promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { IncomingHttpHeaders } from 'node:http';
import { BadRequestError, HttpError } from '@map-colonies/error-types';
import { RequestHandler, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { DirOperations, encryptZlibPath, dencryptZlibPath, LoggersHandler } from '../../common/utilities';
import { ImountDirObj } from '../../common/interfaces';
/* eslint-disable @typescript-eslint/naming-convention */
import IFile from '../models/file.model';

const { stat: statPromise } = fsPromises;

// Should return file content by its id
type GetFileByIdHandler = RequestHandler<undefined, Record<string, unknown>, undefined, { id: string; buffersize?: number }>;

// Should return file stream
type GetFileHandler = RequestHandler<undefined, Record<string, unknown>, undefined, { path: string; buffersize?: number }>;

type GetZipFileHandler = RequestHandler<undefined, Record<string, unknown>, undefined, { folder: string; name: string; buffersize?: number }>;

// Should upload file stream
type UploadFileHandler = RequestHandler<
  Record<string, unknown>, // Params
  Record<string, unknown>, // Response
  undefined, // Body
  { path: string; overwrite?: boolean; buffersize?: number } // Query
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

const SHAPEFILE_ALLOWED_EXTENSIONS = ['.shp', '.shx', '.dbf', '.prj', '.sbn', '.sbx', '.xml', '.cpg', '.qix'];

const MiB = 1048576;
const bufferSizeEnv = Number(process.env.STORAGE_EXPLORER_BUFFER_SIZE);
// eslint-disable-next-line @typescript-eslint/no-magic-numbers
export const MAX_BUFFER_SIZE = Number.isFinite(bufferSizeEnv) ? bufferSizeEnv : MiB * 10;

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

      const buffersize = this.convertAndValidateBufferSize(req.query.buffersize);

      await this.openReadStream(req.headers, res, physicalPath, buffersize, 'getStreamFile');
    } catch (e) {
      this.sendError(res, e, 'getStreamFile');
    }
  };

  public getZipShapefile: GetZipFileHandler = async (req, res) => {
    try {
      const folder = decodeURIComponent(req.query.folder);
      const name = decodeURIComponent(req.query.name);

      const bufferSize = this.convertAndValidateBufferSize(req.query.buffersize);

      const physicalFolder: string = this.dirOperations.getPhysicalPath(decodeURIComponent(folder));

      if (!req.query.folder || !physicalFolder) {
        throw new BadRequestError('Missing path in query params');
      }

      const fileNameRegex = new RegExp(/^((?!\.{1,2}$)[a-zA-Z0-9._-]+)$/);

      if (!fileNameRegex.test(req.query.name)) {
        throw new BadRequestError('query "name" must be a file name');
      }

      if (req.headers['x-client-response-type'] === 'stream') {
        await this.dirOperations.createZipAndOpenReadStream(
          res,
          physicalFolder,
          name,
          'getZipShapefile',
          MAX_BUFFER_SIZE * KILO_BYTE,
          SHAPEFILE_ALLOWED_EXTENSIONS,
          bufferSize
        );
      } else {
        await this.dirOperations.createZipAndOpenReadStream(
          res,
          physicalFolder,
          name,
          'getZipShapefile',
          MAX_BUFFER_SIZE,
          SHAPEFILE_ALLOWED_EXTENSIONS,
          bufferSize
        );
      }
    } catch (e) {
      this.sendError(res, e, 'getZipShapefile');
    }
  };

  public writeStreamFile: UploadFileHandler = async (req, res) => {
    try {
      const path = decodeURIComponent(req.query.path);
      const overwrite = req.query.overwrite ?? false;
      const contentType = req.headers['content-type'];

      if (!req.query.path || !path) {
        throw new BadRequestError('Missing path in query params');
      }

      const physicalPath = this.dirOperations.getPhysicalPath(path);
      const buffersize = Number(req.query.buffersize);

      if (req.query.buffersize !== undefined && !(buffersize > 0)) {
        throw new BadRequestError('Invalid buffersize parameter: must be a number.');
      }

      if (contentType?.includes('multipart/form-data') === true) {
        await this.dirOperations.openFormDataWriteStream(req as unknown as Request, physicalPath, 'writeStreamFile', overwrite, buffersize);
      } else if (contentType === undefined) {
        throw new BadRequestError('File is required');
      } else {
        await this.dirOperations.openWriteStream(req as unknown as Request, physicalPath, 'writeStreamFile', overwrite, buffersize);
      }

      res.status(StatusCodes.CREATED).json({});
    } catch (e) {
      this.sendError(res, e, 'writeStreamFile');
    }
  };

  public getFileById: GetFileByIdHandler = async (req, res) => {
    try {
      const fileId: string = req.query.id;
      const pathDecrypted = await dencryptZlibPath(fileId);

      const buffersize = Number(req.query.buffersize);
      if (req.query.buffersize !== undefined && !(buffersize > 0)) {
        throw new BadRequestError('Invalid buffersize parameter: must be a number.');
      }

      await this.openReadStream(req.headers, res, pathDecrypted, buffersize, 'getFileById');
    } catch (e) {
      this.sendError(res, e, 'getFileById');
    }
  };

  public decryptId: DecryptIdHandler = async (req, res) => {
    try {
      const encryptedId: string = req.query.id;
      this.logger.info(`[StorageExplorerController][decryptId] decrypting id: "${encryptedId}"`);
      const pathDecrypted = await dencryptZlibPath(encryptedId);
      res.send({ data: pathDecrypted });
    } catch (e) {
      this.sendError(res, e, 'decryptId');
    }
  };

  public getDirectory: GetDirectoryHandler = async (req, res) => {
    try {
      const path: string = this.dirOperations.getPhysicalPath(req.query.path);
      const dirContentArr = await this.getFilesArray(path);

      res.send(dirContentArr);
    } catch (e) {
      this.sendError(res, e, 'getDirectory');
    }
  };

  public getdirectoryById: GetDirectoryByIdHandler = async (req, res) => {
    try {
      const dirId: string = req.query.id;
      const decryptedPathId = await dencryptZlibPath(dirId);
      const dirContentArr = await this.getFilesArray(decryptedPathId);

      res.send(dirContentArr);
    } catch (e) {
      this.sendError(res, e, 'getdirectoryById');
    }
  };

  private readonly convertAndValidateBufferSize = (bufferSize: number | undefined): number => {
    const buffersizeVal = Number(bufferSize);

    if (bufferSize !== undefined && !(buffersizeVal > 0)) {
      throw new BadRequestError('Invalid buffersize parameter: must be a positive number.');
    } else if (buffersizeVal > MAX_BUFFER_SIZE) {
      throw new BadRequestError(`Invalid buffersize parameter: must be lower then ${MAX_BUFFER_SIZE}.`);
    }

    return buffersizeVal;
  };

  private readonly openReadStream = async (
    headers: IncomingHttpHeaders,
    res: Response,
    filePath: string,
    buffersize: number,
    callerName: string
  ): Promise<void> => {
    if (headers['x-client-response-type'] === 'stream') {
      await this.dirOperations.openReadStream(res, filePath, callerName, MAX_BUFFER_SIZE * KILO_BYTE, buffersize);
    } else {
      await this.dirOperations.openReadStream(res, filePath, callerName, MAX_BUFFER_SIZE, buffersize);
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

  private readonly sendError = (res: Response, e: unknown, caller: string): void => {
    // TODO: SHOULD BE CONSIDERED TO USE ERROR MIDDLEWARE ({message: } property in this case more like ERR_CODE)
    // ERROR MESSAGE SHOULD LOOKS LIKE fp.error.file_not_found

    this.logger.error(`[StorageExplorerController][${caller}] "${JSON.stringify(e)}"`);

    const statusCode = e instanceof HttpError ? e.status : StatusCodes.INTERNAL_SERVER_ERROR;
    let errorMessage = 'An unexpected error occurred';

    if (e instanceof Error) {
      errorMessage = e.message || errorMessage;
    }

    res.status(statusCode).send({ message: errorMessage });
  };
}
