import { Router } from 'express';
import { StorageExplorerController } from '../controllers/storageExplorer.controller';

const storageExplorerRouter = (controller: StorageExplorerController): Router => {
  const router = Router();

  router.get('/directory', controller.getDirectory);
  router.get('/directorybyid', controller.getdirectoryById);
  router.get('/file', controller.getStreamFile);
  router.post('/uploadfile', controller.writeStreamFile);
  router.get('/filebyid', controller.getFileById);
  router.get('/decryptid', controller.decryptId);

  return router;
};

export const explorerRoutes = (controller: StorageExplorerController): Router => {
  const router = Router();
  router.use('/explorer', storageExplorerRouter(controller));
  return router;
};
