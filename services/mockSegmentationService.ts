
import { Point, SmartSegment } from '../types';
import { SMART_MASK_COLORS } from '../constants';

/**
 * Simulates a full panoptic segmentation model run.
 * Generates scene-like segments: Background, Floor, and foreground objects.
 */
export const mockPanopticSegmentation = async (width: number, height: number): Promise<SmartSegment[]> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));

  const segments: SmartSegment[] = [];
  
  // Helper to create a polygon path
  const createRect = (x: number, y: number, w: number, h: number, label: string, colorIdx: number): SmartSegment => {
    const points: Point[] = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y }
    ];
    return {
        id: `seg-${Date.now()}-${Math.random()}`,
        color: SMART_MASK_COLORS[colorIdx % SMART_MASK_COLORS.length],
        path: { points, tool: 'smart', brushSize: 0, id: `path-${Math.random()}` },
        selected: false,
        label
    };
  };

  const createBlob = (cx: number, cy: number, r: number, label: string, colorIdx: number): SmartSegment => {
      const points: Point[] = [];
      const vertices = 12;
      for (let v = 0; v < vertices; v++) {
        const angle = (v / vertices) * Math.PI * 2;
        const noisyR = r * (0.8 + Math.random() * 0.4);
        points.push({
            x: Math.min(width, Math.max(0, cx + Math.cos(angle) * noisyR)),
            y: Math.min(height, Math.max(0, cy + Math.sin(angle) * noisyR))
        });
      }
      return {
        id: `seg-${Date.now()}-${Math.random()}`,
        color: SMART_MASK_COLORS[colorIdx % SMART_MASK_COLORS.length],
        path: { points, tool: 'smart', brushSize: 0, id: `path-${Math.random()}` },
        selected: false,
        label
      };
  };

  // 1. Background (Top half approx)
  // We represent the background as a large polygon, but let's make it cover everything first?
  // In panoptic, things don't overlap usually. 
  // Let's just create "Stuff" regions.
  
  // Sky / Wall
  segments.push(createRect(0, 0, width, height * 0.6, "Background", 0));
  
  // Floor
  segments.push(createRect(0, height * 0.6, width, height * 0.4, "Floor", 1));

  // 2. Objects (Foreground)
  const objectCount = 3;
  for (let i = 0; i < objectCount; i++) {
      const cx = width * (0.3 + (i * 0.25)); // Distribute horizontally
      const cy = height * 0.65; // Sitting on the floor
      const size = Math.min(width, height) * 0.15;
      
      segments.push(createBlob(cx, cy, size, `Object ${i+1}`, i + 2));
  }

  return segments;
};
