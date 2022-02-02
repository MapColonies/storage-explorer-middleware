// Part of 'chonky' FileData interface https://github.com/TimboKZ/Chonky/blob/2.x/packages/chonky/src/types/file.types.ts
export default interface IFile {
  id: string; // (Required) String that uniquely identifies the file
  name: string; // (Required) Full name, e.g. `MyImage.jpg`
  parentId: string; // Parent dir id.
  ext?: string; // File extension, e.g. `.jpg`
  isDir?: boolean; // Is a directory, default: false
  isHidden?: boolean; // Is a hidden file, default: false
  size?: number; // File size in bytes
  modDate?: Date | string; // Last change date (or its string representation)
  childrenCount?: number; // Number of files inside of a folder (only for folders)
}
