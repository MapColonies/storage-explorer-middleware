import express, { json } from 'express';
import jsLogger from '@map-colonies/js-logger';
import getStorageExplorerMiddleware from '../src/storageExplorer/middlewares/getStorageExplorerMiddleware';
import { MOCK_FOLDER_PREFIX } from '../tests/MOCKS/utils';

const app = express();
const PORT = 5656;

app.use(json());

const mountDirs = [
  {
    physical: `${MOCK_FOLDER_PREFIX}/MOCKS`,
    displayName: '\\firstLayerSource',
    includeFilesExt: ['tif'],
  },
  {
    physical: `${MOCK_FOLDER_PREFIX}/MOCKS_2`,
    displayName: '\\secondLayerSource',
  },
  {
    physical: `${MOCK_FOLDER_PREFIX}/MOCKS_3`,
    displayName: '\\thirdLayerSource',
  },
];

const logger = jsLogger() as unknown as Record<string, unknown>;
app.use(getStorageExplorerMiddleware(mountDirs, logger));

app.listen(PORT, () => {
  console.log(`Helper server listening on ${PORT}`);
});
