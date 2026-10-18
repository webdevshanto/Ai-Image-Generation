// Add request-scoped fields populated by authentication and request middleware.
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export {};
