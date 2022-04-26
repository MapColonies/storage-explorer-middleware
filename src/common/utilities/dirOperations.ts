import { promises as fsPromises, Dirent, PathLike, createReadStream, constants as fsConstants } from 'fs';
import * as Path from 'path';
import { BadRequestError, NotFoundError, InternalServerError } from '@map-colonies/error-types';
import { ImountDirObj, IStream } from '../interfaces';
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

  public async getJsonFileStream(path: PathLike): Promise<IStream> {
    this.logger.info(`[DirOperations][getJsonFileStream] fetching file at path ${path as string}`);
    const isFileExists = await this.checkFileExists(path);

    if (!isFileExists) {
      throw new NotFoundError(StorageExplorerErrors.FILE_NOT_FOUND);
    }

    const isJson = Path.extname(path as string) === '.json';

    if (!isJson) {
      throw new BadRequestError(StorageExplorerErrors.FILE_TYPE_NOT_SUPPORTED);
    }

    try {
      const stream = createReadStream(path);
      const { size } = await statPromise(path);
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

  private async checkFileExists(file: PathLike): Promise<boolean> {
    return existsPromise(file, fsConstants.F_OK)
      .then(() => true)
      .catch(() => false);
  }
}

export default DirOperations;
