import CoreGraphics
import Foundation

/// Geometry utility functions for pose analysis
struct GeometryUtils {
    
    /// Calculate distance between two points
    static func distance(_ p1: CGPoint, _ p2: CGPoint) -> CGFloat {
        let dx = p2.x - p1.x
        let dy = p2.y - p1.y
        return sqrt(dx * dx + dy * dy)
    }
    
    /// Calculate midpoint between two points
    static func midpoint(_ p1: CGPoint, _ p2: CGPoint) -> CGPoint {
        CGPoint(
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        )
    }
    
    /// Calculate angle at vertex point (in degrees)
    /// Forms angle from p1 -> vertex -> p2
    static func angleBetweenPoints(_ p1: CGPoint, _ vertex: CGPoint, _ p2: CGPoint) -> CGFloat {
        let v1 = CGPoint(x: p1.x - vertex.x, y: p1.y - vertex.y)
        let v2 = CGPoint(x: p2.x - vertex.x, y: p2.y - vertex.y)
        
        let dot = v1.x * v2.x + v1.y * v2.y
        let cross = v1.x * v2.y - v1.y * v2.x
        
        let angle = atan2(cross, dot)
        return abs(angle * 180 / .pi)
    }
    
    /// Calculate velocity between two positions given time delta
    static func velocity(_ p1: CGPoint, _ p2: CGPoint, _ deltaTimeMs: Double) -> CGFloat {
        guard deltaTimeMs > 0 else { return 0 }
        let dist = distance(p1, p2)
        return dist / CGFloat(deltaTimeMs / 1000.0)
    }
    
    /// Normalize point to 0-1 range
    static func normalize(_ point: CGPoint, width: CGFloat, height: CGFloat) -> CGPoint {
        CGPoint(
            x: point.x / width,
            y: point.y / height
        )
    }
    
    /// Denormalize point from 0-1 range
    static func denormalize(_ point: CGPoint, width: CGFloat, height: CGFloat) -> CGPoint {
        CGPoint(
            x: point.x * width,
            y: point.y * height
        )
    }
    
    /// Calculate the slope of a line between two points
    static func slope(_ p1: CGPoint, _ p2: CGPoint) -> CGFloat {
        let dx = p2.x - p1.x
        guard abs(dx) > 0.0001 else { return .greatestFiniteMagnitude }
        return (p2.y - p1.y) / dx
    }
    
    /// Calculate perpendicular distance from point to line
    static func perpendicularDistance(
        point: CGPoint,
        lineStart: CGPoint,
        lineEnd: CGPoint
    ) -> CGFloat {
        let dx = lineEnd.x - lineStart.x
        let dy = lineEnd.y - lineStart.y
        
        let length = sqrt(dx * dx + dy * dy)
        guard length > 0 else { return distance(point, lineStart) }
        
        let t = max(0, min(1, (
            (point.x - lineStart.x) * dx +
            (point.y - lineStart.y) * dy
        ) / (length * length)))
        
        let projection = CGPoint(
            x: lineStart.x + t * dx,
            y: lineStart.y + t * dy
        )
        
        return distance(point, projection)
    }
}
