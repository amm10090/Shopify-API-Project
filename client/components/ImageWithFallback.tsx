import React, { useState, useRef } from 'react';

interface ImageWithFallbackProps {
    src: string;
    alt: string;
    className?: string;
    fallbackSrc?: string;
    onError?: () => void;
    style?: React.CSSProperties;
}

export const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
    src,
    alt,
    className = '',
    fallbackSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik04NSA3MEg2MFY5NUg4NVY3MFoiIGZpbGw9IiNEMUQ1REIiLz4KPHA+PC9wYXRoPgo8cGF0aCBkPSJNMTQwIDEzMEw5MCA5MEw2MCA5NVYxNDBIMTQwVjEzMFoiIGZpbGw9IiNEMUQ1REIiLz4KPC9zdmc+',
    onError,
    style
}) => {
    const [imgSrc, setImgSrc] = useState(src);
    const [hasError, setHasError] = useState(false);
    const retryCountRef = useRef(0);
    const maxRetries = 2;

    const handleError = () => {
        if (retryCountRef.current < maxRetries && !hasError) {
            // 第一次重试：尝试原始URL
            retryCountRef.current++;
            const timestamp = new Date().getTime();
            setImgSrc(`${src}?retry=${timestamp}`);
        } else {
            // 最终回退到fallback图片
            setHasError(true);
            setImgSrc(fallbackSrc);
            onError?.();
        }
    };

    const handleLoad = () => {
        // 图片成功加载，重置错误状态
        if (hasError) {
            setHasError(false);
            retryCountRef.current = 0;
        }
    };

    return (
        <img
            src={imgSrc}
            alt={alt}
            className={`${className} ${hasError ? 'opacity-60' : ''}`}
            style={style}
            onError={handleError}
            onLoad={handleLoad}
            loading="lazy"
            referrerPolicy="no-referrer"
        />
    );
}; 