package ui

import (
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

const (
	IconOK   = "✓"
	IconFail = "✗"
	IconWarn = "⚠"
	IconSkip = "○"

	labelWidth          = 10
	maxInlineValueWidth = 64
)

var (
	styleOK        = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
	styleFail      = lipgloss.NewStyle().Foreground(lipgloss.Color("9"))
	styleWarn      = lipgloss.NewStyle().Foreground(lipgloss.Color("11"))
	styleLabel     = lipgloss.NewStyle().Foreground(lipgloss.Color("12")).Width(labelWidth)
	styleLabelText = lipgloss.NewStyle().Foreground(lipgloss.Color("12"))
	styleDim       = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	styleBold      = lipgloss.NewStyle().Bold(true)
	styleErr       = lipgloss.NewStyle().Foreground(lipgloss.Color("9")).Bold(true)
)

// PrintHeader prints a bold section title.
func PrintHeader(title string) {
	fmt.Println(styleBold.Render(title))
}

// PrintRow prints a fixed-width label and a value on one line.
func PrintRow(label, value string) {
	if lipgloss.Width(value) > maxInlineValueWidth {
		fmt.Printf("  %s\n", styleLabelText.Render(label))
		PrintHint(value)
		return
	}
	fmt.Printf("  %s  %s\n", styleLabel.Render(label), value)
}

// PrintCheck prints a ✓/✗ icon, a label, and an optional detail.
func PrintCheck(ok bool, label, detail string) {
	icon := styleOK.Render(IconOK)
	if !ok {
		icon = styleFail.Render(IconFail)
	}
	printCheckLine(icon, label, detail)
}

// PrintWarn prints a ⚠ icon, a label, and an optional detail.
func PrintWarn(label, detail string) {
	printCheckLine(styleWarn.Render(IconWarn), label, detail)
}

// PrintSkip prints a neutral icon for a check that was not run.
func PrintSkip(label, detail string) {
	printCheckLine(styleDim.Render(IconSkip), label, detail)
}

func printCheckLine(icon, label, detail string) {
	if detail == "" {
		fmt.Printf("  %s  %s\n", icon, label)
		return
	}
	if lipgloss.Width(detail) > maxInlineValueWidth {
		fmt.Printf("  %s  %s\n", icon, label)
		PrintDetail(detail)
		return
	}
	fmt.Printf("  %s  %-16s  %s\n", icon, label, detail)
}

// PrintHint prints a dimmed hint line indented under a check.
func PrintHint(hint string) {
	fmt.Printf("              %s\n", styleDim.Render(hint))
}

// PrintDetail prints supporting information below a check or result.
func PrintDetail(detail string) {
	fmt.Printf("     %s\n", styleDim.Render(detail))
}

// PrintBlank prints an empty line.
func PrintBlank() { fmt.Println() }

// PrintError writes a red "Error: ..." message to stderr.
func PrintError(err error) {
	fmt.Fprintln(os.Stderr, styleErr.Render("Error:")+" "+err.Error())
}

// OK returns a green ✓ label string.
func OK(s string) string { return styleOK.Render(IconOK + " " + s) }

// Fail returns a red ✗ label string.
func Fail(s string) string { return styleFail.Render(IconFail + " " + s) }

// Warn returns a yellow ⚠ label string.
func Warn(s string) string { return styleWarn.Render(IconWarn + " " + s) }

// Dim returns a dimmed string.
func Dim(s string) string { return styleDim.Render(s) }

// Bold returns a bold string.
func Bold(s string) string { return styleBold.Render(s) }

// CompactPath replaces the current user's home directory with ~ for human output.
func CompactPath(value string) string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return value
	}
	if value == home {
		return "~"
	}
	prefix := home + string(os.PathSeparator)
	if strings.HasPrefix(value, prefix) {
		return "~/" + strings.TrimPrefix(value, prefix)
	}
	return value
}
