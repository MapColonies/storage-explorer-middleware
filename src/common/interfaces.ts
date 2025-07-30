import { ReadStream, WriteStream } from 'fs';

export interface IStream<T> {
  stream: T;
  name: string;
}

export interface IReadStream extends IStream<ReadStream> {
  contentType: string | undefined;
  size: number;
}

export interface IWriteStream extends IStream<WriteStream> {}

export interface ImountDirObj {
  physical: string;
  displayName: string;
  includeFilesExt?: string[];
}
