/* eslint-disable import/exports-last */
import { Dirent, promises as fsPromises } from 'fs';
import path from 'path';
import { BadRequestError, HttpError } from '@map-colonies/error-types';
import busboy from 'busboy';
import { RequestHandler, Response, Request } from 'express';
import { StatusCodes } from 'http-status-codes';
import { DirOperations, encryptZlibPath, dencryptZlibPath } from '../../common/utilities';
import { ImountDirObj, IReadStream } from '../../common/interfaces';
import { LoggersHandler } from '../../common/utilities';
import IFile from '../models/file.model';

const { stat: statPromise } = fsPromises;

// Should return file content by its id
type GetFileByIdHandler = RequestHandler<undefined, Record<string, unknown>, undefined, { id: string }>;

// Should return file stream
type GetFileHandler = RequestHandler<undefined, Record<string, unknown>, undefined, { path: string; buffersize?: number }>;

// Should upload file stream
type UploadFileHandler = RequestHandler<Record<string, unknown>, Record<string, unknown>, undefined, { path: string }>;

// Should return IFile[] ( directory content )
type GetDirectoryHandler = RequestHandler<undefined, IFile[], undefined, { path: string }>;

// Should return dir content by its id
type GetDirectoryByIdHandler = RequestHandler<undefined, IFile[], undefined, { id: string }>;

// Should decrypt id to path suffix
type DecryptIdHandler = RequestHandler<undefined, { data: string }, undefined, { id: string }>;

export class StorageExplorerController {
  public constructor(
    private readonly logger: LoggersHandler,
    private readonly mountDirs: ImountDirObj[],
    private readonly dirOperations: DirOperations = new DirOperations(logger, mountDirs)
  ) {}

  public getStreamFile: GetFileHandler = async (req, res) => {
    try {
      const path: string = this.dirOperations.getPhysicalPath(req.query.path);
      const bufferSize = Number(req.query.buffersize);
      if (req.query.buffersize !== undefined && Number.isNaN(bufferSize)) {
        throw new BadRequestError('Invalid bufferSize parameter: must be a number.');
      }
      await this.sendReadStream(res, path, 'getStreamFile', bufferSize);
    } catch (e) {
      this.logger.error(`[StorageExplorerController][getStreamFile] "${JSON.stringify(e)}"`);
      // TODO: SHOULD BE CONSIDERED TO USE ERROR MIDDLEWARE ({message: } property in this case more like ERR_CODE)
      // ERROR MESSAGE SHOULD LOOKS LIKE fp.error.file_not_found
      res.status((e as HttpError).status || StatusCodes.INTERNAL_SERVER_ERROR).send({ error: JSON.stringify(e) });
    }
  };

  public writeStreamFile: UploadFileHandler = async (req, res) => {
    try {
      const path = req.query.path;
      const contentType = req.headers['content-type'];

      if (!path) {
        throw new BadRequestError('Missing path in query params');
      }

      const physicalPath = this.dirOperations.getPhysicalPath(path);

      if (contentType?.includes('multipart/form-data')) {
        await this.sendWriteStreamFormData(req as Request, physicalPath, 'writeStreamFile');
      } else {
        await this.sendWriteStream(req as Request, physicalPath, 'writeStreamFile');
      }

      res.status(StatusCodes.CREATED).send();
    } catch (e) {
      res.status((e as HttpError).status || StatusCodes.INTERNAL_SERVER_ERROR).send({ error: JSON.stringify(e) });
    }
  };

  public getFileById: GetFileByIdHandler = async (req, res, next) => {
    try {
      const fileId: string = req.query.id;
      const pathDecrypted = await dencryptZlibPath(fileId);
      await this.sendReadStream(res, pathDecrypted, 'getFileById');
    } catch (e) {
      next(e);
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

  private readonly sendReadStream = async (res: Response, filePath: string, callerName: string, bufferSize?: number): Promise<void> => {
    const { stream, contentType, size, name }: IReadStream = await this.dirOperations.getReadStream(filePath, bufferSize);

    if (contentType !== undefined) {
      res.setHeader('Content-Type', contentType);
    }
    res.setHeader('Content-Length', size);

    const startTime = performance.now();
    let chunkCount = 0;
    // let totalBytes = 0;

    stream.pipe(res);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    stream.on('data', (chunk: Buffer) => {
      chunkCount++;
      // totalBytes += chunk.length;
      // console.log(`Chunk ${chunkCount}: ${chunk.length} bytes`);
    });

    stream.on('end', () => {
      const endTime = performance.now();
      const totalTime = Math.round(endTime - startTime);
      this.logger.info(
        `[StorageExplorerController][${callerName}] successfully streamed file: ${name} after ${totalTime} (ms), of total amont of ${chunkCount} chunks`
      );
    });

    stream.on('error', (error) => {
      this.logger.error(`[StorageExplorerController][${callerName}] failed to stream file: ${name}. error: ${error.message}`);
    });
  };

  private readonly sendWriteStream = async (req: Request, path: string, callerName: string): Promise<void> => {
    const { stream, name } = await this.dirOperations.getWriteStream(path);
    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      req.pipe(stream);

      stream.on('close', () => {
        const endTime = performance.now();
        const totalTime = Math.round(endTime - startTime);
        this.logger.info(`[StorageExplorerController][${callerName}] Successfully uploaded a file: ${name} after ${totalTime} ms`);
        resolve();
      });

      stream.on('error', (error) => {
        this.logger.error(`[StorageExplorerController][${callerName}] Failed to stream file: ${name}. error: ${error.message}`);
        const isNotFound = error.message.includes('ENOENT'); // Node.js stream error for "file not found"
        reject(new HttpError(error.message, isNotFound ? StatusCodes.NOT_FOUND : StatusCodes.INTERNAL_SERVER_ERROR));
      });
    });
  };

  private readonly sendWriteStreamFormData = async (req: Request, path: string, callerName: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();

      const bb = busboy({ headers: req.headers });

      bb.on('file', (fieldname, file, fileInfo) => {
        (async (): Promise<void> => {
          const { stream, name } = await this.dirOperations.getWriteStream(path);

          file.pipe(stream);

          stream.on('finish', () => {
            const endTime = performance.now();
            const totalTime = Math.round(endTime - startTime);
            this.logger.info(`[StorageExplorerController][${callerName}] Successfully streamed file: ${name} after (ms) ${totalTime}`);
            resolve();
          });

          stream.on('error', (error) => {
            this.logger.error(`[${callerName}] Failed to stream file: ${name}. Error: ${error.message}`);
            reject(error);
          });
        })().catch((error) => {
          bb.emit('error', error);
        });
      });

      bb.on('error', (error) => {
        this.logger.error(`[${callerName}] Busboy error: ${(error as Error).message}`);
        reject(error);
      });

      req.pipe(bb);
    });
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
