import { promises as fsPromises, Dirent, PathLike, createReadStream, constants as fsConstants, createWriteStream, ReadStream, WriteStream } from 'fs';
import * as Path from 'path';
import { lookup } from '@map-colonies/types';
import busboy from 'busboy';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { BadRequestError, NotFoundError, InternalServerError, ConflictError, HttpError } from '@map-colonies/error-types';
import { ImountDirObj, IReadStream, IWriteStream } from '../interfaces';
import IFile from '../../storageExplorer/models/file.model';
import { LoggersHandler } from '.';
import { encryptZlibPath } from '.';

const { stat: statPromise, access: existsPromise } = fsPromises;

enum StorageExplorerErrors {
  FILE_NOT_FOUND = 'fp.error.file_not_found',
  FILE_TYPE_NOT_SUPPORTED = 'fp.error.file_not_supported',
  STREAM_CREATION_ERR = 'fp.error.stream_creation_err',
  PATH_IS_NOT_DIR = 'fp.error.path_is_not_dir',
  PATH_INVALID = 'fp.error.path_invalid',
}
class DirOperations {
  public constructor(private readonly logger: LoggersHandler, private readonly mountDirs: ImountDirObj[]) {}

  // get physical name or regular name
  public getPhysicalPath(path: string): string {
    this.logger.info(`[DirOperations][getPhysicalPath] getting physical path for ${path}`);
    const safePath = Path.normalize(path.replace(/^\/\\(?!\\)/g, '/\\\\'));

    if (safePath.startsWith('.')) {
      throw new BadRequestError(StorageExplorerErrors.PATH_INVALID);
    }

    const mountDirectories = this.mountDirs.map((mountDir) => {
      return { ...mountDir, displayName: `${mountDir.displayName}`.replace(/\\/g, '\\\\') };
    });

    const selectedDir = mountDirectories.find((mountDir) => {
      return safePath.startsWith(`/${mountDir.displayName}`);
    });

    if (selectedDir) {
      const physicalPath = safePath.replace(`/${selectedDir.displayName}`, selectedDir.physical);
      return physicalPath;
    }

    return safePath;
  }

  public async generateRootDir(): Promise<IFile[]> {
    this.logger.info('[DirOperations][generateRootDir] generating mounts root dir');
    const mountDirectories = this.mountDirs;

    const mountFilesArr = mountDirectories.map(async (mountDir) => {
      const dirStats = await statPromise(mountDir.physical);
      const encryptedId = await encryptZlibPath(mountDir.physical);
      const encryptedParentId = await encryptZlibPath('/');

      const fileFromMountDir: IFile = {
        id: encryptedId,
        name: mountDir.displayName,
        isDir: true,
        parentId: encryptedParentId,
        modDate: dirStats.mtime,
      };

      return fileFromMountDir;
    });

    return Promise.all(mountFilesArr);
  }

  public async getDirectoryContent(path: PathLike, filterFunc: (dirent: Dirent) => boolean): Promise<Dirent[]> {
    this.logger.info(`[DirOperations][getDirectoryContent] fetching directory of path ${path as string}`);
    const isDirExists = await this.checkFileExists(path);

    if (!isDirExists) {
      throw new NotFoundError(StorageExplorerErrors.FILE_NOT_FOUND);
    }

    const isDir = await statPromise(path);

    if (!isDir.isDirectory()) {
      throw new BadRequestError(StorageExplorerErrors.PATH_IS_NOT_DIR);
    }
    const direntArr: Dirent[] = [];
    const dirIterator = await fsPromises.opendir(path);

    for await (const dirent of dirIterator) {
      if (filterFunc(dirent)) {
        direntArr.push(dirent);
      }
    }

    return direntArr;
  }

  public async getReadStream(path: PathLike, buffersize?: number): Promise<IReadStream> {
    this.logger.info(`[DirOperations][getReadStream] fetching file at path ${path as string}`);
    const isFileExists = await this.checkFileExists(path);

    if (!isFileExists) {
      throw new NotFoundError(StorageExplorerErrors.FILE_NOT_FOUND);
    }

    try {
      let stream: ReadStream;
      if (buffersize != undefined && !Number.isNaN(buffersize)) {
        stream = createReadStream(path, { highWaterMark: buffersize });
      } else {
        stream = createReadStream(path);
      }
      const { size } = await statPromise(path);
      const fileName = Path.basename(path as string);

      const mimeType = lookup(path as string);

      const streamProduct: IReadStream = {
        stream,
        contentType: mimeType,
        size,
        name: fileName,
      };

      return streamProduct;
    } catch (e) {
      this.logger.error(`[DirOperations][getReadStream] could not create a stream for file at ${path as string}. error=${(e as Error).message}`);
      if (e instanceof HttpError) {
        throw e;
      } else {
        throw new InternalServerError(StorageExplorerErrors.STREAM_CREATION_ERR);
      }
    }
  }

  public async getWriteStream(path: PathLike, overwrite?: boolean, buffersize?: number): Promise<IWriteStream> {
    this.logger.info(`[DirOperations][getWriteStream] uploading file to path ${path as string}`);
    const isFileExists = await this.checkFileExists(path);

    if (isFileExists && overwrite !== true) {
      throw new ConflictError('File already exists');
    }

    try {
      let stream: WriteStream;

      if (buffersize != undefined && !Number.isNaN(buffersize)) {
        stream = createWriteStream(path, { highWaterMark: buffersize });
      } else {
        stream = createWriteStream(path);
      }

      const fileName = Path.basename(path as string);

      const streamProduct: IWriteStream = {
        stream,
        name: fileName,
      };

      return streamProduct;
    } catch (e) {
      this.logger.error(`[DirOperations][getWriteFileStream] could not create a stream for file at ${path as string}. error=${(e as Error).message}`);
      throw new InternalServerError(StorageExplorerErrors.STREAM_CREATION_ERR);
    }
  }

  public readonly openReadStream = async (
    res: Response,
    filePath: string,
    callerName: string,
    maxSize: number,
    buffersize?: number
  ): Promise<void> => {
    const { stream, contentType, size, name }: IReadStream = await this.getReadStream(filePath, buffersize);

    if (size > maxSize) {
      throw new HttpError('Content Too Large', StatusCodes.REQUEST_TOO_LONG);
    }

    if (contentType !== undefined) {
      res.setHeader('Content-Type', contentType);
    }
    res.setHeader('Content-Length', size);

    const startTime = Date.now();
    let chunkCount = 0;

    stream.pipe(res);

    stream.on('data', () => {
      chunkCount++;
    });

    stream.on('end', () => {
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      this.logger.info(`[DirOperations][${callerName}] successfully streamed file: ${name} after ${totalTime} (ms), chunks: ${chunkCount}`);
    });

    stream.on('error', (error) => {
      this.logger.error(`[DirOperations][${callerName}] failed to stream file: ${name}. error: ${error.message}`);
    });
  };

  public readonly openWriteStream = async (
    req: Request,
    path: string,
    callerName: string,
    overwrite?: boolean,
    buffersize?: number
  ): Promise<void> => {
    const { stream, name } = await this.getWriteStream(path, overwrite, buffersize);

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      req.pipe(stream);

      stream.on('close', () => {
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        this.logger.info(`[DirOperations][${callerName}] Successfully uploaded a file: ${name} after ${totalTime} ms`);
        resolve();
      });

      stream.on('error', (error) => {
        this.logger.error(`[DirOperations][${callerName}] Failed to stream file: ${name}. error: ${error.message}`);
        const isNotFound = error.message.includes('ENOENT') || error.message.includes('ENOTDIR'); // Node.js stream error for "file not found"
        reject(new HttpError(error.message, isNotFound ? StatusCodes.NOT_FOUND : StatusCodes.INTERNAL_SERVER_ERROR));
      });
    });
  };

  public readonly openFormDataWriteStream = async (
    req: Request,
    path: string,
    callerName: string,
    overwrite?: boolean,
    buffersize?: number
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      let chunkCount = 0;

      const bb = busboy({ headers: req.headers });

      bb.on('file', (fieldname, file) => {
        (async (): Promise<void> => {
          const { stream, name } = await this.getWriteStream(path, overwrite, buffersize);

          file.pipe(stream);

          file.on('data', () => {
            chunkCount++;
          });

          stream.on('finish', () => {
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            this.logger.info(`[DirOperations][${callerName}] Successfully streamed file: ${name} after (ms) ${totalTime}, chunks: ${chunkCount}`);
            resolve();
          });

          stream.on('error', (error) => {
            this.logger.error(`[DirOperations][${callerName}] Failed to stream file: ${name}. error: ${error.message}`);
            const isNotFound = error.message.includes('ENOENT') || error.message.includes('ENOTDIR'); // Node.js stream error for "dir/file not found"
            reject(new HttpError(error.message, isNotFound ? StatusCodes.NOT_FOUND : StatusCodes.INTERNAL_SERVER_ERROR));
          });
        })().catch((error) => {
          bb.emit('error', error);
        });
      });

      bb.on('error', (error: Error) => {
        this.logger.error(`[${callerName}] Busboy error: ${error.message}`);
        const isNotFound = error.message.includes('ENOENT'); // Node.js stream error for "dir/file not found"
        reject(new HttpError(error.message, isNotFound ? StatusCodes.NOT_FOUND : StatusCodes.INTERNAL_SERVER_ERROR));
      });

      req.pipe(bb);
    });
  };

  private async checkFileExists(file: PathLike): Promise<boolean> {
    return existsPromise(file, fsConstants.F_OK)
      .then(() => true)
      .catch(() => false);
  }
}

export default DirOperations;
