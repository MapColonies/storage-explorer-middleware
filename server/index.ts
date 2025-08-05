import express from 'express';
import getStorageExplorerMiddleware from '../src/storageExplorer/middlewares/getStorageExplorerMiddleware';

const MOCK_FOLDER_PREFIX = './tests/MOCKS';

const app = express();
const PORT = 5656;

app.use(express.json());

const mountDirs = [
  {
    physical: `${MOCK_FOLDER_PREFIX}/MOCKS`,
    displayName: '\\firstLayerSource1',
    includeFilesExt: ['tif'],
  },
  {
    physical: `${MOCK_FOLDER_PREFIX}/MOCKS_2`,
    displayName: '\\secondLayerSource2',
  },
  {
    physical: `${MOCK_FOLDER_PREFIX}/MOCKS_3`,
    displayName: '\\thirdLayerSource3',
  },
];

const logger = console as unknown as Record<string, unknown>;
app.use(getStorageExplorerMiddleware(mountDirs, logger));

app.listen(PORT, () => {
  console.log(`Helper server listening on ${PORT}`);
});
