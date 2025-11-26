
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { AppSettings, DrawingPath, Point, SmartSegment, ToolType, CanvasHandle } from '../types';

interface CanvasWorkspaceProps {
  imageSrc: string | null;
  width: number;
  height: number;
  tool: ToolType;
  settings: AppSettings;
  smartSegments: SmartSegment[];
  manualPaths: DrawingPath[];
  onCommitPath: (path: DrawingPath) => void;
  onToggleSmartSegment: (segmentId: string) => void;
  isLoading?: boolean;
  texts: {
      analyzing: string;
      noObjects: string;
      importToStart: string;
  };
}

export const CanvasWorkspace = forwardRef<CanvasHandle, CanvasWorkspaceProps>(({
  imageSrc,
  width,
  height,
  tool,
  settings,
  smartSegments,
  manualPaths,
  onCommitPath,
  onToggleSmartSegment,
  isLoading,
  texts
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // Load image
  useEffect(() => {
    if (imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      img.crossOrigin = "anonymous"; // Essential for export if image is from external URL
      img.onload = () => setImageObj(img);
    } else {
      setImageObj(null);
    }
  }, [imageSrc]);

  // Expose export method
  useImperativeHandle(ref, () => ({
    exportImage: async () => {
        if (!canvasRef.current || !imageObj) return null;
        
        // We create a temporary canvas to render the final output
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = width;
        exportCanvas.height = height;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) return null;

        // 1. Draw Mask Composite only
        const maskCanvas = renderMaskComposite(width, height, smartSegments, manualPaths, settings);
        
        // 2. We want to export the Cutout (Image masked by Selection)
        // Clear
        ctx.clearRect(0, 0, width, height);
        
        // Draw Mask as clipping path or alpha mask?
        // Let's do: Destination-In to mask the image
        ctx.drawImage(imageObj, 0, 0, width, height);
        
        // Apply Mask
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskCanvas, 0, 0);

        // Reset
        ctx.globalCompositeOperation = 'source-over';

        return new Promise<Blob | null>(resolve => {
            exportCanvas.toBlob(resolve, 'image/png');
        });
    }
  }));

  // Helper to render the mask logic (Used for both display and export)
  const renderMaskComposite = (
      w: number, 
      h: number, 
      segments: SmartSegment[], 
      paths: DrawingPath[], 
      opts: AppSettings
  ) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return c;

      // 1. Smart Segments
      segments.forEach(seg => {
        if (seg.selected) {
            drawPolygon(ctx, seg.path.points, true, seg.color, 0, 'source-over');
            if (opts.borderSize > 0) {
               drawPolygon(ctx, seg.path.points, false, seg.color, opts.borderSize * 2, 'source-over');
            }
        }
      });

      // 2. Manual Paths
      paths.forEach(path => {
        const isSubtract = path.tool === 'subtract';
        const op = isSubtract ? 'destination-out' : 'source-over';
        
        let effectiveSize = path.brushSize;
        if (opts.borderSize > 0) {
            if (isSubtract) {
                effectiveSize = Math.max(1, path.brushSize - (opts.borderSize * 2));
            } else {
                effectiveSize = path.brushSize + (opts.borderSize * 2);
            }
        }
        
        const color = isSubtract ? '#000000' : (path.tool === 'add' ? '#FFFFFF' : '#FFFFFF'); 
        drawStroke(ctx, path.points, effectiveSize, color, op);
      });
      
      // Smart segments in the mask pass should ideally be opaque for the cutout
      // Let's redraw them as solid white for the mask composition
      ctx.globalCompositeOperation = 'source-over';
      segments.forEach(seg => {
        if (seg.selected) {
            drawPolygon(ctx, seg.path.points, true, '#FFFFFF', 0, 'source-over');
            if (opts.borderSize > 0) {
               drawPolygon(ctx, seg.path.points, false, '#FFFFFF', opts.borderSize * 2, 'source-over');
            }
        }
      });
      // Re-apply manual (needs to be on top)
       paths.forEach(path => {
        const isSubtract = path.tool === 'subtract';
        const op = isSubtract ? 'destination-out' : 'source-over';
        let effectiveSize = path.brushSize;
         if (opts.borderSize > 0) {
            if (isSubtract) {
                effectiveSize = Math.max(1, path.brushSize - (opts.borderSize * 2));
            } else {
                effectiveSize = path.brushSize + (opts.borderSize * 2);
            }
        }
        drawStroke(ctx, path.points, effectiveSize, isSubtract ? '#000000' : '#FFFFFF', op);
      });

      // Apply Feather
      if (opts.feather > 0) {
          const temp = document.createElement('canvas');
          temp.width = w;
          temp.height = h;
          const tCtx = temp.getContext('2d');
          if (tCtx) {
            tCtx.filter = `blur(${opts.feather}px)`;
            tCtx.drawImage(c, 0, 0);
            ctx.clearRect(0,0, w, h);
            ctx.drawImage(temp, 0, 0);
          }
      }

      // Handle Invert
      if (opts.invertMask) {
        const tempCtx = document.createElement('canvas').getContext('2d');
        if (tempCtx) {
            tempCtx.canvas.width = w;
            tempCtx.canvas.height = h;
            tempCtx.fillStyle = '#FFFFFF';
            tempCtx.fillRect(0, 0, w, h);
            tempCtx.globalCompositeOperation = 'destination-out';
            tempCtx.drawImage(c, 0, 0);
            
            // Replace c
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(tempCtx.canvas, 0, 0);
        }
      }
      return c;
  };


  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Clear
    ctx.clearRect(0, 0, width, height);
    
    // 2. Draw BG
    if (imageObj) {
        ctx.drawImage(imageObj, 0, 0, width, height);
    } else {
       ctx.fillStyle = '#e5e7eb';
       ctx.fillRect(0,0, width, height);
       ctx.fillStyle = '#9ca3af';
       ctx.font = '16px Inter';
       ctx.textAlign = 'center';
       ctx.fillText(texts.importToStart, width/2, height/2);
       return; 
    }

    // 3. Generate Visual Mask (Colored)
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    
    if (maskCtx) {
         // A. Smart (Colored)
        smartSegments.forEach(seg => {
            if (seg.selected) {
                drawPolygon(maskCtx, seg.path.points, true, seg.color, 0, 'source-over');
                if (settings.borderSize > 0) {
                   drawPolygon(maskCtx, seg.path.points, false, seg.color, settings.borderSize * 2, 'source-over');
                }
            }
        });

        // B. Manual
        manualPaths.forEach(path => {
            const isSubtract = path.tool === 'subtract';
            const op = isSubtract ? 'destination-out' : 'source-over';
            
            let effectiveSize = path.brushSize;
            if (settings.borderSize > 0) {
                if (isSubtract) {
                    effectiveSize = Math.max(1, path.brushSize - (settings.borderSize * 2));
                } else {
                    effectiveSize = path.brushSize + (settings.borderSize * 2);
                }
            }

            const color = isSubtract ? '#000000' : 'rgba(236, 72, 153, 0.8)';
            drawStroke(maskCtx, path.points, effectiveSize, color, op);
        });

        // Apply Feather to the visual mask
        ctx.save();
        if (settings.feather > 0) {
            ctx.filter = `blur(${settings.feather}px)`;
        }

        if (settings.invertMask) {
            const tempCtx = document.createElement('canvas').getContext('2d');
            if (tempCtx) {
                tempCtx.canvas.width = width;
                tempCtx.canvas.height = height;
                // Full overlay
                tempCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // Dim everything
                tempCtx.fillRect(0, 0, width, height);
                // Cut out the original mask (which is now the hole)
                tempCtx.globalCompositeOperation = 'destination-out';
                tempCtx.drawImage(maskCanvas, 0, 0);
                
                ctx.drawImage(tempCtx.canvas, 0, 0);
            }
        } else {
            // Normal: Draw the mask on top
            ctx.drawImage(maskCanvas, 0, 0);
        }
        ctx.restore();
    }

    // 4. Outlines (Always visible for smart segments)
    if (!settings.invertMask) {
        smartSegments.forEach(seg => {
             const solidColor = seg.color.replace(/[\d.]+\)$/, '1)'); 
             const lineWidth = seg.selected ? 3 : 1;
             const strokeStyle = seg.selected ? solidColor : 'rgba(255, 255, 255, 0.7)';
             drawPolygon(ctx, seg.path.points, false, strokeStyle, lineWidth, 'source-over');
        });
    }

    // 5. Drawing Preview
    if (isDrawing && currentPoints.length > 0 && tool !== 'smart') {
         const isSubtract = tool === 'subtract';
         const color = isSubtract ? 'rgba(255, 255, 255, 0.5)' : 'rgba(236, 72, 153, 0.5)';
         drawStroke(ctx, currentPoints, settings.penSize, color, 'source-over');
    }

    // 6. Cursor
    if (cursorPos && !isDrawing) {
        const r = settings.penSize / 2;
        if (tool === 'smart') {
             ctx.beginPath();
             ctx.arc(cursorPos.x, cursorPos.y, 5, 0, Math.PI * 2);
             ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
             ctx.fill();
             ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.arc(cursorPos.x, cursorPos.y, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.font = "12px sans-serif";
        ctx.fillStyle = "white";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 2;
        if (tool === 'add') ctx.fillText("+", cursorPos.x + r + 4, cursorPos.y);
        if (tool === 'subtract') ctx.fillText("-", cursorPos.x + r + 4, cursorPos.y);
    }
    
    // Loading
    if (isLoading) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0,0, width, height);
        ctx.fillStyle = 'white';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(texts.analyzing, width/2, height/2);
    }

  }, [imageObj, smartSegments, manualPaths, isDrawing, currentPoints, cursorPos, settings, tool, isLoading, width, height, texts]);

  // Interaction
  const getPos = (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return {x:0, y:0};
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (!imageObj || isLoading) return;
      const pos = getPos(e);
      
      if (tool === 'smart') {
          // Check intersection
          // Simple Point-in-Poly check using a scratch path
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (ctx) {
             for (let i = smartSegments.length - 1; i >= 0; i--) {
                 const seg = smartSegments[i];
                 const path = new Path2D();
                 if (seg.path.points.length > 0) {
                    path.moveTo(seg.path.points[0].x, seg.path.points[0].y);
                    seg.path.points.slice(1).forEach(p => path.lineTo(p.x, p.y));
                    path.closePath();
                    
                    if (ctx.isPointInPath(path, pos.x, pos.y)) {
                        onToggleSmartSegment(seg.id);
                        return; 
                    }
                 }
             }
          }
      } else {
          setIsDrawing(true);
          setCurrentPoints([pos]);
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const pos = getPos(e);
      setCursorPos(pos);
      if (isDrawing && tool !== 'smart') {
          setCurrentPoints(prev => [...prev, pos]);
      }
  };

  const handleMouseUp = async () => {
      if (!isDrawing) return;
      setIsDrawing(false);
      if (currentPoints.length < 2) {
          setCurrentPoints([]);
          return;
      }
      const id = Date.now().toString();
      if (tool !== 'smart') {
          onCommitPath({ points: currentPoints, tool, brushSize: settings.penSize, id });
      }
      setCurrentPoints([]);
  };

  return (
    <div className="relative border border-gray-300 bg-gray-50 select-none shadow-sm" style={{ width: width, height: height }}>
        <canvas 
            ref={canvasRef}
            width={width}
            height={height}
            className={`cursor-none block ${!imageObj ? 'bg-gray-200' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setIsDrawing(false); setCursorPos(null); }}
        />
        {imageObj && !isLoading && smartSegments.length === 0 && manualPaths.length === 0 && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
                {texts.noObjects}
             </div>
        )}
    </div>
  );
});

// Reuse helpers
function drawPolygon(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    fill: boolean,
    color: string,
    strokeWidth: number,
    composite: GlobalCompositeOperation
) {
    if (points.length < 2) return;
    ctx.save();
    ctx.beginPath();
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.globalCompositeOperation = composite;
    if (fill) {
        ctx.fillStyle = color;
        ctx.fill();
    }
    if (strokeWidth > 0) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = color;
        ctx.stroke();
    }
    ctx.restore();
}

function drawStroke(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    width: number,
    color: string,
    composite: GlobalCompositeOperation
) {
    if (points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.globalCompositeOperation = composite;
    ctx.beginPath();
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
}
