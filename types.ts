
export type ToolType = 'smart' | 'add' | 'subtract' | 'pan';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingPath {
  points: Point[];
  tool: ToolType;
  brushSize: number;
  id: string; // Unique ID for undo/redo tracking
}

// Represents a single "Smart" segment
export interface SmartSegment {
  id: string;
  color: string; // Visualization color
  path: DrawingPath;
  selected: boolean; // Whether this segment is currently part of the active mask
  label?: string; // Optional label (e.g., "Cat", "Sofa")
}

// The snapshot structure for Undo/Redo
export interface EditorHistoryState {
  smartSegments: SmartSegment[];
  manualPaths: DrawingPath[]; // "Hard Add" and "Hard Subtract" paths
}

export interface AppSettings {
  penSize: number;
  invertMask: boolean;
  borderSize: number; // Simulated dilation/erosion
  feather: number; // Gaussian blur
}

export interface CanvasHandle {
  exportImage: () => Promise<Blob | null>;
}