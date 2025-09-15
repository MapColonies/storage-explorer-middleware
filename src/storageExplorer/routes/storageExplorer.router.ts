import { Router } from 'express';
import { StorageExplorerController } from '../controllers/storageExplorer.controller';

const storageExplorerRouter = (controller: StorageExplorerController): Router => {
  const router = Router();

  router.get('/directory', controller.getDirectory);
  router.get('/directorybyid', controller.getdirectoryById);
  router.get('/file', controller.getStreamFile);
  router.get('/zipshape', controller.getZipShapefile);
  /******************************************************************** */
  // Currently, we don't have any upload scenarios.
  // This will be used when it becomes relevant in the future (probably should be revised).
  /******************************************************************** */
  // router.post('/file', controller.writeStreamFile);
  router.get('/filebyid', controller.getFileById);
  router.get('/decryptid', controller.decryptId);

  return router;
};

export const explorerRoutes = (controller: StorageExplorerController): Router => {
  const router = Router();
  router.use('/explorer', storageExplorerRouter(controller));
  return router;
};
