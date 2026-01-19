---
name: swift-foundation-models
description: Develop AI-powered Swift applications using Apple's Foundation Models framework (2025+) with tool calling, guided generation, streaming, and speech integration. Use when implementing Apple Intelligence features, on-device AI, Swift AI integration, @Generable types, custom tools, language model sessions, voice assistants, SpeechAnalyzer, or speech-to-text with AI in iOS, macOS, or visionOS apps.
---

# Swift Foundation Models Framework Skill

Comprehensive guide for integrating Apple's Foundation Models framework into Swift applications. This skill covers tool calling, guided generation, streaming responses, and best practices for building AI-powered features in iOS 26+, macOS 26+, and visionOS 26+.

## Overview

The Foundation Models framework provides direct access to Apple's on-device ~3B parameter language model through a privacy-first Swift API. All processing happens on-device with no cloud dependency.

### Key Capabilities
- **Tool Calling**: Extend model capabilities with custom Swift tools
- **Guided Generation**: Type-safe structured outputs using `@Generable` macro
- **Streaming**: Real-time async response generation
- **Multi-turn Conversations**: Stateful session management
- **Privacy-First**: Entirely on-device, no network required
- **Speech Integration**: Combine with SpeechAnalyzer for voice-driven AI experiences

## Getting Started

### Requirements
- iOS 26.0+, macOS 26.0+, or visionOS 26.0+
- Xcode 17.0+
- Swift 6.0+

### Import Framework
```swift
import FoundationModels
```

### Basic Session Creation
```swift
let session = LanguageModelSession()

// With custom instructions
let session = LanguageModelSession(
    instructions: "You are a helpful assistant specialized in travel planning."
)
```

### Model Availability Check
```swift
switch SystemLanguageModel.default.availability {
case .available:
    // Proceed with model usage
    print("Model ready")
case .unavailable(let reason):
    // Handle unavailability (device constraints, settings disabled, etc.)
    handleUnavailability(reason)
}
```

## Tool Calling

### Tool Protocol Implementation

Tools conform to the `Tool` protocol with three requirements:

1. **name**: String identifier for the tool
2. **description**: Natural language description of functionality
3. **call(arguments:)**: Async method that executes tool logic and returns `GeneratedContent`

### Basic Tool Example

```swift
import FoundationModels
import CoreLocation
import WeatherKit

struct GetWeatherTool: Tool {
    let name = "getWeather"
    let description = "Retrieve current weather information for a specified city"

    @Generable
    struct Arguments {
        @Guide(description: "The city name to fetch weather for")
        var city: String
    }

    func call(arguments: Arguments) async throws -> GeneratedContent {
        // Geocode the city
        let geocoder = CLGeocoder()
        let placemarks = try await geocoder.geocodeAddressString(arguments.city)

        guard let location = placemarks.first?.location else {
            throw ToolError.locationNotFound
        }

        // Fetch weather
        let weather = try await WeatherService.shared.weather(for: location)
        let temp = weather.currentWeather.temperature.value
        let condition = weather.currentWeather.condition.description

        // Return GeneratedContent directly
        return GeneratedContent("\(condition), \(temp)°C in \(arguments.city)")
    }
}
```

### Advanced Tool with Multiple Arguments

```swift
struct SearchRestaurantsTool: Tool {
    let name = "searchRestaurants"
    let description = "Find nearby restaurants matching specific criteria"

    @Generable
    struct Arguments {
        @Guide(description: "Type of cuisine (e.g., Italian, Japanese)")
        let cuisine: String

        @Guide(description: "Price range from 1 (budget) to 4 (expensive)")
        let priceRange: Int

        @Guide(description: "Minimum rating from 1 to 5 stars")
        let minRating: Double

        @Guide(description: "Maximum results to return", .count(10))
        let maxResults: Int
    }

    func call(arguments: Arguments) async throws -> GeneratedContent {
        // Use your restaurant search service
        let restaurants = try await RestaurantService.search(
            cuisine: arguments.cuisine,
            priceRange: arguments.priceRange,
            minRating: arguments.minRating,
            limit: arguments.maxResults
        )

        // Format results as structured content
        let formatted = restaurants.map { restaurant in
            """
            \(restaurant.name) - \(restaurant.rating)⭐
            \(restaurant.address)
            Price: \(String(repeating: "$", count: restaurant.priceLevel))
            """
        }.joined(separator: "\n\n")

        return GeneratedContent(formatted)
    }
}
```

### Attaching Tools to Sessions

```swift
let session = LanguageModelSession(
    tools: [
        GetWeatherTool(),
        SearchRestaurantsTool(),
        BookReservationTool()
    ],
    instructions: "Help users find and book restaurants based on weather and preferences."
)
```

### Tool Best Practices

1. **Descriptive Names**: Use clear, action-oriented names (`getWeather`, not `weather`)
2. **Detailed Descriptions**: Help the model understand when to use the tool
3. **Comprehensive @Guide Annotations**: Guide model to generate valid arguments
4. **Error Handling**: Throw descriptive errors for invalid arguments or failures
5. **Structured Output**: Return `GeneratedContent` with typed properties when possible
6. **Async Operations**: Embrace Swift concurrency for network/database operations

### Common Tool Patterns

#### Data Retrieval Tool
```swift
struct FetchUserDataTool: Tool {
    let name = "fetchUserData"
    let description = "Retrieve user profile information by user ID"

    @Generable
    struct Arguments {
        @Guide(description: "Unique user identifier")
        let userId: String
    }

    func call(arguments: Arguments) async throws -> GeneratedContent {
        let user = try await UserService.fetch(id: arguments.userId)
        return GeneratedContent("User \(user.name) (\(user.email)), joined \(user.createdAt.ISO8601Format())")
    }
}
```

#### Action/Command Tool
```swift
struct SendNotificationTool: Tool {
    let name = "sendNotification"
    let description = "Send a push notification to a user"

    @Generable
    struct Arguments {
        @Guide(description: "User ID to notify")
        let userId: String

        @Guide(description: "Notification title")
        let title: String

        @Guide(description: "Notification message body")
        let message: String
    }

    func call(arguments: Arguments) async throws -> GeneratedContent {
        try await NotificationService.send(
            to: arguments.userId,
            title: arguments.title,
            message: arguments.message
        )
        return GeneratedContent("Notification sent successfully")
    }
}
```

## Guided Generation

### @Generable Macro

The `@Generable` macro enables type-safe structured output generation. The model generates valid Swift data structures through constrained decoding.

### Basic Guided Generation

```swift
@Generable
struct SearchSuggestions {
    @Guide(description: "A list of suggested search terms", .count(5))
    var searchTerms: [String]
}

let response = try await session.respond(
    to: "Generate search terms for historical landmarks in Rome",
    generating: SearchSuggestions.self
)

print(response.searchTerms)
// ["Colosseum", "Roman Forum", "Pantheon", "Trevi Fountain", "Vatican City"]
```

### Complex Nested Structures

```swift
@Generable
struct TravelItinerary {
    @Guide(description: "Destination city or region")
    var destination: String

    @Guide(description: "Number of days for the trip")
    var days: Int

    @Guide(description: "Total budget in USD")
    var budget: Float

    @Guide(description: "Trip rating from 1-5")
    var rating: Double

    @Guide(description: "Whether a visa is required")
    var requiresVisa: Bool

    @Guide(description: "Daily activities and attractions", .count(5...10))
    var activities: [String]

    @Guide(description: "Emergency contact person")
    var emergencyContact: ContactPerson

    @Guide(description: "Alternative destination suggestions", .count(3))
    var alternatives: [String]
}

@Generable
struct ContactPerson {
    var name: String
    var phone: String
    var relationship: String
}
```

### Enum Support

```swift
@Generable
enum SentimentAnalysis {
    case positive(confidence: Double)
    case negative(confidence: Double)
    case neutral
    case mixed(positiveAspects: [String], negativeAspects: [String])
}

let sentiment = try await session.respond(
    to: "Analyze: 'The product works great but customer service was terrible'",
    generating: SentimentAnalysis.self
)
```

### @Guide Modifiers

```swift
@Generable
struct Product {
    // Count range
    @Guide(description: "Product features", .count(3...7))
    var features: [String]

    // Exact count
    @Guide(description: "Top 5 reviews", .count(5))
    var topReviews: [String]

    // Optional with description
    @Guide(description: "Promotional discount percentage if available")
    var discount: Double?
}
```

## Streaming Responses

### Basic Streaming

```swift
let stream = session.streamResponse(
    to: "Write a detailed product description",
    generating: ProductDescription.self
)

for try await partial in stream {
    print("Current state:", partial)
    updateUI(with: partial)
}
```

### SwiftUI Integration

```swift
import SwiftUI
import FoundationModels

@Generable
struct RecipeDetails {
    var title: String
    var ingredients: [String]
    var steps: [String]
    var cookingTime: Int
}

struct RecipeGeneratorView: View {
    @State private var session = LanguageModelSession()
    @State private var recipe: RecipeDetails.PartiallyGenerated?
    @State private var isGenerating = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let recipe {
                VStack(alignment: .leading, spacing: 12) {
                    if let title = recipe.title {
                        Text(title)
                            .font(.title)
                            .fontWeight(.bold)
                    }

                    if let ingredients = recipe.ingredients {
                        VStack(alignment: .leading) {
                            Text("Ingredients")
                                .font(.headline)
                            ForEach(ingredients, id: \.self) { ingredient in
                                Text("• \(ingredient)")
                            }
                        }
                    }

                    if let steps = recipe.steps {
                        VStack(alignment: .leading) {
                            Text("Instructions")
                                .font(.headline)
                            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                                Text("\(index + 1). \(step)")
                            }
                        }
                    }

                    if let time = recipe.cookingTime {
                        Text("Cooking Time: \(time) minutes")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Button(isGenerating ? "Generating..." : "Generate Recipe") {
                Task {
                    await generateRecipe()
                }
            }
            .disabled(isGenerating)
        }
        .padding()
    }

    func generateRecipe() async {
        isGenerating = true
        defer { isGenerating = false }

        do {
            let stream = session.streamResponse(
                to: "Create a recipe for chocolate chip cookies",
                generating: RecipeDetails.self
            )

            for try await partial in stream {
                self.recipe = partial
            }
        } catch {
            print("Generation failed: \(error)")
        }
    }
}
```

### Monitoring Session State

```swift
class AIViewModel: ObservableObject {
    @Published var session = LanguageModelSession()
    @Published var isResponding = false

    func monitorSession() {
        // Observe session.isResponding
        Task {
            for await responding in session.$isResponding.values {
                await MainActor.run {
                    self.isResponding = responding
                }
            }
        }
    }
}
```

## Multi-turn Conversations

### Session Transcript Management

```swift
let session = LanguageModelSession()

// First interaction
let response1 = try await session.respond(
    to: "What's the capital of France?"
)

// Follow-up using conversation history
let response2 = try await session.respond(
    to: "What's the population?"
)

// Access full transcript
for turn in session.transcript {
    print("User: \(turn.userMessage)")
    print("Assistant: \(turn.assistantResponse)")
}
```

### Context Window Management

```swift
// Clear history when context becomes too large
if session.transcript.count > 20 {
    session.clearTranscript()
}

// Or create a new session
session = LanguageModelSession(
    instructions: session.instructions
)
```

## Advanced Patterns

### Specialized Use Cases

```swift
// Content tagging optimized model
let taggerSession = LanguageModelSession(
    model: SystemLanguageModel(useCase: .contentTagging),
    instructions: "Extract relevant tags from user content"
)

@Generable
struct ContentTags {
    @Guide(description: "Relevant topic tags", .count(5...10))
    var tags: [String]

    @Guide(description: "Primary category")
    var category: String
}

let tags = try await taggerSession.respond(
    to: content,
    generating: ContentTags.self
)
```

### Combining Tools and Guided Generation

```swift
struct AnalyzeAndActTool: Tool {
    let name = "analyzeUserIntent"
    let description = "Analyze user request and execute appropriate action"

    @Generable
    struct Arguments {
        @Guide(description: "Detected user intent")
        let intent: UserIntent

        @Guide(description: "Extracted parameters")
        let parameters: [String: String]
    }

    @Generable
    enum UserIntent {
        case bookFlight
        case checkWeather
        case setReminder
        case other
    }

    func call(arguments: Arguments) async throws -> GeneratedContent {
        switch arguments.intent {
        case .bookFlight:
            return try await handleFlightBooking(arguments.parameters)
        case .checkWeather:
            return try await handleWeatherCheck(arguments.parameters)
        case .setReminder:
            return try await handleReminder(arguments.parameters)
        case .other:
            return GeneratedContent("Unable to determine action")
        }
    }
}
```

### Error Handling

```swift
do {
    let response = try await session.respond(
        to: userMessage,
        generating: ResponseType.self
    )
    processResponse(response)
} catch let error as LanguageModelError {
    switch error {
    case .modelUnavailable:
        showAlert("AI features require iOS 26 or later")
    case .generationFailed:
        showAlert("Failed to generate response")
    case .invalidInput:
        showAlert("Invalid request format")
    default:
        showAlert("An error occurred: \(error.localizedDescription)")
    }
} catch {
    showAlert("Unexpected error: \(error)")
}
```

### Performance Optimization

```swift
// Pre-initialize session at app launch
class AppDelegate: NSObject, UIApplicationDelegate {
    let session = LanguageModelSession()

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil
    ) -> Bool {
        // Warm up model
        Task {
            _ = try? await session.respond(to: "Hello")
        }
        return true
    }
}
```

## Speech Integration

### Overview

The **Foundation Models framework does not have built-in audio/microphone capabilities**. It processes text input and generates text output. However, you can create powerful voice-driven AI experiences by combining two frameworks:

1. **SpeechAnalyzer** (iOS 26+) - Converts speech to text
2. **Foundation Models** - Processes text with AI

Both frameworks run entirely on-device, maintaining Apple's privacy-first approach.

### SpeechAnalyzer Framework

Apple introduced SpeechAnalyzer at WWDC 2025 as the next evolution of speech-to-text technology. It's built on a new proprietary Apple model that's **2.2× faster** than alternatives while maintaining high accuracy.

#### Key Components

- **SpeechAnalyzer**: Manages analysis sessions and coordinates modules
- **SpeechTranscriber**: Performs speech-to-text conversion
- **SpeechDetector**: Identifies voice activity in audio streams
- **AsyncSequence Integration**: Native Swift concurrency support

#### Import Framework

```swift
import Speech
import FoundationModels
```

### Basic Speech-to-Text Integration

```swift
import Speech
import FoundationModels
import AVFoundation

class VoiceAIAssistant: ObservableObject {
    @Published var transcribedText = ""
    @Published var aiResponse = ""
    @Published var isListening = false

    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?
    private var session = LanguageModelSession()

    func startListening() async throws {
        isListening = true

        // Create transcriber
        transcriber = SpeechTranscriber(
            locale: Locale.current,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )

        // Create analyzer with transcriber module
        analyzer = SpeechAnalyzer(modules: [transcriber!])

        // Get optimal audio format
        let audioFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [transcriber!]
        )

        // Create input stream
        let (inputSequence, builder) = AsyncStream<AnalyzerInput>.makeStream()
        self.inputBuilder = builder

        // Process transcription results
        Task {
            for try await result in transcriber!.results {
                let text = String(result.text.characters)

                await MainActor.run {
                    self.transcribedText = text
                }

                // When user finishes speaking, send to Foundation Models
                if result.isFinal {
                    await processWithAI(text)
                }
            }
        }

        // Start audio capture and analysis
        try await analyzer?.start(inputSequence: inputSequence)
        try await captureAudio(format: audioFormat)
    }

    func stopListening() async {
        inputBuilder?.finish()
        await analyzer?.stop()
        isListening = false
    }

    private func captureAudio(format: AVAudioFormat) async throws {
        let audioEngine = AVAudioEngine()
        let inputNode = audioEngine.inputNode

        inputNode.installTap(
            onBus: 0,
            bufferSize: 4096,
            format: format
        ) { [weak self] buffer, time in
            self?.inputBuilder?.yield(.audioBuffer(buffer))
        }

        audioEngine.prepare()
        try audioEngine.start()
    }

    private func processWithAI(_ text: String) async {
        do {
            let response = try await session.respond(to: text)
            await MainActor.run {
                self.aiResponse = response
            }
        } catch {
            print("AI processing failed: \(error)")
        }
    }
}
```

### SwiftUI Voice Interface

```swift
import SwiftUI

struct VoiceAIView: View {
    @StateObject private var assistant = VoiceAIAssistant()

    var body: some View {
        VStack(spacing: 24) {
            // Transcription display
            VStack(alignment: .leading, spacing: 8) {
                Text("You said:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text(assistant.transcribedText.isEmpty ? "Listening..." : assistant.transcribedText)
                    .font(.body)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(12)
            }

            // AI response display
            if !assistant.aiResponse.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("AI Response:")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Text(assistant.aiResponse)
                        .font(.body)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(Color.blue.opacity(0.1))
                        .cornerRadius(12)
                }
            }

            Spacer()

            // Voice control button
            Button(action: {
                Task {
                    if assistant.isListening {
                        await assistant.stopListening()
                    } else {
                        try? await assistant.startListening()
                    }
                }
            }) {
                Image(systemName: assistant.isListening ? "mic.fill" : "mic")
                    .font(.system(size: 32))
                    .foregroundColor(.white)
                    .frame(width: 80, height: 80)
                    .background(assistant.isListening ? Color.red : Color.blue)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding()
    }
}
```

### Advanced: Streaming Speech + Streaming AI

Combine streaming transcription with streaming AI responses for ultra-responsive experiences:

```swift
class StreamingVoiceAI: ObservableObject {
    @Published var currentTranscript = ""
    @Published var streamingResponse = ""

    private var session = LanguageModelSession()
    private var transcriber: SpeechTranscriber?
    private var analyzer: SpeechAnalyzer?

    func startStreamingConversation() async throws {
        // Setup transcriber
        transcriber = SpeechTranscriber(
            locale: Locale.current,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )

        analyzer = SpeechAnalyzer(modules: [transcriber!])

        // Process transcription stream
        Task {
            for try await result in transcriber!.results {
                let text = String(result.text.characters)

                await MainActor.run {
                    self.currentTranscript = text
                }

                // Stream AI response as user speaks
                if result.isFinal && !text.isEmpty {
                    await streamAIResponse(to: text)
                }
            }
        }

        // Start analysis
        let (inputSequence, inputBuilder) = AsyncStream<AnalyzerInput>.makeStream()
        try await analyzer?.start(inputSequence: inputSequence)

        // Capture audio...
    }

    private func streamAIResponse(to text: String) async {
        do {
            let stream = session.streamResponse(to: text)

            for try await chunk in stream {
                await MainActor.run {
                    self.streamingResponse = chunk
                }
            }
        } catch {
            print("Streaming failed: \(error)")
        }
    }
}
```

### Voice + Tool Calling

Create voice-activated tools that can perform actions:

```swift
struct VoiceCommandTool: Tool {
    let name = "executeVoiceCommand"
    let description = "Execute commands from voice input"

    @Generable
    struct Arguments {
        @Guide(description: "The action to perform")
        let action: VoiceAction

        @Guide(description: "Parameters for the action")
        let parameters: [String: String]
    }

    @Generable
    enum VoiceAction {
        case setTimer
        case sendMessage
        case searchWeb
        case playMusic
        case getWeather
    }

    func call(arguments: Arguments) async throws -> GeneratedContent {
        switch arguments.action {
        case .setTimer:
            let duration = arguments.parameters["duration"] ?? "5 minutes"
            try await TimerService.set(duration: duration)
            return GeneratedContent("Timer set for \(duration)")

        case .sendMessage:
            guard let recipient = arguments.parameters["recipient"],
                  let message = arguments.parameters["message"] else {
                throw ToolError.missingParameters
            }
            try await MessageService.send(to: recipient, message: message)
            return GeneratedContent("Message sent to \(recipient)")

        case .getWeather:
            let location = arguments.parameters["location"] ?? "current location"
            let weather = try await WeatherService.get(for: location)
            return GeneratedContent("Weather: \(weather.description)")

        default:
            return GeneratedContent("Action not yet implemented")
        }
    }
}

// Use in voice assistant
let session = LanguageModelSession(
    tools: [VoiceCommandTool()],
    instructions: """
    You are a voice-activated assistant. When users speak commands,
    parse their intent and use the executeVoiceCommand tool to perform actions.
    """
)
```

### Complete Voice Assistant Example

```swift
import SwiftUI
import Speech
import FoundationModels
import AVFoundation

@MainActor
class VoiceAssistantViewModel: ObservableObject {
    @Published var messages: [ConversationMessage] = []
    @Published var isListening = false
    @Published var currentTranscription = ""

    private var session: LanguageModelSession
    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    private var audioEngine: AVAudioEngine?
    private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?

    init() {
        // Initialize with voice-optimized tools
        self.session = LanguageModelSession(
            tools: [
                VoiceCommandTool(),
                GetWeatherTool(),
                SearchTool()
            ],
            instructions: """
            You are a helpful voice assistant. Provide concise, natural responses
            suitable for spoken output. When users ask to perform actions, use
            the available tools.
            """
        )
    }

    func toggleListening() async {
        if isListening {
            await stopListening()
        } else {
            do {
                try await startListening()
            } catch {
                print("Failed to start listening: \(error)")
            }
        }
    }

    private func startListening() async throws {
        // Request microphone permission
        let status = await AVAudioApplication.requestRecordPermission()
        guard status else {
            throw VoiceAssistantError.microphonePermissionDenied
        }

        isListening = true
        currentTranscription = ""

        // Setup transcriber
        transcriber = SpeechTranscriber(
            locale: Locale.current,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults, .partialResults],
            attributeOptions: []
        )

        analyzer = SpeechAnalyzer(modules: [transcriber!])

        let audioFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [transcriber!]
        )

        // Setup input stream
        let (inputSequence, builder) = AsyncStream<AnalyzerInput>.makeStream()
        self.inputBuilder = builder

        // Process transcription results
        Task {
            guard let transcriber = self.transcriber else { return }

            for try await result in transcriber.results {
                let text = String(result.text.characters)
                self.currentTranscription = text

                if result.isFinal && !text.isEmpty {
                    await self.processVoiceInput(text)
                }
            }
        }

        // Start analysis
        try await analyzer?.start(inputSequence: inputSequence)

        // Start audio capture
        try await startAudioCapture(format: audioFormat)
    }

    private func stopListening() async {
        inputBuilder?.finish()
        audioEngine?.stop()
        await analyzer?.stop()
        isListening = false
    }

    private func startAudioCapture(format: AVAudioFormat) async throws {
        audioEngine = AVAudioEngine()
        guard let audioEngine = audioEngine else { return }

        let inputNode = audioEngine.inputNode

        inputNode.installTap(
            onBus: 0,
            bufferSize: 4096,
            format: format
        ) { [weak self] buffer, _ in
            self?.inputBuilder?.yield(.audioBuffer(buffer))
        }

        audioEngine.prepare()
        try audioEngine.start()
    }

    private func processVoiceInput(_ text: String) async {
        // Add user message
        messages.append(ConversationMessage(text: text, isUser: true))

        // Get AI response
        do {
            let stream = session.streamResponse(to: text)
            var currentResponse = ""

            // Add assistant message placeholder
            messages.append(ConversationMessage(text: "", isUser: false))

            for try await chunk in stream {
                currentResponse = chunk
                if let lastIndex = messages.indices.last {
                    messages[lastIndex].text = currentResponse
                }
            }

            // Optionally speak response
            speakText(currentResponse)

        } catch {
            messages.append(ConversationMessage(
                text: "Sorry, I couldn't process that.",
                isUser: false
            ))
        }
    }

    private func speakText(_ text: String) {
        // Use AVSpeechSynthesizer for text-to-speech
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        let synthesizer = AVSpeechSynthesizer()
        synthesizer.speak(utterance)
    }
}

struct ConversationMessage: Identifiable {
    let id = UUID()
    var text: String
    let isUser: Bool
}

enum VoiceAssistantError: Error {
    case microphonePermissionDenied
}

struct VoiceAssistantView: View {
    @StateObject private var viewModel = VoiceAssistantViewModel()

    var body: some View {
        VStack {
            // Conversation history
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(viewModel.messages) { message in
                        HStack {
                            if message.isUser { Spacer() }

                            Text(message.text)
                                .padding()
                                .background(message.isUser ? Color.blue : Color.gray.opacity(0.2))
                                .foregroundColor(message.isUser ? .white : .primary)
                                .cornerRadius(16)

                            if !message.isUser { Spacer() }
                        }
                    }
                }
                .padding()
            }

            // Current transcription
            if viewModel.isListening && !viewModel.currentTranscription.isEmpty {
                Text(viewModel.currentTranscription)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding()
                    .background(Color.yellow.opacity(0.1))
                    .cornerRadius(8)
            }

            // Microphone button
            Button(action: {
                Task {
                    await viewModel.toggleListening()
                }
            }) {
                VStack {
                    Image(systemName: viewModel.isListening ? "mic.fill" : "mic")
                        .font(.system(size: 40))
                        .foregroundColor(.white)
                        .frame(width: 80, height: 80)
                        .background(
                            viewModel.isListening ?
                            Color.red :
                            Color.blue
                        )
                        .clipShape(Circle())

                    Text(viewModel.isListening ? "Listening..." : "Tap to speak")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
        }
        .navigationTitle("Voice Assistant")
    }
}
```

### Speech Integration Best Practices

1. **Permission Handling**
   - Request microphone permissions early
   - Provide clear UI feedback when permissions are denied
   - Add `NSMicrophoneUsageDescription` to Info.plist

2. **Audio Quality**
   - Use `SpeechAnalyzer.bestAvailableAudioFormat()` for optimal quality
   - Handle audio interruptions (calls, other apps)
   - Test in noisy environments

3. **Transcription Accuracy**
   - Use appropriate `Locale` for target language
   - Handle partial results for responsive UI
   - Consider `SpeechDetector` to filter out silence

4. **Performance**
   - Both speech and AI processing are on-device
   - Initialize components during app launch
   - Reuse `LanguageModelSession` across transcriptions

5. **User Experience**
   - Show visual feedback while listening
   - Display partial transcriptions as they arrive
   - Provide option to edit transcribed text
   - Consider text-to-speech for responses (AVSpeechSynthesizer)

6. **Privacy**
   - All processing is on-device (no network required)
   - No audio data leaves the device
   - Clearly communicate privacy benefits to users

### Permissions Setup

Add to your `Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app uses your microphone to enable voice commands and conversations with AI.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>This app uses speech recognition to transcribe your voice commands.</string>
```

### Resources

- [WWDC25 Session 277: Bring advanced speech-to-text to your app with SpeechAnalyzer](https://developer.apple.com/videos/play/wwdc2025/277/)
- [SpeechAnalyzer Documentation](https://developer.apple.com/documentation/speech/speechanalyzer)
- [SpeechTranscriber Documentation](https://developer.apple.com/documentation/speech/speechtranscriber)

## Best Practices

### 1. Session Lifecycle
- **Initialize early**: Create sessions during app launch to warm up the model
- **Reuse sessions**: Keep sessions alive for related conversations
- **Clear context**: Reset transcript when switching topics or users

### 2. Tool Design
- **Single responsibility**: Each tool should do one thing well
- **Descriptive metadata**: Clear names and descriptions improve tool selection
- **Comprehensive guides**: Use `@Guide` annotations extensively
- **Graceful failures**: Return meaningful error messages as GeneratedContent

### 3. Guided Generation
- **Start simple**: Begin with basic types, add complexity as needed
- **Use constraints**: Leverage `.count()` to control collection sizes
- **Nested structures**: Break complex types into reusable components
- **Optional fields**: Mark truly optional data to avoid generation failures

### 4. Streaming
- **Update incrementally**: Use `PartiallyGenerated` to update UI progressively
- **Handle cancellation**: Properly cleanup when user cancels generation
- **Show progress**: Indicate generation status to users

### 5. Privacy & Security
- **No sensitive data in instructions**: Avoid hardcoding secrets or PII
- **Validate tool outputs**: Don't blindly trust generated content
- **User consent**: Inform users about AI feature usage
- **On-device only**: Remember all processing is local—no network logging

### 6. Testing
- **Unit test tools**: Test `call(arguments:)` methods independently
- **Mock sessions**: Create test sessions with predetermined responses
- **Edge cases**: Test with invalid inputs, empty responses, errors
- **Performance**: Measure generation latency for user-facing features

### 7. Platform Considerations
- **Check availability**: Always verify `SystemLanguageModel.default.availability`
- **Fallback gracefully**: Provide non-AI alternatives when unavailable
- **Device constraints**: Model may be unavailable on older/lower-end devices
- **Settings respect**: Users can disable Apple Intelligence features

## Common Pitfalls

### ❌ Don't: Hardcode response expectations
```swift
// Bad: Assumes specific response format
let response = try await session.respond(to: "List fruits")
let fruits = response.split(separator: ",") // Fragile!
```

### ✅ Do: Use guided generation
```swift
// Good: Enforce structure with @Generable
@Generable
struct FruitList {
    @Guide(description: "List of fruit names")
    var fruits: [String]
}

let response = try await session.respond(
    to: "List fruits",
    generating: FruitList.self
)
```

### ❌ Don't: Block main thread
```swift
// Bad: Blocks UI
let response = try await session.respond(to: userInput) // On MainActor
```

### ✅ Do: Use Task for async operations
```swift
// Good: Non-blocking
Button("Generate") {
    Task {
        let response = try await session.respond(to: userInput)
        await MainActor.run {
            self.result = response
        }
    }
}
```

### ❌ Don't: Ignore tool errors
```swift
// Bad: Silent failure
func call(arguments: Arguments) async throws -> GeneratedContent {
    let data = try? fetchData() // Swallows error
    return GeneratedContent(data ?? "")
}
```

### ✅ Do: Propagate meaningful errors
```swift
// Good: Clear error handling
func call(arguments: Arguments) async throws -> GeneratedContent {
    guard let data = try await fetchData() else {
        throw ToolError.dataNotFound("No data available for \(arguments.id)")
    }
    return GeneratedContent(data)
}
```

## Platform-Specific Guidance

### iOS
- Respect backgrounding: Pause generation when app enters background
- Handle interruptions: Phone calls, notifications can affect generation
- Low Power Mode: Model availability may be restricted

### macOS
- Window management: Handle multiple windows with separate sessions
- Menu bar integration: Consider system-wide AI features via menu extras
- Spotlight integration: Use for quick AI-powered searches

### visionOS
- Spatial context: Tools can interact with 3D scene data
- Immersive experiences: Stream generation in volumetric displays
- Eye tracking: Combine with gaze data for contextual assistance

## Example: Complete AI-Powered Feature

```swift
import SwiftUI
import FoundationModels
import CoreLocation

// MARK: - Tools

struct GetLocationTool: Tool {
    let name = "getCurrentLocation"
    let description = "Get the user's current location"

    @Generable struct Arguments {}

    func call(arguments: Arguments) async throws -> GeneratedContent {
        let location = try await LocationManager.shared.getCurrentLocation()
        let city = try await reverseGeocode(location)
        return GeneratedContent("Current location: \(city) (lat: \(location.coordinate.latitude), lon: \(location.coordinate.longitude))")
    }
}

struct SearchEventsTool: Tool {
    let name = "searchEvents"
    let description = "Find local events by category and date range"

    @Generable
    struct Arguments {
        @Guide(description: "Event category (concert, sports, art, etc.)")
        let category: String

        @Guide(description: "Start date in ISO8601 format")
        let startDate: String

        @Guide(description: "End date in ISO8601 format")
        let endDate: String
    }

    func call(arguments: Arguments) async throws -> GeneratedContent {
        let events = try await EventService.search(
            category: arguments.category,
            from: ISO8601DateFormatter().date(from: arguments.startDate)!,
            to: ISO8601DateFormatter().date(from: arguments.endDate)!
        )

        let formatted = events.map { event in
            "\(event.name) - \(event.date.formatted()) at \(event.venue)"
        }.joined(separator: "\n")

        return GeneratedContent(formatted)
    }
}

// MARK: - View Model

@MainActor
class EventAssistantViewModel: ObservableObject {
    @Published var messages: [Message] = []
    @Published var isGenerating = false

    private let session: LanguageModelSession

    init() {
        self.session = LanguageModelSession(
            tools: [
                GetLocationTool(),
                SearchEventsTool()
            ],
            instructions: """
            You are a helpful event discovery assistant. Help users find local events
            based on their preferences and location. Use the available tools to get
            the user's location and search for relevant events.
            """
        )
    }

    func sendMessage(_ text: String) async {
        messages.append(Message(text: text, isUser: true))
        isGenerating = true
        defer { isGenerating = false }

        do {
            let stream = session.streamResponse(to: text)
            var currentResponse = ""

            for try await chunk in stream {
                currentResponse = chunk
                if let lastIndex = messages.lastIndex(where: { !$0.isUser }) {
                    messages[lastIndex].text = currentResponse
                } else {
                    messages.append(Message(text: currentResponse, isUser: false))
                }
            }
        } catch {
            messages.append(Message(
                text: "Sorry, I encountered an error: \(error.localizedDescription)",
                isUser: false
            ))
        }
    }
}

struct Message: Identifiable {
    let id = UUID()
    var text: String
    let isUser: Bool
}

// MARK: - View

struct EventAssistantView: View {
    @StateObject private var viewModel = EventAssistantViewModel()
    @State private var inputText = ""

    var body: some View {
        VStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(viewModel.messages) { message in
                        MessageBubble(message: message)
                    }
                }
                .padding()
            }

            HStack {
                TextField("Ask about events...", text: $inputText)
                    .textFieldStyle(.roundedBorder)
                    .disabled(viewModel.isGenerating)

                Button("Send") {
                    let text = inputText
                    inputText = ""
                    Task {
                        await viewModel.sendMessage(text)
                    }
                }
                .disabled(inputText.isEmpty || viewModel.isGenerating)
            }
            .padding()
        }
        .navigationTitle("Event Assistant")
    }
}

struct MessageBubble: View {
    let message: Message

    var body: some View {
        HStack {
            if message.isUser { Spacer() }

            Text(message.text)
                .padding(12)
                .background(message.isUser ? Color.blue : Color.gray.opacity(0.2))
                .foregroundColor(message.isUser ? .white : .primary)
                .cornerRadius(16)

            if !message.isUser { Spacer() }
        }
    }
}
```

## Resources

- [WWDC25 Session 286: Meet the Foundation Models framework](https://developer.apple.com/videos/play/wwdc2025/286/)
- [WWDC25 Session 259: Bring on-device AI to your app](https://developer.apple.com/videos/play/wwdc2025/259/)
- [Apple Foundation Models Documentation](https://developer.apple.com/documentation/foundationmodels)
- [Apple Intelligence Overview](https://machinelearning.apple.com/research/apple-foundation-models-2025-updates)

## Version History

- **1.2.0** (2025-11-12): Fixed Tool protocol - corrected all examples to return `GeneratedContent` directly instead of wrapping in `ToolOutput`
- **1.1.0** (2025-11-10): Added comprehensive speech integration section with SpeechAnalyzer and voice assistant examples
- **1.0.0** (2025-06-10): Initial skill creation based on WWDC25 announcements
