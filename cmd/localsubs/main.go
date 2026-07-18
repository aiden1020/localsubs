package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"

	"localsubs/internal/config"
	"localsubs/internal/manifest"
	"localsubs/internal/model"
	"localsubs/internal/nativehost"
	"localsubs/internal/runtime"
	"localsubs/internal/server"
	"localsubs/internal/session"
	"localsubs/internal/ui"
)

// silentError signals a non-zero exit without printing anything — the command
// already printed its own diagnostic output.
type silentError struct{ cause error }

func (e silentError) Error() string { return e.cause.Error() }
func (e silentError) Unwrap() error { return e.cause }

func main() {
	err := run(os.Args[1:])
	if err == nil {
		return
	}
	if errors.Is(err, flag.ErrHelp) {
		return
	}
	var silent silentError
	if !errors.As(err, &silent) {
		ui.PrintError(err)
	}
	if len(os.Args) > 1 && os.Args[1] == "native-host" {
		writeNativeHostError(err)
	}
	os.Exit(1)
}

func run(args []string) error {
	if len(args) == 0 {
		printUsage()
		return nil
	}
	switch args[0] {
	// User-facing commands
	case "install":
		return install(args[1:])
	case "setup":
		return setup(args[1:])
	case "status":
		return status(args[1:])
	case "doctor":
		return doctor(args[1:])
	case "model":
		return modelCommand(args[1:])
	case "logs":
		return logs()
	case "version":
		fmt.Printf("%s  api %s\n", ui.Bold("localsubs "+runtime.HelperVersion), runtime.APIVersion)
		return nil
	case "-h", "--help", "help":
		printUsage()
		return nil

	// Internal / advanced commands — functional but hidden from help
	case "serve":
		return serve(args[1:])
	case "native-host":
		return nativeHost(args[1:])
	case "install-native-host": // backward-compat alias
		return install(args[1:])
	default:
		err := fmt.Errorf("unknown command: %s", args[0])
		ui.PrintError(err)
		fmt.Fprintln(os.Stderr)
		printUsageTo(os.Stderr)
		return silentError{err}
	}
}

func printUsage() {
	printUsageTo(os.Stdout)
}

func printUsageTo(writer io.Writer) {
	fmt.Fprintf(writer, "%s  %s\n\n", ui.Bold("localsubs"), ui.Dim("v"+runtime.HelperVersion))
	fmt.Fprintln(writer, ui.Bold("Setup:"))
	setup := [][2]string{
		{"setup [--browser ...]", "Download the model and install browser integration"},
		{"model download", "Download the translation model (~350 MB)"},
		{"install", "Install the Chrome integration"},
	}
	for _, c := range setup {
		fmt.Fprintf(writer, "  %-32s%s\n", c[0], ui.Dim(c[1]))
	}
	fmt.Fprintln(writer)
	fmt.Fprintln(writer, ui.Bold("Commands:"))
	cmds := [][2]string{
		{"status [--json]", "Check whether LocalSubs is ready"},
		{"doctor [--json] [--deep]", "Diagnose setup and inference problems"},
		{"model status [--json]", "Inspect the installed model"},
		{"logs", "Print the Native Host log path"},
		{"version", "Print helper and API versions"},
	}
	for _, c := range cmds {
		fmt.Fprintf(writer, "  %-32s%s\n", c[0], ui.Dim(c[1]))
	}
}

func parseFlags(flags *flag.FlagSet, args []string) error {
	err := flags.Parse(args)
	if err == nil || errors.Is(err, flag.ErrHelp) {
		return err
	}
	return silentError{err}
}

func addBackendFlags(flags *flag.FlagSet) (*bool, *string, *string) {
	fakeBackend := flags.Bool("fake-backend", false, "use in-process fake backend")
	backendURL := flags.String("backend-url", "", "existing llama-server URL for development")
	modelPath := flags.String("model", runtime.DefaultModelFilename, "GGUF model path")
	return fakeBackend, backendURL, modelPath
}

func serve(args []string) error {
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	host := flags.String("host", "127.0.0.1", "helper bind host")
	port := flags.Int("port", 8765, "helper bind port")
	token := flags.String("token", config.DefaultLocalHelperToken, "local bearer token")
	allowedOrigins := flags.String("allow-origin", "", "comma-separated allowed origins")
	fakeBackend, backendURL, modelPath := addBackendFlags(flags)
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if *host != "127.0.0.1" {
		return fmt.Errorf("refusing to bind to %s; helper binds to 127.0.0.1 by default", *host)
	}

	ctx := context.Background()
	translator, profile, cleanup, err := buildTranslator(ctx, backendOptions{
		fakeBackend: *fakeBackend,
		backendURL:  *backendURL,
		modelPath:   *modelPath,
	})
	if err != nil {
		return err
	}
	defer cleanup()

	service := session.NewService(translator, profile)
	api := server.New(server.Config{
		Token:               *token,
		AllowedOrigins:      splitCSV(*allowedOrigins),
		DefaultContextLines: profile.SubtitleContextLines,
	}, service)
	httpServer := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", *host, *port),
		Handler:           api.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	listener, err := net.Listen("tcp", httpServer.Addr)
	if err != nil {
		return err
	}
	fmt.Printf("%s  listening on http://%s\n",
		ui.Bold("localsubs "+runtime.HelperVersion),
		listener.Addr().String(),
	)
	return httpServer.Serve(listener)
}

func nativeHost(args []string) error {
	flags := flag.NewFlagSet("native-host", flag.ContinueOnError)
	fakeBackend, backendURL, modelPath := addBackendFlags(flags)
	if err := parseFlags(flags, args); err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Pre-compute profile so the service and loading translator agree on it.
	profile := runtime.DefaultProfile()
	profile.ModelPath = resolveModelPath(*modelPath)
	loading := runtime.NewLoadingTranslator(profile)

	// Start llama-server in the background so the host can serve messages
	// immediately. The first health check returns loading:true until ready.
	// wg ensures the cleanup goroutine kills llama-server before this process
	// exits — without it, Go's runtime terminates goroutines mid-cleanup and
	// leaves orphaned llama-server processes.
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		translator, _, cleanup, err := buildTranslator(ctx, backendOptions{
			fakeBackend: *fakeBackend,
			backendURL:  *backendURL,
			modelPath:   *modelPath,
		})
		if err != nil {
			loading.SetError(err)
			return
		}
		loading.SetReady(translator)
		<-ctx.Done()
		cleanup()
	}()

	service := session.NewService(loading, profile)
	host := nativehost.New(nativehost.Config{
		DefaultContextLines: profile.SubtitleContextLines,
		IdleTimeout:         30 * time.Minute,
	}, service)
	serveErr := host.Serve(ctx, os.Stdin, os.Stdout)
	cancel()  // signal goroutine to proceed with cleanup
	wg.Wait() // block until llama-server is killed
	return serveErr
}

func install(args []string) error {
	return installWithNextStep(args, true)
}

func installWithNextStep(args []string, showNextStep bool) error {
	flags := flag.NewFlagSet("install", flag.ContinueOnError)
	browser := flags.String("browser", "chrome", "browser to connect: chrome, chromium, edge")
	extensionID := flags.String("extension-id", config.DefaultExtensionID, "extension ID allowed to connect")
	binaryPath := flags.String("path", "", "helper binary path; defaults to current executable")
	workDir := flags.String("workdir", "", "working directory override")
	homeDir := flags.String("home", "", "home directory override")
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if strings.TrimSpace(*browser) == "" {
		return fmt.Errorf("browser must not be empty")
	}
	result, err := nativehost.InstallManifest(nativehost.InstallOptions{
		HomeDir:     *homeDir,
		Browser:     *browser,
		ExtensionID: *extensionID,
		BinaryPath:  *binaryPath,
		WorkDir:     *workDir,
	})
	if err != nil {
		return err
	}
	browserLabel := displayBrowserName(*browser)
	fmt.Println(ui.OK(browserLabel + " integration installed"))
	ui.PrintBlank()
	ui.PrintRow("Config", ui.CompactPath(result.Path))
	ui.PrintRow("Origin", result.Manifest.AllowedOrigins[0])
	if showNextStep {
		ui.PrintBlank()
		ui.PrintDetail("Next: reload the LocalSubs extension in " + browserLabel + ".")
	}
	return nil
}

func displayBrowserName(browser string) string {
	switch strings.ToLower(strings.TrimSpace(browser)) {
	case "chrome", "google-chrome":
		return "Chrome"
	case "chromium":
		return "Chromium"
	case "edge", "microsoft-edge":
		return "Microsoft Edge"
	default:
		return browser
	}
}

type backendOptions struct {
	fakeBackend bool
	backendURL  string
	modelPath   string
}

func buildTranslator(ctx context.Context, options backendOptions) (runtime.Translator, runtime.Profile, func(), error) {
	profile := runtime.DefaultProfile()
	profile.ModelPath = resolveModelPath(options.modelPath)
	cleanup := func() {}

	switch {
	case options.fakeBackend:
		return &runtime.StaticTranslator{Profile: profile, Translation: "我馬上回來。", Ready: true}, profile, cleanup, nil
	case options.backendURL != "":
		return runtime.NewLlamaClient(options.backendURL, profile, false), profile, cleanup, nil
	default:
		backendPort, err := runtime.AllocateLocalPort()
		if err != nil {
			return nil, profile, cleanup, err
		}
		command := runtime.LlamaServerCommand{
			Binary:  "llama-server",
			Model:   profile.ModelPath,
			Host:    "127.0.0.1",
			Port:    backendPort,
			Profile: profile,
		}
		started, err := runtime.StartManagedBackend(ctx, command, 60*time.Second)
		if err != nil {
			return nil, profile, cleanup, err
		}
		cleanup = func() { started.Stop() }
		return runtime.NewLlamaClient(started.BaseURL, profile, true), profile, cleanup, nil
	}
}

func status(args []string) error {
	flags := flag.NewFlagSet("status", flag.ContinueOnError)
	baseURL := flags.String("url", "", "advanced: inspect an explicitly started HTTP helper URL")
	jsonMode := flags.Bool("json", false, "output raw JSON")
	browser := flags.String("browser", "chrome", "browser installation to inspect")
	extensionID := flags.String("extension-id", config.DefaultExtensionID, "extension ID expected to connect")
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if strings.TrimSpace(*baseURL) != "" {
		return statusHTTP(*baseURL, *jsonMode)
	}
	homeDir, _ := os.UserHomeDir()
	local := collectLocalStatus(homeDir, *browser, *extensionID)
	if *jsonMode {
		if err := json.NewEncoder(os.Stdout).Encode(local); err != nil {
			return err
		}
		if !local.Ready {
			return silentError{fmt.Errorf("LocalSubs is not ready")}
		}
		return nil
	}
	printLocalStatusHuman(local)
	if !local.Ready {
		return silentError{fmt.Errorf("LocalSubs is not ready")}
	}
	return nil
}

func printStatusHuman(h runtime.Health, baseURL string) {
	state := ui.OK("Ready")
	if !h.OK {
		state = ui.Fail("Needs attention")
	}
	fmt.Printf("%s  %s\n\n", ui.Bold("LocalSubs Service"), state)
	if h.OK {
		ui.PrintRow("Helper", ui.OK("running")+"  "+ui.Dim(baseURL))
	} else {
		ui.PrintRow("Helper", ui.Fail("unavailable"))
		if h.LastError != "" {
			ui.PrintHint(h.LastError)
		}
	}
	ui.PrintRow("API", fmt.Sprintf("v%s  ·  helper %s", h.APIVersion, h.HelperVersion))
	backendState := h.Backend.Kind
	if h.Backend.Ready {
		backendState += "  " + ui.OK("ready")
	} else {
		backendState += "  " + ui.Fail("not ready")
	}
	ui.PrintRow("Backend", backendState)
	modelState := h.Model.ID + "  " + ui.Dim(h.Model.Version)
	if h.Model.Status == "ready" || h.Model.Status == "verified" {
		modelState += "  " + ui.OK(h.Model.Status)
	} else {
		modelState += "  " + ui.Fail(h.Model.Status)
	}
	ui.PrintRow("Model", modelState)
	ui.PrintRow("Profile", h.Profile)
	if !h.OK {
		ui.PrintBlank()
		fmt.Println(ui.Bold("Next:"))
		fmt.Println("  localsubs doctor")
	}
}

func logs() error {
	fmt.Println(config.NativeHostLogPath())
	return nil
}

func modelCommand(args []string) error {
	if len(args) >= 1 {
		switch args[0] {
		case "status":
			return modelStatus(args[1:])
		case "download":
			return modelDownload()
		case "-h", "--help", "help":
			printModelUsage()
			return nil
		}
	}
	err := fmt.Errorf("model subcommand is required")
	if len(args) > 0 {
		err = fmt.Errorf("unknown model command: %s", args[0])
	}
	ui.PrintError(err)
	fmt.Fprintln(os.Stderr)
	printModelUsageTo(os.Stderr)
	return silentError{err}
}

func printModelUsage() {
	printModelUsageTo(os.Stdout)
}

func printModelUsageTo(writer io.Writer) {
	fmt.Fprintln(writer, "Usage: localsubs model <command>")
	fmt.Fprintln(writer)
	fmt.Fprintln(writer, "Commands:")
	fmt.Fprintln(writer, "  download    Download and verify the translation model")
	fmt.Fprintln(writer, "  status      Inspect the installed model              [--json]")
}

func modelStatus(args []string) error {
	flags := flag.NewFlagSet("model-status", flag.ContinueOnError)
	jsonMode := flags.Bool("json", false, "output raw JSON")
	if err := parseFlags(flags, args); err != nil {
		return err
	}

	m, err := loadManifest()
	if err != nil {
		return err
	}
	entry, ok := m.Entry("")
	if !ok {
		return fmt.Errorf("model manifest has no default channel")
	}
	entry.Path = resolveModelPath(entry.Path)

	s := runModelCheck(entry)
	ready := modelStateReady(s.State)

	if *jsonMode {
		output := struct {
			model.Status
			Command string `json:"command,omitempty"`
		}{Status: s}
		if !ready {
			output.Command = "localsubs model download"
		}
		body, err := json.MarshalIndent(output, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(body))
		if !ready {
			return silentError{fmt.Errorf("model is not ready")}
		}
		return nil
	}

	printModelStatusHuman(s, entry)
	if !ready {
		return silentError{fmt.Errorf("model is not ready")}
	}
	return nil
}

func printModelStatusHuman(s model.Status, entry model.Entry) {
	ui.PrintRow("Model", s.ID+"  "+ui.Dim("("+s.Version+")"))
	ui.PrintRow("File", ui.CompactPath(entry.Path))
	switch s.State {
	case "verified", "ready":
		ui.PrintRow("State", ui.OK(s.State))
	default:
		ui.PrintRow("State", ui.Fail(s.State))
	}
	if s.Reason != "" {
		ui.PrintRow("", ui.Dim(s.Reason))
	}
	if !modelStateReady(s.State) {
		ui.PrintBlank()
		fmt.Println(ui.Bold("Fix:"))
		fmt.Println("  localsubs model download")
	}
}

// modelCheckMsg carries the result of model.Check back to the bubbletea runtime.
type modelCheckMsg model.Status

type modelCheckSpinner struct {
	spinner spinner.Model
	entry   model.Entry
	result  model.Status
	done    bool
}

func (m modelCheckSpinner) Init() tea.Cmd {
	return tea.Batch(m.spinner.Tick, func() tea.Msg {
		return modelCheckMsg(model.Check(m.entry))
	})
}

func (m modelCheckSpinner) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case modelCheckMsg:
		m.done = true
		m.result = model.Status(msg)
		return m, tea.Quit
	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m modelCheckSpinner) View() string {
	if m.done {
		return ""
	}
	return fmt.Sprintf("  %s  checking model...\n", m.spinner.View())
}

func runModelCheck(entry model.Entry) model.Status {
	fi, err := os.Stdout.Stat()
	isTTY := err == nil && (fi.Mode()&os.ModeCharDevice) != 0

	if !isTTY || entry.SHA256 == "" {
		return model.Check(entry)
	}

	s := spinner.New()
	s.Spinner = spinner.Dot
	m := modelCheckSpinner{spinner: s, entry: entry}
	p := tea.NewProgram(m)
	final, err := p.Run()
	if err != nil {
		return model.Check(entry)
	}
	return final.(modelCheckSpinner).result
}

func loadManifest() (model.Manifest, error) {
	return model.ParseManifest(manifest.Data)
}

// resolveModelPath converts a relative model path to an absolute one.
// Search order: CWD → next to binary → parent of binary dir → AppDataDir/models.
func resolveModelPath(path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	candidates := []string{path}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, path),
			filepath.Join(filepath.Dir(exeDir), path),
		)
	}
	for _, c := range candidates {
		if abs, err := filepath.Abs(c); err == nil {
			if _, err := os.Stat(abs); err == nil {
				return abs
			}
		}
	}
	return filepath.Join(config.AppDataDir(), "models", path)
}

func splitCSV(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	raw := strings.Split(value, ",")
	result := make([]string, 0, len(raw))
	for _, item := range raw {
		item = strings.TrimSpace(item)
		if item != "" {
			result = append(result, item)
		}
	}
	return result
}

func writeNativeHostError(err error) {
	logDir := config.LogDir()
	if mkdirErr := os.MkdirAll(logDir, 0o755); mkdirErr != nil {
		return
	}
	logPath := config.NativeHostLogPath()
	line := fmt.Sprintf("%s %s\n", time.Now().Format(time.RFC3339), err.Error())
	file, openErr := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if openErr != nil {
		return
	}
	defer file.Close()
	_, _ = file.WriteString(line)
}
