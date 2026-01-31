import SwiftUI

/// LittleFencer - AI-Powered Fencing Training Assistant for Youth
/// iOS Version
@main
struct LittleFencerApp: App {
    
    @StateObject private var appState = AppState()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .preferredColorScheme(.dark)
        }
    }
}

/// Global app state
class AppState: ObservableObject {
    @Published var isTraining = false
    @Published var repCount = 0
    @Published var comboCount = 0
}
