import { decryptPath, encryptPath } from '../../../../src/common/utilities';

describe('storage explorer cryptoUtils', () => {
  const path = '/\\\\First_mount_dir/3D_data/1b/product.json';
  const hash = 'Shva6gKIRQuhrtRWmPPg1dMOL5P4Cl8zr35J.PQwY0ynINBVB6gIaMkF3wl1GE8Q';

  describe('#encryptPath', () => {
    it('should return url-safe encrypted path', () => {
      const encrypted = encryptPath([path])[0];
      expect(encrypted).toBe(hash);
    });

    it('should return decrypted path', () => {
      const decrypted = decryptPath([hash])[0];
      expect(decrypted).toBe(path);
    });
  });
});
