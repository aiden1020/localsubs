package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"localsubs/internal/config"
	"localsubs/internal/nativehost"
	"localsubs/internal/ui"
)

type uninstallReport struct {
	Integrations []nativehost.UninstallResult `json:"integrations"`
	DataPath     string                       `json:"dataPath"`
	DataPurged   bool                         `json:"dataPurged"`
}

func uninstallCommand(args []string) error {
	flags := flag.NewFlagSet("uninstall", flag.ContinueOnError)
	browser := flags.String("browser", "all", "browser to disconnect: chrome, chromium, edge, or all")
	homeDir := flags.String("home", "", "home directory override")
	purge := flags.Bool("purge", false, "also remove models, runtimes, logs, and settings")
	yes := flags.Bool("yes", false, "confirm destructive data removal with --purge")
	jsonMode := flags.Bool("json", false, "output raw JSON")
	if err := parseFlags(flags, args); err != nil {
		return err
	}
	browsers, err := uninstallBrowserList(*browser)
	if err != nil {
		return err
	}
	if *purge && !*yes {
		return fmt.Errorf("--purge permanently removes LocalSubs data; repeat with --yes")
	}
	if *purge && strings.ToLower(strings.TrimSpace(*browser)) != "all" {
		return fmt.Errorf("--purge requires --browser all")
	}

	report := uninstallReport{Integrations: make([]nativehost.UninstallResult, 0, len(browsers))}
	for _, browserName := range browsers {
		result, err := nativehost.UninstallManifest(nativehost.UninstallOptions{
			HomeDir: *homeDir, Browser: browserName,
		})
		if err != nil {
			return err
		}
		report.Integrations = append(report.Integrations, result)
	}
	report.DataPath = config.AppDataDir()
	if strings.TrimSpace(*homeDir) != "" {
		report.DataPath = config.AppDataDirForHome(*homeDir)
	}
	if *purge {
		if err := validatePurgePath(report.DataPath); err != nil {
			return err
		}
		if err := os.RemoveAll(report.DataPath); err != nil {
			return err
		}
		report.DataPurged = true
	}
	if *jsonMode {
		return json.NewEncoder(os.Stdout).Encode(report)
	}
	printUninstallReport(report)
	return nil
}

func uninstallBrowserList(value string) ([]string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "all":
		return []string{"chrome", "chromium", "edge"}, nil
	case "", "chrome", "google-chrome":
		return []string{"chrome"}, nil
	case "chromium":
		return []string{"chromium"}, nil
	case "edge", "microsoft-edge":
		return []string{"edge"}, nil
	default:
		return nil, fmt.Errorf("unsupported browser %q", value)
	}
}

func validatePurgePath(path string) error {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	cleaned := filepath.Clean(absolute)
	volumeRoot := filepath.Clean(filepath.VolumeName(cleaned) + string(os.PathSeparator))
	if cleaned == volumeRoot || filepath.Dir(cleaned) == cleaned || !strings.EqualFold(filepath.Base(cleaned), "LocalSubs") {
		return fmt.Errorf("refusing to purge unsafe data path %q", path)
	}
	return nil
}

func printUninstallReport(report uninstallReport) {
	fmt.Println(ui.OK("Browser integrations removed"))
	for _, result := range report.Integrations {
		state := "not installed"
		if result.RegistrationRemoved || result.ManifestRemoved || result.LauncherRemoved {
			state = "removed"
		}
		ui.PrintRow(displayBrowserName(result.Browser), state)
	}
	ui.PrintBlank()
	if report.DataPurged {
		ui.PrintRow("Data", ui.OK("removed"))
	} else {
		ui.PrintRow("Data", "preserved")
		ui.PrintHint(ui.CompactPath(report.DataPath))
	}
}
