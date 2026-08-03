//go:build windows

package main

func helperUpgradeCommand() string {
	return "reinstall LocalSubs, then run: localsubs install"
}

func runtimeInstallCommand() string {
	return "localsubs runtime download --backend cpu"
}
