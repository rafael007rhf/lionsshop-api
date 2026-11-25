import type { ErrorRequestHandler } from 'express';
import { BusinessError } from '../business-error';

const statusByKind = { invalid: 400, 'not-found': 404, conflict: 409 };

export const handleHttpError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof BusinessError) {
    res.status(statusByKind[error.kind]).json({ [error.field]: error.message });
    return;
  }

  if (error.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'Erro interno' });
};
