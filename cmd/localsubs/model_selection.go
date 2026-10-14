package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"localsubs/internal/config"
	"localsubs/internal/model"
)

const defaultModelChannel = "stable"

type modelSelection struct {
	Channel string `json:"channel"`
}

func modelSelectionPath() string {
	return filepath.Join(config.AppDataDir(), "model-selection.json")
}

func selectedModelChannel(manifest model.Manifest) string {
	data, err := os.ReadFile(modelSelectionPath())
	if err == nil {
		var selection modelSelection
		if json.Unmarshal(data, &selection) == nil {
			if _, ok := manifest.Entry(selection.Channel); ok {
				return selection.Channel
			}
		}
	}
	return defaultModelChannel
}

func saveModelChannel(manifest model.Manifest, channel string) (bool, error) {
	channel = strings.TrimSpace(channel)
	if _, ok := manifest.Entry(channel); !ok {
		return false, fmt.Errorf("unknown model channel %q", channel)
	}
	current := selectedModelChannel(manifest)
	if err := os.MkdirAll(config.AppDataDir(), 0o755); err != nil {
		return false, err
	}
	data, err := json.Marshal(modelSelection{Channel: channel})
	if err != nil {
		return false, err
	}
	path := modelSelectionPath()
	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, data, 0o600); err != nil {
		return false, err
	}
	if err := os.Rename(tempPath, path); err != nil {
		_ = os.Remove(tempPath)
		return false, err
	}
	return current != channel, nil
}
