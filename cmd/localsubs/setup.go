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
	downloadModel      func() error
	installIntegration func([]string) error
}

func setup(args []string) error {
	flags := flag.NewFlagSet("setup", flag.ContinueOnError)
	browser := flags.String("browser", "chrome", "browser to configure: chrome, chromium, edge")
	extensionID := flags.String("extension-id", config.DefaultExtensionID, "extension ID allowed to connect")
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	if strings.TrimSpace(*browser) == "" {
		return fmt.Errorf("browser must not be empty")
	}
	if _, _, err := nativehost.CheckInstalled("", *browser); err != nil {
		return err
	}
	return runSetup(*browser, *extensionID, setupDependencies{
		downloadModel: func() error {
			return modelDownloadWithNextStep(false)
		},
		installIntegration: func(installArgs []string) error {
			return installWithNextStep(installArgs, false)
		},
	})
}

func runSetup(browser, extensionID string, dependencies setupDependencies) error {
	fmt.Printf("%s  %s\n\n", ui.Bold("LocalSubs Setup"), ui.Dim("v"+runtime.HelperVersion))
	ui.PrintHeader("Step 1 of 2 · Translation model")
	if err := dependencies.downloadModel(); err != nil {
		return err
	}

	ui.PrintBlank()
	ui.PrintHeader("Step 2 of 2 · " + displayBrowserName(browser) + " integration")
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
