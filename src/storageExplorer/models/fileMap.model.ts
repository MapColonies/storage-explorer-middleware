import { IFile } from './';

export interface IFileMap<FT extends IFile> {
  [fieldId: string]: FT;
}
