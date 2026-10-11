import type { Role } from '@genpath/shared';

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: Role;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware when a valid session cookie is present. */
      auth?: AuthContext;
    }
  }
}
