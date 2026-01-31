import SwiftUI

/// Skeleton overlay view that draws pose landmarks and connections
struct SkeletonOverlayView: View {
    let landmarks: [CGPoint]?
    let color: Color
    let viewSize: CGSize
    
    // MediaPipe pose connections (same as Android)
    private let connections: [(Int, Int)] = [
        // Face
        (0, 1), (1, 2), (2, 3), (3, 7),
        (0, 4), (4, 5), (5, 6), (6, 8),
        (9, 10),
        // Torso
        (11, 12), (11, 23), (12, 24), (23, 24),
        // Left arm
        (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
        // Right arm
        (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
        // Left leg
        (23, 25), (25, 27), (27, 29), (27, 31), (29, 31),
        // Right leg
        (24, 26), (26, 28), (28, 30), (28, 32), (30, 32)
    ]
    
    var body: some View {
        Canvas { context, size in
            guard let landmarks = landmarks, landmarks.count >= 33 else { return }
            
            // Convert normalized coordinates to view coordinates
            let points = landmarks.map { point in
                CGPoint(
                    x: point.x * size.width,
                    y: point.y * size.height
                )
            }
            
            // Draw connections
            for (start, end) in connections {
                guard start < points.count && end < points.count else { continue }
                
                var path = Path()
                path.move(to: points[start])
                path.addLine(to: points[end])
                
                context.stroke(
                    path,
                    with: .color(color),
                    lineWidth: 4
                )
            }
            
            // Draw landmarks
            for point in points {
                let rect = CGRect(
                    x: point.x - 6,
                    y: point.y - 6,
                    width: 12,
                    height: 12
                )
                context.fill(Circle().path(in: rect), with: .color(color))
                
                // White border
                context.stroke(
                    Circle().path(in: rect),
                    with: .color(.white),
                    lineWidth: 2
                )
            }
        }
    }
}

/// Sparkle particle effect for perfect moves
struct SparkleEffectView: View {
    @State private var particles: [Particle] = []
    @State private var isAnimating = false
    
    struct Particle: Identifiable {
        let id = UUID()
        var position: CGPoint
        var velocity: CGPoint
        var opacity: Double
        var scale: Double
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ForEach(particles) { particle in
                    Image(systemName: "sparkle")
                        .foregroundColor(Color(hex: "FFD700"))
                        .scaleEffect(particle.scale)
                        .opacity(particle.opacity)
                        .position(particle.position)
                }
            }
        }
    }
    
    func triggerSparkles(at center: CGPoint) {
        // Create particles
        particles = (0..<20).map { _ in
            let angle = Double.random(in: 0...(2 * .pi))
            let speed = Double.random(in: 50...150)
            return Particle(
                position: center,
                velocity: CGPoint(
                    x: cos(angle) * speed,
                    y: sin(angle) * speed
                ),
                opacity: 1.0,
                scale: Double.random(in: 0.5...1.5)
            )
        }
        
        // Animate particles
        withAnimation(.easeOut(duration: 1.0)) {
            for i in particles.indices {
                particles[i].position.x += particles[i].velocity.x
                particles[i].position.y += particles[i].velocity.y
                particles[i].opacity = 0
                particles[i].scale = 0.1
            }
        }
        
        // Clean up
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            particles.removeAll()
        }
    }
}

#Preview {
    ZStack {
        Color.black
        SkeletonOverlayView(
            landmarks: nil,
            color: .green,
            viewSize: CGSize(width: 400, height: 800)
        )
    }
}
