'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import styles from './DrawingCanvas.module.css';

interface DrawingCanvasProps {
  width?: number;
  height?: number;
  backgroundColor?: string;
  strokeColor?: string;
  lineWidth?: number;
  onChange?: (dataUrl: string) => void;
  disabled?: boolean;
}

export default function DrawingCanvas({
  width = 400,
  height = 300,
  backgroundColor = '#ffffff',
  strokeColor = '#000000',
  lineWidth = 4,
  onChange,
  disabled = false,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    contextRef.current = ctx;

    // Save initial state
    const initialState = ctx.getImageData(0, 0, width, height);
    historyRef.current = [initialState];
    historyIndexRef.current = 0;
  }, [width, height, backgroundColor, strokeColor, lineWidth]);

  const saveToHistory = useCallback(() => {
    if (!contextRef.current) return;

    const imageData = contextRef.current.getImageData(0, 0, width, height);

    // Remove any redo states
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(imageData);
    historyIndexRef.current = historyRef.current.length - 1;

    // Limit history size
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
  }, [width, height]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || !contextRef.current) return;

    const coords = getCoordinates(e);
    if (!coords) return;

    setIsDrawing(true);
    contextRef.current.beginPath();
    contextRef.current.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled || !contextRef.current) return;

    const coords = getCoordinates(e);
    if (!coords) return;

    contextRef.current.lineTo(coords.x, coords.y);
    contextRef.current.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;

    setIsDrawing(false);
    saveToHistory();

    if (onChange && canvasRef.current) {
      onChange(canvasRef.current.toDataURL());
    }
  };

  const handleUndo = () => {
    if (!contextRef.current || historyIndexRef.current <= 0) return;

    historyIndexRef.current--;
    const imageData = historyRef.current[historyIndexRef.current];
    contextRef.current.putImageData(imageData, 0, 0);

    if (onChange && canvasRef.current) {
      onChange(canvasRef.current.toDataURL());
    }
  };

  const handleClear = () => {
    if (!contextRef.current) return;

    contextRef.current.fillStyle = backgroundColor;
    contextRef.current.fillRect(0, 0, width, height);
    contextRef.current.strokeStyle = strokeColor;

    saveToHistory();

    if (onChange && canvasRef.current) {
      onChange(canvasRef.current.toDataURL());
    }
  };

  return (
    <div className={styles.container}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={styles.canvas}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{ touchAction: 'none' }}
      />
      {!disabled && (
        <div className={styles.controls}>
          <button onClick={handleUndo} className={styles.button}>
            戻す
          </button>
          <button onClick={handleClear} className={styles.button}>
            クリア
          </button>
        </div>
      )}
    </div>
  );
}
