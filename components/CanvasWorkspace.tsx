
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { AppSettings, DrawingPath, Point, SmartSegment, ToolType, CanvasHandle } from '../types';
import { Icons } from './Icons';

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
  const viewportRef = useRef<HTMLDivElement>(null);
  
  // Transform State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // Load image
  useEffect(() => {
    if (imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      img.crossOrigin = "anonymous";
      img.onload = () => {
          setImageObj(img);
          fitToScreen();
      };
    } else {
      setImageObj(null);
    }
  }, [imageSrc]); // We intentionally don't dep on width/height to avoid resetting on minor resizing if any

  // Fit to screen helper
  const fitToScreen = useCallback(() => {
      if (viewportRef.current && width > 0 && height > 0) {
          const { clientWidth, clientHeight } = viewportRef.current;
          const padding = 40;
          const availableW = clientWidth - padding;
          const availableH = clientHeight - padding;
          
          const scale = Math.min(availableW / width, availableH / height, 1); // Max scale 1 for initial fit? Or allow zoom out
          const safeScale = Math.max(scale, 0.1);

          const x = (clientWidth - width * safeScale) / 2;
          const y = (clientHeight - height * safeScale) / 2;
          
          setTransform({ x, y, scale: safeScale });
      }
  }, [width, height]);

  // Initial fit when workspace mounts/resizes significantly
  useEffect(() => {
     fitToScreen();
  }, [fitToScreen]);

  // Keyboard listeners for Spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Expose export method
  useImperativeHandle(ref, () => ({
    exportImage: async () => {
        if (!canvasRef.current || !imageObj) return null;
        
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = width;
        exportCanvas.height = height;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) return null;

        const maskCanvas = renderMaskComposite(width, height, smartSegments, manualPaths, settings);
        
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(imageObj, 0, 0, width, height);
        
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.globalCompositeOperation = 'source-over';

        return new Promise<Blob | null>(resolve => {
            exportCanvas.toBlob(resolve, 'image/png');
        });
    }
  }));

  const renderMaskComposite = (w: number, h: number, segments: SmartSegment[], paths: DrawingPath[], opts: AppSettings) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return c;

      // Smart Segments
      segments.forEach(seg => {
        if (seg.selected) {
            drawPolygon(ctx, seg.path.points, true, seg.color, 0, 'source-over');
            if (opts.borderSize > 0) {
               drawPolygon(ctx, seg.path.points, false, seg.color, opts.borderSize * 2, 'source-over');
            }
        }
      });

      // Manual Paths
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
        const color = isSubtract ? '#000000' : '#FFFFFF'; 
        drawStroke(ctx, path.points, effectiveSize, color, op);
      });
      
      // Fix smart segment opacity for mask
      ctx.globalCompositeOperation = 'source-over';
      segments.forEach(seg => {
        if (seg.selected) {
            drawPolygon(ctx, seg.path.points, true, '#FFFFFF', 0, 'source-over');
            if (opts.borderSize > 0) {
               drawPolygon(ctx, seg.path.points, false, '#FFFFFF', opts.borderSize * 2, 'source-over');
            }
        }
      });
      // Re-apply manual
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

      if (opts.invertMask) {
        const tempCtx = document.createElement('canvas').getContext('2d');
        if (tempCtx) {
            tempCtx.canvas.width = w;
            tempCtx.canvas.height = h;
            tempCtx.fillStyle = '#FFFFFF';
            tempCtx.fillRect(0, 0, w, h);
            tempCtx.globalCompositeOperation = 'destination-out';
            tempCtx.drawImage(c, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(tempCtx.canvas, 0, 0);
        }
      }
      return c;
  };

  // Main Drawing Function
  const renderCanvas = useCallback((timestamp: number = 0) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    
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

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    
    if (maskCtx) {
        smartSegments.forEach(seg => {
            if (seg.selected) {
                drawPolygon(maskCtx, seg.path.points, true, seg.color, 0, 'source-over');
                if (settings.borderSize > 0) {
                   drawPolygon(maskCtx, seg.path.points, false, seg.color, settings.borderSize * 2, 'source-over');
                }
            }
        });

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

        ctx.save();
        if (settings.feather > 0) {
            ctx.filter = `blur(${settings.feather}px)`;
        }

        if (settings.invertMask) {
            const tempCtx = document.createElement('canvas').getContext('2d');
            if (tempCtx) {
                tempCtx.canvas.width = width;
                tempCtx.canvas.height = height;
                tempCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                tempCtx.fillRect(0, 0, width, height);
                tempCtx.globalCompositeOperation = 'destination-out';
                tempCtx.drawImage(maskCanvas, 0, 0);
                ctx.drawImage(tempCtx.canvas, 0, 0);
            }
        } else {
            ctx.drawImage(maskCanvas, 0, 0);
        }
        ctx.restore();
    }

    if (!settings.invertMask) {
        smartSegments.forEach(seg => {
             const solidColor = seg.color.replace(/[\d.]+\)$/, '1)'); 
             const lineWidth = seg.selected ? 3 : 1;
             const strokeStyle = seg.selected ? solidColor : 'rgba(255, 255, 255, 0.7)';
             drawPolygon(ctx, seg.path.points, false, strokeStyle, lineWidth, 'source-over');
        });
    }

    if (isDrawing && currentPoints.length > 0 && tool !== 'smart') {
         const isSubtract = tool === 'subtract';
         const color = isSubtract ? 'rgba(255, 255, 255, 0.5)' : 'rgba(236, 72, 153, 0.5)';
         drawStroke(ctx, currentPoints, settings.penSize, color, 'source-over');
    }

    if (cursorPos && !isDrawing) {
        const r = settings.penSize / 2;
        if (tool === 'smart') {
             ctx.beginPath();
             ctx.arc(cursorPos.x, cursorPos.y, 5, 0, Math.PI * 2);
             ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
             ctx.fill();
             ctx.stroke();
        } else if (tool === 'add' || tool === 'subtract') {
            ctx.beginPath();
            ctx.arc(cursorPos.x, cursorPos.y, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        // Don't show text if zoomed out too much or panning
        if (transform.scale > 0.5 && !isPanning && tool !== 'pan') {
            ctx.font = "12px sans-serif";
            ctx.fillStyle = "white";
            ctx.shadowColor = "black";
            ctx.shadowBlur = 2;
            if (tool === 'add') ctx.fillText("+", cursorPos.x + r + 4, cursorPos.y);
            if (tool === 'subtract') ctx.fillText("-", cursorPos.x + r + 4, cursorPos.y);
        }
    }
    
    if (isLoading) {
        // Overlay
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0,0, width, height);
        
        // Spinner
        const cx = width / 2;
        const cy = height / 2;
        const radius = 24;
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(timestamp * 5); // Rotate based on time
        
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 1.5);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        ctx.restore();
        
        ctx.fillStyle = 'white';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(texts.analyzing, cx, cy + 50);
    }
  }, [imageObj, smartSegments, manualPaths, isDrawing, currentPoints, cursorPos, settings, tool, isLoading, width, height, texts, transform.scale, isPanning]);

  // Effect for Static Updates
  useEffect(() => {
    if (!isLoading) {
        renderCanvas(0);
    }
  }, [renderCanvas, isLoading]);

  // Effect for Animation Loop
  useEffect(() => {
      if (isLoading) {
          let animationFrameId: number;
          const animate = () => {
              renderCanvas(Date.now() / 1000); // Pass seconds
              animationFrameId = requestAnimationFrame(animate);
          };
          animate();
          return () => cancelAnimationFrame(animationFrameId);
      }
  }, [isLoading, renderCanvas]);

  // Coordinate Mapping
  // Event ClientXY -> Viewport Relative -> Transformed -> Image Coordinates
  const getPos = (clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return {x:0, y:0};
      
      const vx = clientX - rect.left;
      const vy = clientY - rect.top;
      
      const ix = (vx - transform.x) / transform.scale;
      const iy = (vy - transform.y) / transform.scale;
      
      return { x: ix, y: iy };
  };

  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      
      const zoomIntensity = 0.1;
      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = 1 + (direction * zoomIntensity);
      
      const newScale = Math.max(0.1, Math.min(transform.scale * factor, 50));
      
      const rect = viewportRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      
      // newX = mx - (mx - x) * (newScale / scale)
      const newX = mx - (mx - transform.x) * (newScale / transform.scale);
      const newY = my - (my - transform.y) * (newScale / transform.scale);
      
      setTransform({ x: newX, y: newY, scale: newScale });
  };

  const handleZoomBtn = (direction: 1 | -1) => {
      if (!viewportRef.current) return;
      const factor = direction === 1 ? 1.2 : 0.8;
      const newScale = Math.max(0.1, Math.min(transform.scale * factor, 50));
      
      // Zoom to center of viewport
      const rect = viewportRef.current.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      
      const newX = cx - (cx - transform.x) * (newScale / transform.scale);
      const newY = cy - (cy - transform.y) * (newScale / transform.scale);
      
      setTransform({ x: newX, y: newY, scale: newScale });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (!imageObj || isLoading) return;
      
      // Middle click (button 1) or Spacebar or Pan Tool triggers Pan
      if (e.button === 1 || isSpacePressed || tool === 'pan') {
          setIsPanning(true);
          setDragStart({ x: e.clientX, y: e.clientY });
          return;
      }
      
      const pos = getPos(e.clientX, e.clientY);
      
      if (tool === 'smart') {
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
      if (isPanning && dragStart) {
          const dx = e.clientX - dragStart.x;
          const dy = e.clientY - dragStart.y;
          setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
          setDragStart({ x: e.clientX, y: e.clientY });
          return;
      }

      const pos = getPos(e.clientX, e.clientY);
      setCursorPos(pos);
      if (isDrawing && tool !== 'smart') {
          setCurrentPoints(prev => [...prev, pos]);
      }
  };

  const handleMouseUp = () => {
      if (isPanning) {
          setIsPanning(false);
          setDragStart(null);
          return;
      }
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
    <div 
        ref={viewportRef}
        className={`relative w-full h-full overflow-hidden bg-gray-200 select-none ${isSpacePressed || isPanning || tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setIsDrawing(false); setCursorPos(null); setIsPanning(false); }}
    >
        {/* Canvas Container with Transform */}
        <div 
            style={{ 
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                transformOrigin: '0 0',
                width: width,
                height: height
            }}
            className="absolute top-0 left-0"
        >
            <canvas 
                ref={canvasRef}
                width={width}
                height={height}
                className={`block bg-white shadow-lg ${isSpacePressed || tool === 'pan' ? 'pointer-events-none' : ''}`}
            />
        </div>

        {/* Zoom Controls */}
        <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-white/90 backdrop-blur shadow rounded-lg p-1.5 border border-gray-200 z-10">
            <button className="p-1.5 hover:bg-gray-100 rounded text-gray-600" onClick={() => handleZoomBtn(-1)} title="Zoom Out">
                <Icons.ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium w-12 text-center text-gray-700">
                {Math.round(transform.scale * 100)}%
            </span>
            <button className="p-1.5 hover:bg-gray-100 rounded text-gray-600" onClick={() => handleZoomBtn(1)} title="Zoom In">
                <Icons.ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-gray-300 mx-1"></div>
            <button className="p-1.5 hover:bg-gray-100 rounded text-gray-600" onClick={fitToScreen} title="Fit to Screen">
                <Icons.Fit className="w-4 h-4" />
            </button>
        </div>

        {imageObj && !isLoading && smartSegments.length === 0 && manualPaths.length === 0 && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
                {texts.noObjects}
             </div>
        )}
    </div>
  );
});

// Reuse helpers
function drawPolygon(ctx: CanvasRenderingContext2D, points: Point[], fill: boolean, color: string, strokeWidth: number, composite: GlobalCompositeOperation) {
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

function drawStroke(ctx: CanvasRenderingContext2D, points: Point[], width: number, color: string, composite: GlobalCompositeOperation) {
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