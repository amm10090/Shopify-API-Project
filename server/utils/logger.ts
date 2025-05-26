import winston from 'winston';
import path from 'path';

const logDir = 'logs';

// 安全的JSON序列化函数，处理循环引用
const safeStringify = (obj: any): string => {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, val) => {
        if (val != null && typeof val === 'object') {
            if (seen.has(val)) {
                return '[Circular]';
            }
            seen.add(val);
        }
        return val;
    });
};

// 错误对象序列化函数
const serializeError = (error: any): any => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: (error as any).code,
            status: (error as any).status,
            statusCode: (error as any).statusCode
        };
    }
    return error;
};

// 创建日志格式
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const serializedMeta = Object.keys(meta).reduce((acc, key) => {
            if (key === 'error' && meta[key] instanceof Error) {
                acc[key] = serializeError(meta[key]);
            } else {
                try {
                    acc[key] = meta[key];
                } catch (e) {
                    acc[key] = '[Unserializable]';
                }
            }
            return acc;
        }, {} as any);

        try {
            const metaString = Object.keys(serializedMeta).length > 0 ? ` ${safeStringify(serializedMeta)}` : '';
            return `${timestamp} [${level}]: ${message}${metaString}`;
        } catch (e) {
            return `${timestamp} [${level}]: ${message} [Meta serialization failed]`;
        }
    })
);

// 控制台格式
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            try {
                const serializedMeta = Object.keys(meta).reduce((acc, key) => {
                    if (key === 'error' && meta[key] instanceof Error) {
                        acc[key] = serializeError(meta[key]);
                    } else {
                        acc[key] = meta[key];
                    }
                    return acc;
                }, {} as any);
                msg += ` ${safeStringify(serializedMeta)}`;
            } catch (e) {
                msg += ' [Meta serialization failed]';
            }
        }
        return msg;
    })
);

// 创建logger实例
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'shopify-product-importer' },
    transports: [
        // 错误日志文件
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // 所有日志文件
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
});

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat
    }));
}

// 导出便捷方法
export const logInfo = (message: string, meta?: any) => logger.info(message, meta);
export const logError = (message: string, error?: any) => {
    if (error instanceof Error) {
        logger.error(message, { error: serializeError(error) });
    } else {
        logger.error(message, { error });
    }
};
export const logWarn = (message: string, meta?: any) => logger.warn(message, meta);
export const logDebug = (message: string, meta?: any) => logger.debug(message, meta); 