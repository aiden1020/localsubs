package main

import (
	"flag"
	"fmt"
	"strings"

	"localsubs/internal/config"
	"localsubs/internal/nativehost"
	"localsubs/internal/runtime"
	"localsubs/internal/ui"
)

type setupDependencies struct {
	downloadRuntime    func(string) error
	downloadModel      func() error
	installIntegration func([]string) error
}

func setup(args []string) error {
	flags := flag.NewFlagSet("setup", flag.ContinueOnError)
	browser := flags.String("browser", "chrome", "browser to configure: chrome, chromium, edge")
	extensionID := flags.String("extension-id", config.DefaultExtensionID, "extension ID allowed to connect")
	backend := flags.String("backend", "auto", "inference backend: auto, cpu, or cuda")
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if strings.TrimSpace(*browser) == "" {
		return fmt.Errorf("browser must not be empty")
	}
	if _, err := runtime.ParseBackendMode(*backend); err != nil {
		return err
	}
	if _, _, err := nativehost.CheckInstalled("", *browser); err != nil {
		return err
	}
	dependencies := setupDependencies{
		downloadModel: func() error {
			return modelDownloadWithNextStep(false)
		},
		installIntegration: func(installArgs []string) error {
			return installWithNextStep(installArgs, false)
		},
	}
	if runtime.ManagedRuntimeDownloads() {
		dependencies.downloadRuntime = func(value string) error {
			return runtimeDownload([]string{"--backend", value})
		}
	}
	return runSetup(*browser, *extensionID, *backend, dependencies)
}

func runSetup(browser, extensionID, backend string, dependencies setupDependencies) error {
	fmt.Printf("%s  %s\n\n", ui.Bold("LocalSubs Setup"), ui.Dim("v"+runtime.HelperVersion))
	totalSteps := 2
	step := 1
	if dependencies.downloadRuntime != nil {
		totalSteps = 3
		ui.PrintHeader(fmt.Sprintf("Step %d of %d · Inference runtime", step, totalSteps))
		if err := dependencies.downloadRuntime(backend); err != nil {
			return err
		}
		step++
		ui.PrintBlank()
	}
	ui.PrintHeader(fmt.Sprintf("Step %d of %d · Translation model", step, totalSteps))
	if err := dependencies.downloadModel(); err != nil {
		return err
	}

	ui.PrintBlank()
	step++
	ui.PrintHeader(fmt.Sprintf("Step %d of %d · %s integration", step, totalSteps, displayBrowserName(browser)))
	if err := dependencies.installIntegration([]string{
		"--browser", browser,
		"--extension-id", extensionID,
	}); err != nil {
		return err
	}

	ui.PrintBlank()
	fmt.Println(ui.OK("Setup complete"))
	ui.PrintDetail("Next: reload the LocalSubs extension in " + displayBrowserName(browser) + ".")
	return nil
}
