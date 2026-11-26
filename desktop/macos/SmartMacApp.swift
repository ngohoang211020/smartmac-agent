// SmartMac native macOS desktop shell
// - Spawns the bundled Node.js server (dist-server/index.js) in the background
// - Renders the dashboard inside a native WKWebView window
// - Lives in the menu bar; closing the window keeps the agent running
// - "Launch at Login" toggle writes ~/Library/LaunchAgents/com.smartmac.agent.plist

import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusItem: NSStatusItem!
    private var loginItem: NSMenuItem!
    private var serverProcess: Process?
    private var dashboardLoaded = false

    private let port: Int = {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "SMPort") as? String, let value = Int(raw) {
            return value
        }
        return 4545
    }()
    private let rootDir = Bundle.main.object(forInfoDictionaryKey: "SMRootDir") as? String ?? ""
    private let nodePath = Bundle.main.object(forInfoDictionaryKey: "SMNodePath") as? String ?? "/usr/local/bin/node"

    private var baseURL: URL { URL(string: "http://127.0.0.1:\(port)/")! }
    private var logURL: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/SmartMac.log")
    }
    private var launchAgentURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/com.smartmac.agent.plist")
    }

    // MARK: - Lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        let startHidden = CommandLine.arguments.contains("--background")

        buildMainMenu()
        buildStatusItem()
        buildWindow()

        isServerUp { [weak self] up in
            guard let self = self else { return }
            if !up { self.startServer() }
            self.waitForServer(attempt: 0)
        }

        if startHidden {
            NSApp.setActivationPolicy(.accessory)
        } else {
            showWindow()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationWillTerminate(_ notification: Notification) {
        serverProcess?.terminate()
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        // Keep the agent running in the menu bar instead of quitting
        window.orderOut(nil)
        NSApp.setActivationPolicy(.accessory)
        return false
    }

    // MARK: - Node.js server

    private func startServer() {
        let entry = (rootDir as NSString).appendingPathComponent("dist-server/index.js")
        guard FileManager.default.fileExists(atPath: entry) else {
            showStartupError("Server entry not found:<br><code>\(entry)</code>")
            return
        }

        let fm = FileManager.default
        try? fm.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if !fm.fileExists(atPath: logURL.path) {
            fm.createFile(atPath: logURL.path, contents: nil)
        }
        let logHandle = try? FileHandle(forWritingTo: logURL)
        logHandle?.seekToEndOfFile()

        let process = Process()
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [entry]
        process.currentDirectoryURL = URL(fileURLWithPath: rootDir)

        var env = ProcessInfo.processInfo.environment
        env["PORT"] = String(port)
        env["HOST"] = "127.0.0.1"
        let nodeDir = (nodePath as NSString).deletingLastPathComponent
        env["PATH"] = "\(nodeDir):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        process.environment = env

        if let handle = logHandle {
            process.standardOutput = handle
            process.standardError = handle
        }

        do {
            try process.run()
            serverProcess = process
        } catch {
            showStartupError("Failed to start Node.js (\(nodePath)):<br>\(error.localizedDescription)")
        }
    }

    private func isServerUp(_ completion: @escaping (Bool) -> Void) {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/security/status"))
        request.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let up = (response as? HTTPURLResponse) != nil
            DispatchQueue.main.async { completion(up) }
        }.resume()
    }

    private func waitForServer(attempt: Int) {
        isServerUp { [weak self] up in
            guard let self = self else { return }
            if up {
                self.dashboardLoaded = true
                self.webView.load(URLRequest(url: self.baseURL))
            } else if attempt < 60 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.waitForServer(attempt: attempt + 1)
                }
            } else {
                self.showStartupError("The SmartMac server did not respond on port \(self.port).")
            }
        }
    }

    // MARK: - Window & WebView

    private func buildWindow() {
        let config = WKWebViewConfiguration()
        config.preferences.javaScriptCanOpenWindowsAutomatically = true

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "SmartMac"
        window.minSize = NSSize(width: 1024, height: 680)
        window.contentView = webView
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("SmartMacMainWindow")

        webView.loadHTMLString(Self.loadingHTML, baseURL: nil)
    }

    @objc func showWindow() {
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func reloadDashboard() {
        if dashboardLoaded {
            webView.reload()
        } else {
            waitForServer(attempt: 0)
        }
    }

    @objc private func openInBrowser() {
        NSWorkspace.shared.open(baseURL)
    }

    @objc private func openLogs() {
        NSWorkspace.shared.open(logURL)
    }

    @objc private func quitApp() {
        serverProcess?.terminate()
        NSApp.terminate(nil)
    }

    private func showStartupError(_ message: String) {
        let html = """
        <html><body style="font-family:-apple-system;background:#F8F9FA;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;max-width:520px;text-align:center">
        <h2 style="color:#0f172a;margin:0 0 8px">SmartMac could not start</h2>
        <p style="color:#475569;font-size:14px">\(message)</p>
        <p style="color:#94a3b8;font-size:12px">Logs: \(logURL.path)</p>
        </div></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // Open external links (Gmail, Google OAuth, docs) in the default browser
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url,
           let scheme = url.scheme, scheme.hasPrefix("http"),
           let host = url.host, host != "127.0.0.1", host != "localhost" {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // Allow microphone / camera for the local dashboard (Audio recorder, screen recorder narration)
    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let trusted = origin.host == "127.0.0.1" || origin.host == "localhost"
        decisionHandler(trusted ? .grant : .deny)
    }

    // MARK: - Launch at Login (LaunchAgent)

    private var isLaunchAgentInstalled: Bool {
        FileManager.default.fileExists(atPath: launchAgentURL.path)
    }

    @objc private func toggleLaunchAtLogin() {
        if isLaunchAgentInstalled {
            try? FileManager.default.removeItem(at: launchAgentURL)
        } else {
            let plist: [String: Any] = [
                "Label": "com.smartmac.agent",
                "ProgramArguments": ["/usr/bin/open", "-g", "-a", Bundle.main.bundlePath, "--args", "--background"],
                "RunAtLoad": true,
            ]
            try? FileManager.default.createDirectory(
                at: launchAgentURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            if let data = try? PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0) {
                try? data.write(to: launchAgentURL)
            }
        }
        loginItem.state = isLaunchAgentInstalled ? .on : .off
    }

    // MARK: - Menus

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "cpu", accessibilityDescription: "SmartMac")
            button.image?.isTemplate = true
            button.toolTip = "SmartMac Agent"
        }

        let menu = NSMenu()
        addItem(menu, "Open SmartMac Dashboard", #selector(showWindow), "o")
        addItem(menu, "Open in Web Browser", #selector(openInBrowser), "")
        addItem(menu, "Reload Dashboard", #selector(reloadDashboard), "")
        menu.addItem(.separator())
        loginItem = addItem(menu, "Launch at Login", #selector(toggleLaunchAtLogin), "")
        loginItem.state = isLaunchAgentInstalled ? .on : .off
        addItem(menu, "Show Server Logs", #selector(openLogs), "")
        menu.addItem(.separator())
        addItem(menu, "Quit SmartMac", #selector(quitApp), "q")
        statusItem.menu = menu
    }

    @discardableResult
    private func addItem(_ menu: NSMenu, _ title: String, _ action: Selector, _ key: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        menu.addItem(item)
        return item
    }

    private func buildMainMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About SmartMac",
                        action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide SmartMac", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit SmartMac", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        appMenu.addItem(quit)
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        let reload = NSMenuItem(title: "Reload", action: #selector(reloadDashboard), keyEquivalent: "r")
        reload.target = self
        viewMenu.addItem(reload)
        viewItem.submenu = viewMenu
        mainMenu.addItem(viewItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = windowMenu
        mainMenu.addItem(windowItem)

        NSApp.mainMenu = mainMenu
    }

    private static let loadingHTML = """
    <html><head><style>
    body{font-family:-apple-system;background:#F8F9FA;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .s{width:36px;height:36px;border:4px solid #fde3d3;border-top-color:#F26522;border-radius:50%;animation:r 0.8s linear infinite;margin:0 auto 14px}
    @keyframes r{to{transform:rotate(360deg)}}
    </style></head><body><div style="text-align:center">
    <div class="s"></div>
    <div style="font-weight:800;color:#0f172a">Starting SmartMac Agent…</div>
    <div style="color:#94a3b8;font-size:12px;margin-top:4px">Launching local server on 127.0.0.1</div>
    </div></body></html>
    """
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
