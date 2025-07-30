import express from 'express';
import getStorageExplorerMiddleware from '../src/storageExplorer/middlewares/getStorageExplorerMiddleware';

const app = express();
const PORT = 5656;

app.use(express.json());

const mountDirs = [
  {
    physical: './MOCKS',
    displayName: '\\layerSource',
    includeFilesExt: ['tif', 'shp', 'gpkg'],
  },
];

const logger = console as unknown as Record<string, unknown>;
app.use(getStorageExplorerMiddleware(mountDirs, logger));

app.listen(PORT, () => {
  console.log(`Helper server listening on ${PORT}`);
});
