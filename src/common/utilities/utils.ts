import { IFile, IFileMap } from '../../storageExplorer/models';

export const filesArrayToMapObject = (filesArr: IFile[]): IFileMap<IFile> => {
  const fileMap: IFileMap<IFile> = {};

  for (const file of filesArr) {
    fileMap[file.id] = file;
  }

  return fileMap;
};
