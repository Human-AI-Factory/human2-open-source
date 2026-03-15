import jwt from 'jsonwebtoken';
import { SqliteStore } from '../../db/sqlite.js';

export interface AuthTokenPayload {
  uid: string;
  role: string;
  iat?: number;
  exp?: number;
}

export class AuthService {
  constructor(
    private readonly store: SqliteStore,
    private readonly jwtSecret: string,
    private readonly jwtExpiresIn: string
  ) {}

  login(username: string, password: string): string | null {
    const user = this.store.findUserByCredentials(username, password);
    if (!user) {
      return null;
    }

    return jwt.sign({ uid: user.id, role: user.role }, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn as jwt.SignOptions['expiresIn']
    });
  }

  verify(token: string): boolean {
    return this.verifyAndDecode(token) !== null;
  }

  verifyAndDecode(token: string): AuthTokenPayload | null {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as AuthTokenPayload;
      if (!payload || typeof payload !== 'object' || typeof payload.uid !== 'string') {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }
}
