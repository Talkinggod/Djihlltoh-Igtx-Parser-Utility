
import React, { useState, useRef, useEffect } from 'react';
import { GripVertical, GripHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ResizableSplitViewProps {
  left: React.ReactNode;
  right: React.ReactNode;
  initialLeftWidth?: number; // percentage (0-100)
}

export const ResizableSplitView: React.FC<ResizableSplitViewProps> = ({
  left,
  right,
  initialLeftWidth = 50
}) => {
  const [splitRatio, setSplitRatio] = useState(initialLeftWidth); // 0-100
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  // Touch support for mobile resizing
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      let newRatio = 50;

      if (isMobile) {
          // Vertical split (Height)
          newRatio = ((clientY - containerRect.top) / containerRect.height) * 100;
      } else {
          // Horizontal split (Width)
          newRatio = ((clientX - containerRect.left) / containerRect.width) * 100;
      }
      
      // Constraints (min 15%, max 85%)
      if (newRatio > 15 && newRatio < 85) {
          setSplitRatio(newRatio);
      }
    };

    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX, e.touches[0].clientY);

    const handleUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleUp);
      
      document.body.style.cursor = isMobile ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, isMobile]);

  return (
    <div ref={containerRef} className="flex flex-col md:flex-row h-full w-full overflow-hidden relative">
      
      {/* First Pane (Top on Mobile / Left on Desktop) */}
      <div 
        className={cn(
            "flex flex-col shrink-0 min-w-0 overflow-hidden bg-background",
            isMobile ? "w-full border-b" : "h-full border-r"
        )}
        style={{ 
            flexBasis: `${splitRatio}%`
        }}
      >
        <div className="h-full w-full flex flex-col min-w-0 overflow-hidden">
            {left}
        </div>
      </div>
      
      {/* Resizer Handle */}
      <div 
        className={cn(
            "flex items-center justify-center z-10 transition-colors shrink-0 bg-muted/50 hover:bg-primary/20 touch-none",
            isMobile 
                ? "w-full h-2 cursor-row-resize" 
                : "w-2 h-full cursor-col-resize",
            isDragging && "bg-primary/40"
        )}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {isMobile ? (
            <GripHorizontal className="w-8 h-4 text-muted-foreground/40" />
        ) : (
            <GripVertical className="w-4 h-8 text-muted-foreground/40" />
        )}
      </div>

      {/* Second Pane (Bottom on Mobile / Right on Desktop) */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-background">
        {right}
      </div>
    </div>
  );
};
