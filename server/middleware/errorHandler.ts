import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError, NotFoundError, ConflictError } from '@shared/types';
import { logger } from '../utils/logger';

export const errorHandler = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    logger.error('Error occurred:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    });

    // 如果是我们自定义的错误类型
    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            success: false,
            error: error.message,
            code: error.code
        });
        return;
    }

    // Prisma 错误处理
    if (error.name === 'PrismaClientKnownRequestError') {
        const prismaError = error as any;

        switch (prismaError.code) {
            case 'P2002':
                res.status(409).json({
                    success: false,
                    error: 'Resource already exists',
                    code: 'DUPLICATE_ENTRY'
                });
                return;
            case 'P2025':
                res.status(404).json({
                    success: false,
                    error: 'Resource not found',
                    code: 'NOT_FOUND'
                });
                return;
            default:
                res.status(500).json({
                    success: false,
                    error: 'Database error',
                    code: 'DATABASE_ERROR'
                });
                return;
        }
    }

    // Validation 错误
    if (error.name === 'ValidationError') {
        res.status(400).json({
            success: false,
            error: error.message,
            code: 'VALIDATION_ERROR'
        });
        return;
    }

    // JWT 错误
    if (error.name === 'JsonWebTokenError') {
        res.status(401).json({
            success: false,
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
        return;
    }

    if (error.name === 'TokenExpiredError') {
        res.status(401).json({
            success: false,
            error: 'Token expired',
            code: 'TOKEN_EXPIRED'
        });
        return;
    }

    // 默认服务器错误
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : error.message,
        code: 'INTERNAL_ERROR'
    });
}; 