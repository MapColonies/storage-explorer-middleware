/* eslint-disable import/exports-last */
import path from 'path';
import { Dirent } from 'fs';
import { stat as statPromise } from 'fs/promises';
import { RequestHandler, Response } from 'express';
import { InternalServerError } from '@map-colonies/error-types';
import { DirOperations, encryptZlibPath, dencryptZlibPath } from '../../common/utilities';
import { ImountDirObj, IStream } from '../../common/interfaces';
import { LoggersHandler } from '../../common/utilities';
import IFile from '../models/file.model';

// Should return file content by its id
type GetFileByIdHandler = RequestHandler<undefined, Record<string, unknown>, undefined, { id: string }>;

// Should return file stream
type GetFileHandler = RequestHandler<undefined, Record<string, unknown>, undefined, { pathSuffix: string }>;

// Should return IFile[] ( directory content )
type GetDirectoryHandler = RequestHandler<undefined, IFile[], undefined, { pathSuffix: string }>;

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

  public getFile: GetFileHandler = async (req, res, next) => {
    try {
      const pathSuffix: string = this.dirOperations.getPhysicalPath(req.query.pathSuffix);
      const filePath = pathSuffix;
      await this.sendStream(res, 'getFile', filePath);
    } catch (e) {
      next(e);
    }
  };

  public getFileById: GetFileByIdHandler = async (req, res, next) => {
    try {
      const fileId: string = req.query.id;
      const pathDecrypted = await dencryptZlibPath(fileId);
      await this.sendStream(res, 'getFileById', pathDecrypted);
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
      const pathSuffix: string = this.dirOperations.getPhysicalPath(req.query.pathSuffix);
      const dirContentArr = await this.getFilesArray(pathSuffix);

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

  private readonly sendStream = async (res: Response, controllerName: string, filePath: string): Promise<void> => {
    const { stream, contentType, size, name }: IStream = await this.dirOperations.getJsonFileStream(filePath);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', size);

    stream.pipe(res);
    stream.on('open', () => {
      this.logger.info(`[StorageExplorerController][${controllerName}] Starting to stream file: ${name} `);
    });
    stream.on('end', () => {
      this.logger.info(`[StorageExplorerController][${controllerName}] Successfully streamed file: ${name}`);
    });
    stream.on('error', (error) => {
      this.logger.error(`[StorageExplorerController][${controllerName}] failed to stream file: ${name}. error: ${error.message}`);
      throw new InternalServerError(error);
    });
  };

  private readonly filterUnsupportedExt = (pathSuffix: string, files: Dirent[]): Dirent[] => {
    const currentMountDir = this.mountDirs.find((mount) => (pathSuffix + '/').startsWith(`${mount.physical}/`));

    if (typeof currentMountDir === 'undefined') {
      return files;
    }

    return files.filter((file) => {
      const { name } = file;
      const fileExt = file.name.split('.')[1];
      if (typeof currentMountDir.includeFilesExt !== 'undefined' && !file.isDirectory()) {
        return (currentMountDir.includeFilesExt as string[]).includes(fileExt) || name === 'metadata.json';
      }

      return true;
    });
  };

  private readonly getFilesArray = async (pathSuffix: string): Promise<IFile[]> => {
    if (pathSuffix === '/') {
      return this.dirOperations.generateRootDir();
    }

    const directoryContent = await this.dirOperations.getDirectoryContent(pathSuffix);
    const filteredDirContent = this.filterUnsupportedExt(pathSuffix, directoryContent);
    const encryptedParentPath = await encryptZlibPath(pathSuffix);
    const dirContentArrayPromise = filteredDirContent.map(async (entry) => getFileData(pathSuffix, encryptedParentPath, entry));
    const dirContentArr = await Promise.all(dirContentArrayPromise);

    return dirContentArr;
  };
}

const getFileData = async (filePath: string, parentPathEncrypted: string, entry: Dirent): Promise<IFile> => {
  const fileStats = await statPromise(filePath);
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
