import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types/common';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };

    if (err.statusCode >= 500) {
      logger.error('Application error', { error: err.message, code: err.code, stack: err.stack });
    } else {
      logger.warn('Client error', { error: err.message, code: err.code });
    }

    res.status(err.statusCode).json(response);
    return;
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };

  res.status(500).json(response);
}
