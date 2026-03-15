import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENCRYPTION_PREFIX = 'enc:v1:';

const deriveKey = (secret: string): Buffer => createHash('sha256').update(secret).digest();

export const isEncryptedSecret = (value: string): boolean => value.startsWith(ENCRYPTION_PREFIX);

export const encryptSecret = (plainText: string, secret: string): string => {
  if (!plainText) {
    return '';
  }
  if (isEncryptedSecret(plainText)) {
    return plainText;
  }
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const cipherText = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}${iv.toString('base64')}.${authTag.toString('base64')}.${cipherText.toString('base64')}`;
};

export const decryptSecret = (cipherText: string, secret: string): string => {
  if (!cipherText) {
    return '';
  }
  if (!isEncryptedSecret(cipherText)) {
    return cipherText;
  }
  const payload = cipherText.slice(ENCRYPTION_PREFIX.length);
  const [ivBase64, authTagBase64, dataBase64] = payload.split('.');
  if (!ivBase64 || !authTagBase64 || !dataBase64) {
    throw new Error('Invalid encrypted secret payload');
  }
  const key = deriveKey(secret);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
  const plainText = Buffer.concat([decipher.update(Buffer.from(dataBase64, 'base64')), decipher.final()]);
  return plainText.toString('utf8');
};
