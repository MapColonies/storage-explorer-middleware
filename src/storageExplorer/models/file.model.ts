export default interface IFile {
  id: string;
  name: string;
  parentId: string;
  isDir: boolean;
  modDate: Date | string;
  size?: number; // bytes
  childrenCount?: number;
  childrenIds?: string[];
}
