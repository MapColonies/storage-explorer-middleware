import IFile from './file.model';

export default interface IFileMap<FT extends IFile> {
  [fieldId: string]: FT;
}
