import { promises as fsPromises, Dirent, PathLike, createReadStream, statSync, existsSync } from 'fs';
import * as Path from 'path';
import { BadRequestError, NotFoundError, InternalServerError } from '@map-colonies/error-types';
import { ImountDirObj, IStream } from '../interfaces';
import IFileMap from '../../storageExplorer/models/fileMap.model';
import IFile from '../../storageExplorer/models/file.model';
import LoggersHandler from './LoggersHandler';
import { encryptPath, filesArrayToMapObject } from '.';

class DirOperations {
  private readonly fileNotFoundErr = 'No such file or directory';
  private readonly fileTypeNotSupported = 'File type is not supported';
  private readonly couldNotCreateStream = 'Error creating a stream for the requested file';
  private readonly pathIsNotDir = 'Path is not a directory';
  private readonly invalidPath = 'Invalid path';

  public constructor(private readonly logger: LoggersHandler, private readonly mountDirs: ImountDirObj[]) {}

  // get physical name or regular name
  public getPhysicalPath(path: string): string {
    this.logger.info(`[DirOperations][getPhysicalPath] getting physical path for ${path}`);
    const safePath = Path.normalize(path);
    if (safePath.startsWith('.')) {
      throw new BadRequestError(this.invalidPath);
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

  public generateRootDir(): IFileMap<IFile> {
    this.logger.info('[DirOperations][generateRootDir] generating mounts root dir');
    const mountDirectories = this.mountDirs;

    const mountFilesArr = mountDirectories.map((mountDir) => {
      const fileFromMountDir: IFile = {
        id: encryptPath(mountDir.physical),
        name: mountDir.displayName,
        isDir: true,
        parentId: encryptPath('/'),
      };

      return fileFromMountDir;
    });

    return filesArrayToMapObject(mountFilesArr);
  }

  public async getDirectoryContent(path: PathLike): Promise<Dirent[]> {
    this.logger.info(`[DirOperations][getDirectoryContent] fetching directory of path ${path as string}`);
    const isDirExists = existsSync(path);

    if (!isDirExists) {
      throw new NotFoundError(this.fileNotFoundErr);
    }

    const isDir = statSync(path).isDirectory();

    if (!isDir) {
      throw new BadRequestError(this.pathIsNotDir);
    }

    return fsPromises.readdir(path, { withFileTypes: true });
  }

  public getJsonFileStream(path: PathLike): IStream {
    this.logger.info(`[DirOperations][getJsonFileStream] fetching file at path ${path as string}`);
    const isFileExists = existsSync(path);

    if (!isFileExists) {
      throw new NotFoundError(this.fileNotFoundErr);
    }

    const isJson = Path.extname(path as string) === '.json';

    if (!isJson) {
      throw new BadRequestError(this.fileTypeNotSupported);
    }

    try {
      const stream = createReadStream(path);
      const { size } = statSync(path);
      const fileName = Path.basename(path as string);

      const streamProduct: IStream = {
        stream,
        contentType: 'application/json',
        size,
        name: fileName,
      };

      return streamProduct;
    } catch (e) {
      this.logger.error(`[DirOperations][getJsonFileStream] could not create a stream for file at ${path as string}. error=${(e as Error).message}`);
      throw new InternalServerError(this.couldNotCreateStream);
    }
  }
}

export default DirOperations;
