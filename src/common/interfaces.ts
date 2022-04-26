import { ReadStream } from 'fs';

export interface IStream {
  stream: ReadStream;
  contentType: string;
  size: number;
  name: string;
}

export interface ImountDirObj {
  physical: string;
  displayName: string;
  includeFilesExt?: string[];
}
