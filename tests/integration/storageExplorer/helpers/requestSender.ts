import * as supertest from 'supertest';

export class StorageExplorerRequestSender {
  public constructor(private readonly app: Express.Application) {}

  public async getDirectory(pathSuffix: string): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/explorer/directory?pathSuffix=${pathSuffix}`).set('Content-Type', 'application/json');
  }

  public async getDirectoryById(id: string): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/explorer/directorybyid?id=${id}`).set('Content-Type', 'application/json');
  }

  public async getDirectoryWithoutQuery(): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/explorer/directory`).set('Content-Type', 'application/json');
  }

  public async getFile(pathSuffix: string): Promise<supertest.Response> {
    return supertest.agent(this.app).get(`/explorer/file?pathSuffix=${pathSuffix}`).set('Content-Type', 'application/json');
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
