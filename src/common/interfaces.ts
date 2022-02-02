import { ReadStream } from 'fs';

export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface IStream {
  stream: ReadStream;
  contentType: string;
  size: number;
  name: string;
}

export interface ImountDirObj {
  physical: string;
  displayName: string;
}
