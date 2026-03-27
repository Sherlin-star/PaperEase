import React, { useState, useRef, useCallback, useEffect } from 'react';

interface ResizablePanelProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  minRightWidth?: number;
  maxRightWidth?: number;
  defaultRightWidth?: number;
  onWidthChange?: (width: number) => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
  leftPanel,
  rightPanel,
  minRightWidth = 350,
  maxRightWidth = 800,
  defaultRightWidth = 420,
  onWidthChange,
  onToggleFullscreen,
  isFullscreen = false
}) => {
  const [rightWidth, setRightWidth] = useState(defaultRightWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = rightWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [rightWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const delta = startXRef.current - e.clientX;
    const newWidth = Math.min(maxRightWidth, Math.max(minRightWidth, startWidthRef.current + delta));
    
    setPreviewWidth(newWidth);
  }, [isDragging, minRightWidth, maxRightWidth]);

  const handleMouseUp = useCallback(() => {
    if (previewWidth !== null) {
      setRightWidth(previewWidth);
      onWidthChange?.(previewWidth);
    }
    setIsDragging(false);
    setPreviewWidth(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [previewWidth, onWidthChange]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const currentWidth = isDragging && previewWidth !== null ? previewWidth : rightWidth;

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
      {!isFullscreen && (
        <div className="flex-1 min-w-0 overflow-hidden">
          {leftPanel}
        </div>
      )}
      
      {!isFullscreen && (
        <div
          onMouseDown={handleMouseDown}
          className={`
            w-1.5 flex-shrink-0 cursor-col-resize group relative z-30
            transition-all duration-150
            ${isDragging 
              ? 'bg-indigo-500 w-1' 
              : 'bg-slate-200/80 dark:bg-slate-800/80 hover:bg-indigo-400 dark:hover:bg-indigo-500'
            }
          `}
        >
          <div 
            className={`
              absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
              w-1.5 h-16 rounded-full
              transition-all duration-200
              ${isDragging 
                ? 'bg-indigo-500 opacity-100 scale-y-125' 
                : 'bg-slate-300 dark:bg-slate-700 group-hover:bg-indigo-500 dark:group-hover:bg-indigo-400 opacity-0 group-hover:opacity-100'
              }
            `}
          />
          
          {isDragging && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-full bg-indigo-500/30" />
          )}
        </div>
      )}
      
      {isDragging && previewWidth !== null && !isFullscreen && (
        <div 
          className="fixed inset-0 z-25 pointer-events-none"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)' }}
        >
          <div 
            className="absolute top-0 right-0 h-full bg-indigo-500/10 border-l-2 border-dashed border-indigo-500"
            style={{ width: previewWidth }}
          >
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg">
              {Math.round(previewWidth)}px
            </div>
          </div>
        </div>
      )}
      
      <div 
        style={{ width: isFullscreen ? '100%' : currentWidth }}
        className={`flex-shrink-0 overflow-hidden transition-all duration-150 ${isDragging ? 'pointer-events-none' : ''}`}
      >
        {rightPanel}
      </div>
    </div>
  );
};

export default ResizablePanel;
