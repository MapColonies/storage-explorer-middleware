import IFile from '../../storageExplorer/models/file.model';
import IFileMap from '../../storageExplorer/models/fileMap.model';

export const filesArrayToMapObject = (filesArr: IFile[]): IFileMap<IFile> => {
  const fileMap: IFileMap<IFile> = {};

  for (const file of filesArr) {
    fileMap[file.id] = file;
  }

  return fileMap;
};
