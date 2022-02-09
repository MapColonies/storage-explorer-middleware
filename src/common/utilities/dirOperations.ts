import { promises as fsPromises, Dirent, PathLike, createReadStream, statSync, existsSync } from 'fs';
import * as Path from 'path';
import { BadRequestError, NotFoundError, InternalServerError } from '@map-colonies/error-types';
import { ImountDirObj, IStream } from '../interfaces';
import IFile from '../../storageExplorer/models/file.model';
import { LoggersHandler } from '.';
import { encryptPath } from '.';

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

  public generateRootDir(): IFile[] {
    this.logger.info('[DirOperations][generateRootDir] generating mounts root dir');
    const mountDirectories = this.mountDirs;

    const mountFilesArr = mountDirectories.map((mountDir) => {
      const dirStats = statSync(mountDir.physical);

      const fileFromMountDir: IFile = {
        id: encryptPath(mountDir.physical),
        name: mountDir.displayName,
        isDir: true,
        parentId: encryptPath('/'),
        modDate: dirStats.mtime,
      };

      return fileFromMountDir;
    });

    return mountFilesArr;
  }

  public async getDirectoryContent(path: PathLike): Promise<Dirent[]> {
    this.logger.info(`[DirOperations][getDirectoryContent] fetching directory of path ${path as string}`);
    const isDirExists = existsSync(path);

    if (!isDirExists) {
      throw new NotFoundError(StorageExplorerErrors.FILE_NOT_FOUND);
    }

    const isDir = statSync(path).isDirectory();

    if (!isDir) {
      throw new BadRequestError(StorageExplorerErrors.PATH_IS_NOT_DIR);
    }

    return fsPromises.readdir(path, { withFileTypes: true });
  }

  public getJsonFileStream(path: PathLike): IStream {
    this.logger.info(`[DirOperations][getJsonFileStream] fetching file at path ${path as string}`);
    const isFileExists = existsSync(path);

    if (!isFileExists) {
      throw new NotFoundError(StorageExplorerErrors.FILE_NOT_FOUND);
    }

    const isJson = Path.extname(path as string) === '.json';

    if (!isJson) {
      throw new BadRequestError(StorageExplorerErrors.FILE_TYPE_NOT_SUPPORTED);
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
      throw new InternalServerError(StorageExplorerErrors.STREAM_CREATION_ERR);
    }
  }
}

export default DirOperations;
