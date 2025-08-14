import { ReadStream, WriteStream } from 'fs';

export interface IStream<T> {
  stream: T;
  name: string;
}

export type IReadStream = IStream<ReadStream> & {
  contentType: string | undefined;
  size: number;
};

export type IWriteStream = IStream<WriteStream>;

export interface ImountDirObj {
  physical: string;
  displayName: string;
  includeFilesExt?: string[];
}
