package ui

import (
	"fmt"
	"os"

	"github.com/charmbracelet/lipgloss"
)

const (
	IconOK   = "✓"
	IconFail = "✗"
	IconWarn = "⚠"

	labelWidth = 10
)

var (
	styleOK    = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
	styleFail  = lipgloss.NewStyle().Foreground(lipgloss.Color("9"))
	styleWarn  = lipgloss.NewStyle().Foreground(lipgloss.Color("11"))
	styleLabel = lipgloss.NewStyle().Foreground(lipgloss.Color("12")).Width(labelWidth)
	styleDim   = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	styleBold  = lipgloss.NewStyle().Bold(true)
	styleErr   = lipgloss.NewStyle().Foreground(lipgloss.Color("9")).Bold(true)
)

// PrintHeader prints a bold section title.
func PrintHeader(title string) {
	fmt.Println(styleBold.Render(title))
}

// PrintRow prints a fixed-width label and a value on one line.
func PrintRow(label, value string) {
	fmt.Printf("  %s  %s\n", styleLabel.Render(label), value)
}

// PrintCheck prints a ✓/✗ icon, a label, and an optional detail.
func PrintCheck(ok bool, label, detail string) {
	icon := styleOK.Render(IconOK)
	if !ok {
		icon = styleFail.Render(IconFail)
	}
	if detail != "" {
		fmt.Printf("  %s  %-16s  %s\n", icon, label, detail)
	} else {
		fmt.Printf("  %s  %s\n", icon, label)
	}
}

// PrintWarn prints a ⚠ icon, a label, and an optional detail.
func PrintWarn(label, detail string) {
	icon := styleWarn.Render(IconWarn)
	if detail != "" {
		fmt.Printf("  %s  %-16s  %s\n", icon, label, detail)
	} else {
		fmt.Printf("  %s  %s\n", icon, label)
	}
}

// PrintHint prints a dimmed hint line indented under a check.
func PrintHint(hint string) {
	fmt.Printf("              %s\n", styleDim.Render(hint))
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
