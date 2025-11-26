
import { Point, SmartSegment } from '../types';
import { SMART_MASK_COLORS } from '../constants';

/**
 * Performs accurate segmentation based on image content using a simplified 
 * K-Means clustering approach on a downsampled grid.
 */
export const mockPanopticSegmentation = async (imageData: ImageData): Promise<SmartSegment[]> => {
  // Wait a moment to ensure UI updates (mocking async work)
  await new Promise(resolve => setTimeout(resolve, 100));

  const segments: SmartSegment[] = [];
  const { width, height, data } = imageData;

  // 1. Downsample for performance (Process at lower res, e.g., max 150px dimension)
  const scale = Math.min(150 / width, 150 / height, 1); // Ensure we don't upscale
  const w = Math.floor(width * scale);
  const h = Math.floor(height * scale);
  
  // Create downsampled pixel buffer
  const pixelCount = w * h;
  const pixels = new Uint8ClampedArray(pixelCount * 4);
  
  // Simple nearest-neighbor downsampling
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      const srcIdx = (srcY * width + srcX) * 4;
      const destIdx = (y * w + x) * 4;
      pixels[destIdx] = data[srcIdx];
      pixels[destIdx + 1] = data[srcIdx + 1];
      pixels[destIdx + 2] = data[srcIdx + 2];
      pixels[destIdx + 3] = data[srcIdx + 3];
    }
  }

  // 2. K-Means Clustering setup
  const K = 8; // Number of clusters (dominant regions)
  const centroids: number[][] = [];
  
  // Initialize centroids intelligently (randomly pick pixels)
  for (let i = 0; i < K; i++) {
    const idx = Math.floor(Math.random() * pixelCount) * 4;
    centroids.push([pixels[idx], pixels[idx+1], pixels[idx+2]]); // RGB
  }

  const labels = new Int8Array(pixelCount); // Store cluster ID for each pixel

  // 3. Run K-Means Iterations
  const iterations = 4;
  for (let iter = 0; iter < iterations; iter++) {
    const sums = new Float32Array(K * 3);
    const counts = new Int32Array(K);

    // Assign pixels to nearest centroid
    for (let i = 0; i < pixelCount; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      
      let minDist = Infinity;
      let bestCluster = 0;

      for (let k = 0; k < K; k++) {
        const dr = r - centroids[k][0];
        const dg = g - centroids[k][1];
        const db = b - centroids[k][2];
        const dist = dr*dr + dg*dg + db*db; // Squared Euclidean distance
        if (dist < minDist) {
          minDist = dist;
          bestCluster = k;
        }
      }
      labels[i] = bestCluster;
      sums[bestCluster * 3] += r;
      sums[bestCluster * 3 + 1] += g;
      sums[bestCluster * 3 + 2] += b;
      counts[bestCluster]++;
    }

    // Update centroids
    for (let k = 0; k < K; k++) {
      if (counts[k] > 0) {
        centroids[k][0] = sums[k * 3] / counts[k];
        centroids[k][1] = sums[k * 3 + 1] / counts[k];
        centroids[k][2] = sums[k * 3 + 2] / counts[k];
      }
    }
  }

  // 4. Extract Connected Components & Trace Boundaries
  // We need to separate disconnected parts of the same color cluster
  const visited = new Uint8Array(pixelCount);
  let segmentIdCounter = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx]) continue;

      const clusterId = labels[idx];
      
      // Perform BFS to find component
      const componentPixels: number[] = []; // Store indices
      const queue = [idx];
      visited[idx] = 1;
      componentPixels.push(idx);

      let minX = x, maxX = x, minY = y, maxY = y;

      let qIdx = 0;
      while(qIdx < queue.length) {
          const curr = queue[qIdx++];
          const cy = Math.floor(curr / w);
          const cx = curr % w;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // Check 4 neighbors
          const neighbors = [
              curr - 1, // Left
              curr + 1, // Right
              curr - w, // Top
              curr + w  // Bottom
          ];

          for (const n of neighbors) {
              const ny = Math.floor(n / w);
              const nx = n % w;
              // Check bounds and wrapping (e.g. left edge - 1 shouldn't be valid)
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  if (!visited[n] && labels[n] === clusterId) {
                      visited[n] = 1;
                      queue.push(n);
                      componentPixels.push(n);
                  }
              }
          }
      }

      // Filter small noise regions (e.g., < 0.5% of area)
      if (componentPixels.length < (pixelCount * 0.005)) continue;

      // Trace Boundary (Simplified Moore-Neighbor logic)
      const pathPoints = traceBoundary(labels, w, h, componentPixels[0], clusterId);
      
      // Upscale points back to original image space
      const originalPoints: Point[] = pathPoints.map(p => ({
          x: p.x / scale,
          y: p.y / scale
      }));

      // Simplify path (Douglas-Peucker light or just simple distance filter)
      const simplifiedPoints = simplifyPoints(originalPoints, 2);

      segments.push({
          id: `seg-${Date.now()}-${segmentIdCounter++}`,
          color: SMART_MASK_COLORS[segmentIdCounter % SMART_MASK_COLORS.length],
          path: {
              points: simplifiedPoints,
              tool: 'smart',
              brushSize: 0,
              id: `path-${Math.random()}`
          },
          selected: false,
          label: `Region ${segmentIdCounter}`
      });
    }
  }

  return segments;
};

// --- Helpers ---

// A simple boundary tracer that walks the edge of a cluster
function traceBoundary(labels: Int8Array, w: number, h: number, startIdx: number, targetLabel: number): Point[] {
    const points: Point[] = [];
    const startY = Math.floor(startIdx / w);
    const startX = startIdx % w;
    
    // Find a guaranteed top-left edge pixel for the start
    // (The startIdx from BFS is usually top-left, but let's double check local boundary)
    let currX = startX;
    let currY = startY;
    
    // Directions: N, NE, E, SE, S, SW, W, NW
    // We scan neighbors to walk around
    // Simple approach: Walk grid edges. 
    // This is a "Marching Squares" approximation for grid cells.
    
    // Using Moore-Neighbor Tracing
    // 1. Find a pixel s inside, such that neighbor is outside.
    // Since startIdx was the first found in linear scan, the pixel to its LEFT (or TOP) is likely outside or boundary.
    // Let's assume startIdx is on the boundary.
    
    let boundaryPixels: number[] = [];
    
    // Direction vectors (x,y)
    const dirs = [
        {x:0, y:-1}, // N
        {x:1, y:-1}, // NE
        {x:1, y:0},  // E
        {x:1, y:1},  // SE
        {x:0, y:1},  // S
        {x:-1, y:1}, // SW
        {x:-1, y:0}, // W
        {x:-1, y:-1} // NW
    ];
    
    let b = {x: startX, y: startY};
    let c = {x: startX - 1, y: startY}; // "Backtrack" pointer (outside)
    
    // Verify start is valid
    if (startX === 0) c = {x: -1, y: startY}; 
    
    const startPixel = {x: startX, y: startY};
    
    // Safety break
    let steps = 0;
    const maxSteps = w * h;
    
    do {
        points.push({x: b.x, y: b.y});
        
        // Find next boundary pixel
        let foundNext = false;
        
        // Start checking neighbors clockwise, starting from the one AFTER 'c'
        // Find direction of c relative to b
        let dirIdx = -1;
        // Map 8 neighbors relative to b
        for(let i=0; i<8; i++) {
            if (b.x + dirs[i].x === c.x && b.y + dirs[i].y === c.y) {
                dirIdx = i;
                break;
            }
        }
        
        if (dirIdx === -1) {
            // Fallback (shouldn't happen if logic is sound)
            dirIdx = 6; // West
        }
        
        // Scan clockwise
        for (let i = 0; i < 8; i++) {
            const nextDirIdx = (dirIdx + 1 + i) % 8; // Start from neighbor after c
            const nx = b.x + dirs[nextDirIdx].x;
            const ny = b.y + dirs[nextDirIdx].y;
            
            // Check if inside image and same label
            let isInside = false;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                if (labels[ny * w + nx] === targetLabel) {
                    isInside = true;
                }
            }
            
            if (isInside) {
                // Found next boundary pixel
                const prevDirIdx = (nextDirIdx + 7) % 8;
                c = {x: b.x + dirs[prevDirIdx].x, y: b.y + dirs[prevDirIdx].y};
                
                b = {x: nx, y: ny};
                foundNext = true;
                break;
            }
        }
        
        if (!foundNext) break; // Isolated pixel
        steps++;
        
    } while ((b.x !== startPixel.x || b.y !== startPixel.y) && steps < maxSteps);

    return points;
}

function simplifyPoints(points: Point[], tolerance: number): Point[] {
    if (points.length <= 2) return points;
    
    const res: Point[] = [points[0]];
    let last = points[0];
    
    for (let i = 1; i < points.length; i++) {
        const curr = points[i];
        const dist = Math.sqrt(Math.pow(curr.x - last.x, 2) + Math.pow(curr.y - last.y, 2));
        if (dist > tolerance) {
            res.push(curr);
            last = curr;
        }
    }
    // Close loop if needed
    if (res.length > 2) {
         const first = res[0];
         const end = res[res.length - 1];
         if (first.x !== end.x || first.y !== end.y) {
             res.push(first);
         }
    }
    return res;
}
