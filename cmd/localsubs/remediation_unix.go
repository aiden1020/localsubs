//go:build !windows

package main

func helperUpgradeCommand() string {
	return "brew upgrade localsubs && localsubs install"
}

func runtimeInstallCommand() string {
	return "brew install llama.cpp"
}
