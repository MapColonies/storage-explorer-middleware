import { dencryptZlibPath, encryptZlibPath } from '../../../../src/common/utilities';

describe('storage explorer cryptoUtils', () => {
  const path = '/\\\\First_mount_dir/3D_data/1b/product.json';
  const hash = 'eJzTj4lxyywqLonPzS_NK4lPySzSN3aJT0ksSdQ3TNIvKMpPKU0u0csqzs8DAE1ZD5k-';

  describe('#encryptPath', () => {
    it('should return url-safe encrypted path', async () => {
      const encrypted = await encryptZlibPath(path);
      expect(encrypted).toBe(hash);
    });

    it('should return decrypted path', async () => {
      const decrypted = await dencryptZlibPath(hash);
      expect(decrypted).toBe(path);
    });
  });
});
