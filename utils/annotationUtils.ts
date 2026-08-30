import { AnnotationItem } from '../types';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Parses an SVG path string (like 'M 10 20 L 15 25 L 30 40') into an array of 2D points.
 */
export function parseSvgPathToPoints(pathStr: string): Point2D[] {
  if (!pathStr || typeof pathStr !== 'string') return [];
  const points: Point2D[] = [];
  
  // Match commands and number pairs
  const regex = /([ML])\s*([-\d.]+)[,\s]+([-\d.]+)/gi;
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(pathStr)) !== null) {
    const x = parseFloat(match[2]);
    const y = parseFloat(match[3]);
    if (!isNaN(x) && !isNaN(y)) {
      points.push({ x, y });
    }
  }
  
  // Fallback for compact format like 'M10,20L15,25'
  if (points.length === 0) {
    const rawCoords = pathStr.replace(/[ML]/gi, ' ').trim().split(/[\s,]+/);
    for (let i = 0; i < rawCoords.length - 1; i += 2) {
      const x = parseFloat(rawCoords[i]);
      const y = parseFloat(rawCoords[i + 1]);
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y });
      }
    }
  }
  
  return points;
}

/**
 * Converts an array of 2D points into an SVG path string.
 */
export function pointsToSvgPath(points: Point2D[]): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${(points[0].x + 0.1).toFixed(1)} ${(points[0].y + 0.1).toFixed(1)}`;
  }
  
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }
  return path;
}

/**
 * Calculates squared distance from point p to segment vw.
 */
export function distToSegmentSquared(p: Point2D, v: Point2D, w: Point2D): number {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
}

/**
 * Resamples and slices an annotation's points by cutting out parts that fall inside the eraser radius.
 */
export function sliceSingleAnnotation(
  ant: AnnotationItem,
  eraserPoint: Point2D,
  eraserRadius: number
): { resultItems: AnnotationItem[]; didErase: boolean } {
  const rawPoints = parseSvgPathToPoints(ant.path);
  if (rawPoints.length === 0) {
    return { resultItems: [], didErase: true };
  }

  const radiusSq = eraserRadius * eraserRadius;

  // Quick bounding box check with padding
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of rawPoints) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  if (
    eraserPoint.x < minX - eraserRadius ||
    eraserPoint.x > maxX + eraserRadius ||
    eraserPoint.y < minY - eraserRadius ||
    eraserPoint.y > maxY + eraserRadius
  ) {
    return { resultItems: [ant], didErase: false };
  }

  // Densify points so large distances between points don't skip over the eraser
  const densePoints: Point2D[] = [];
  for (let i = 0; i < rawPoints.length; i++) {
    densePoints.push(rawPoints[i]);
    if (i < rawPoints.length - 1) {
      const p1 = rawPoints[i];
      const p2 = rawPoints[i + 1];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const step = 4; // 4px interpolation step
      if (dist > step) {
        const numSteps = Math.floor(dist / step);
        for (let s = 1; s <= numSteps; s++) {
          const ratio = s / (numSteps + 1);
          densePoints.push({
            x: p1.x + (p2.x - p1.x) * ratio,
            y: p1.y + (p2.y - p1.y) * ratio
          });
        }
      }
    }
  }

  // Classify points: inside eraser (erased) vs outside (kept)
  let anyErased = false;
  const runs: Point2D[][] = [];
  let currentRun: Point2D[] = [];

  for (const pt of densePoints) {
    const dSq = (pt.x - eraserPoint.x) ** 2 + (pt.y - eraserPoint.y) ** 2;
    if (dSq <= radiusSq) {
      anyErased = true;
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
    } else {
      currentRun.push(pt);
    }
  }

  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  if (!anyErased) {
    return { resultItems: [ant], didErase: false };
  }

  // Filter runs to ensure valid path segments
  const resultItems: AnnotationItem[] = [];
  let subIndex = 0;

  for (const run of runs) {
    // Simplify/clean redundant dense points
    if (run.length >= 2) {
      const simplified: Point2D[] = [run[0]];
      for (let k = 1; k < run.length; k++) {
        const last = simplified[simplified.length - 1];
        const curr = run[k];
        if (Math.hypot(curr.x - last.x, curr.y - last.y) >= 3 || k === run.length - 1) {
          simplified.push(curr);
        }
      }

      if (simplified.length >= 2) {
        resultItems.push({
          ...ant,
          id: `${ant.id}_p${Date.now()}_${subIndex++}`,
          path: pointsToSvgPath(simplified)
        });
      }
    }
  }

  return { resultItems, didErase: true };
}

/**
 * Applies smart partial segment eraser to all annotations.
 */
export function eraseAnnotationSegments(
  annotations: AnnotationItem[],
  eraserPoint: Point2D,
  eraserRadius: number = 18
): { updatedAnnotations: AnnotationItem[]; didChange: boolean } {
  let anyChanged = false;
  const newAnnotations: AnnotationItem[] = [];

  for (const ant of annotations) {
    const { resultItems, didErase } = sliceSingleAnnotation(ant, eraserPoint, eraserRadius);
    if (didErase) {
      anyChanged = true;
      newAnnotations.push(...resultItems);
    } else {
      newAnnotations.push(ant);
    }
  }

  return { updatedAnnotations: newAnnotations, didChange: anyChanged };
}
