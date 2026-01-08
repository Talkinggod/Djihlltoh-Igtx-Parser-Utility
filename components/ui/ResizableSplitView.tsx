
import React, { useState, useRef, useEffect } from 'react';
import { GripVertical } from 'lucide-react';
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
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      // Calculate percentage relative to container width
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
      // Constraints (min 20%, max 80%)
      if (newLeftWidth > 20 && newLeftWidth < 80) {
          setLeftWidth(newLeftWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  return (
    <div ref={containerRef} className="flex flex-col md:flex-row h-full w-full overflow-hidden relative">
      
      {/* Left Pane (Top on Mobile) */}
      <div 
        className="flex flex-col shrink-0 min-w-0 md:h-full h-1/2 w-full md:w-[var(--left-pane-width)] min-h-[300px] md:min-h-0"
        style={{ 
            '--left-pane-width': `${leftWidth}%`
        } as React.CSSProperties}
      >
        <div className="h-full w-full flex flex-col min-w-0">
            {left}
        </div>
      </div>
      
      {/* Resizer Handle (Desktop Only) */}
      <div 
        className={cn(
            "hidden md:flex w-1 bg-border/50 hover:bg-primary/50 cursor-col-resize items-center justify-center z-10 transition-colors shrink-0",
            isDragging && "bg-primary/80"
        )}
        onMouseDown={handleMouseDown}
      >
        <GripVertical className="w-3 h-3 text-muted-foreground/50" />
      </div>

      {/* Right Pane (Bottom on Mobile) */}
      <div className="flex-1 h-full min-w-0 flex flex-col overflow-hidden">
        {right}
      </div>
    </div>
  );
};
