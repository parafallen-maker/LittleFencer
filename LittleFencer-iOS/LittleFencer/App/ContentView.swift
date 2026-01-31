import SwiftUI

/// Main entry view - routes to Training or Gallery
struct ContentView: View {
    @State private var showGallery = false
    
    var body: some View {
        ZStack {
            // Main training view
            MainTrainingView(showGallery: $showGallery)
                .ignoresSafeArea()
            
            // Gallery sheet
            if showGallery {
                GalleryView(isPresented: $showGallery)
                    .transition(.move(edge: .trailing))
            }
        }
        .animation(.easeInOut(duration: 0.3), value: showGallery)
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
}
