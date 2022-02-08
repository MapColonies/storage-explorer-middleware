import { Router } from 'express';
import { ImountDirObj } from '../../common/interfaces';
import { LoggersHandler } from '../../common/utilities';
import { StorageExplorerController } from '../controllers/storageExplorer.controller';
import { explorerRoutes } from '../routes/storageExplorer.router';

export default function getStorageExplorerMiddleware(mountDirs: ImountDirObj[], logger: Record<string, unknown>): Router {
  const loggersHandler = new LoggersHandler(logger);
  const controller = new StorageExplorerController(loggersHandler, mountDirs);
  const explorerRouter = explorerRoutes(controller);

  return explorerRouter;
}
