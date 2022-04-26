// import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import { InternalServerError } from '@map-colonies/error-types';

// interface PathEncryptionOptions {
//   keySize: number;
//   ivSize: number;
//   encryptionPass: string;
//   salt: string;
//   iv: string;
//   algorithm: string;
//   outputType: 'base64' | 'binary' | 'hex';
// }

// const pathEncryption: PathEncryptionOptions = {
//   keySize: 24,
//   ivSize: 16,
//   encryptionPass: 'PATH_PASS',
//   salt: 'PATH_SALT',
//   iv: 'PATH_IV',
//   algorithm: 'aes-192-cbc',
//   outputType: 'base64',
// };

// const { keySize, ivSize, encryptionPass, iv, algorithm, salt, outputType } = pathEncryption;

// const pathIv = Buffer.alloc(ivSize, iv);

// export const encryptCryptoPath = (pathsArr: string[]): string[] => {
//   try {
//     const key = crypto.scryptSync(encryptionPass, salt, keySize);
//     const cipher = crypto.createCipheriv(algorithm, key, pathIv);
//     const encryptedPaths = pathsArr.map((path) => Buffer.concat([cipher.update(path), cipher.final()]).toString(outputType));

//     return encryptedPaths.map((path) => urlEncodeBase64(path));
//   } catch (e) {
//     throw new InternalServerError(`Couldn't create encryption for these paths error: ${e as string}`);
//   }
// };

// export const decryptCryptoPath = (encryptedPathsArr: string[]): string[] => {
//   try {
//     const key = crypto.scryptSync(encryptionPass, salt, keySize);
//     const decipher = crypto.createDecipheriv(algorithm, key, pathIv);

//     const decryptedPathsBuffers = encryptedPathsArr.map((path) =>
//       Buffer.concat([decipher.update(urlDecodeBase64(path), outputType), decipher.final()]).toString()
//     );

//     return decryptedPathsBuffers;
//   } catch (e) {
//     throw new InternalServerError("Couldn't decrypt the provided ids");
//   }
// };

/*
 When sending base64 encoding via query params it omits some special characters.
 We use these functions to encode and decode the cipher to and from url safe, into a valid token.
*/

function urlEncodeBase64(base64Input: string): string {
  return base64Input.replace(/\+/g, '.').replace(/\//g, '_').replace(/=/g, '-');
}

function urlDecodeBase64(encodedBase64Input: string): string {
  return encodedBase64Input.replace(/\./g, '+').replace(/_/g, '/').replace(/-/g, '=');
}

const deflatePromise = promisify(zlib.deflate);
const inflatePromise = promisify(zlib.inflate);

export const encryptZlibPath = async (path: string): Promise<string> => {
  try {
    const deflateBuffer = await deflatePromise(path);

    return urlEncodeBase64(deflateBuffer.toString('base64'));
  } catch (e) {
    throw new InternalServerError("Couldn't encrypt the provided id");
  }
};

export const dencryptZlibPath = async (encryptPath: string): Promise<string> => {
  try {
    const decodedEncryptedPath = urlDecodeBase64(encryptPath);
    const inflateBuffer = await inflatePromise(Buffer.from(decodedEncryptedPath, 'base64'));

    return inflateBuffer.toString('utf8');
  } catch (e) {
    throw new InternalServerError("Couldn't decrypt the provided id");
  }
};
