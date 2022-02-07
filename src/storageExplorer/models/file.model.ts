export interface IFile {
  id: string;
  name: string;
  parentId: string;
  ext?: string;
  isDir?: boolean;
  isHidden?: boolean;
  size?: number;
  modDate?: Date | string;
  childrenCount?: number;
}
