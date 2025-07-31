import * as pathModule from 'path';
import * as supertest from 'supertest';
import { MOCK_FOLDER_PREFIX } from '../../../MOCKS/utils';

export class StorageExplorerRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async getDirectory(path: string): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/explorer/directory?path=${path}`).set('Content-Type', 'application/json');
  }

  public async getDirectoryById(id: string): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/explorer/directorybyid?id=${id}`).set('Content-Type', 'application/json');
  }

  public async getDirectoryWithoutQuery(): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/explorer/directory`);
  }

  public async getStreamFile(path: string, bufferSize?: string): Promise<supertest.Response> {
    const bufferQuery = bufferSize !== undefined ? `&bufferSize=${bufferSize}` : '';
    return supertest.agent(this.app).get(`/explorer/file?path=${path}${bufferQuery}`);
  }

  public async writeStreamFile(path: string): Promise<supertest.Response> {
    const filePath = pathModule.resolve(`${MOCK_FOLDER_PREFIX}/MOCKS/zipFile.zip`);
    return supertest.agent(this.app).post(`/explorer/file?path=${path}`).attach('file', filePath, 'newUploadedFile');
  }

  public async getFileWithoutQuery(): Promise<supertest.Response> {
    return supertest.agent(this.app).get('/explorer/file').set('Content-Type', 'application/json');
  }

  public async getFileById(id: string): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/explorer/filebyid?id=${id}`).set('Content-Type', 'application/json');
  }

  public async getFileByIdWithoutQuery(): Promise<supertest.Response> {
    return supertest.agent(this.app).get('/explorer/filebyid').set('Content-Type', 'application/json');
  }

  public async getDecryptedId(id: string): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/explorer/decryptid?id=${id}`).set('Content-Type', 'application/json');
  }

  public async getDecryptedIdWithoutQuery(): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/explorer/decryptid`).set('Content-Type', 'application/json');
  }

  public async getNoValidRoute(): Promise<supertest.Response> {
    return supertest.agent(this.app).get('/explorer/notvalid').set('Content-Type', 'application/json');
  }

  public async getNoValidUrl(): Promise<supertest.Response> {
    return supertest.agent(this.app).get('/idontknow/notvalid').set('Content-Type', 'application/json');
  }
}
