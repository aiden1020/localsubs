package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"localsubs/internal/config"
	"localsubs/internal/model"
	"localsubs/internal/nativehost"
)

type modelManager struct {
	mu       sync.Mutex
	manifest model.Manifest
}

func newModelManager(manifest model.Manifest) *modelManager {
	return &modelManager{manifest: manifest}
}

func managedModelPath(filename string) (string, error) {
	if filename == "" || filepath.IsAbs(filename) || filepath.Base(filename) != filename || filename == "." || filename == ".." {
		return "", fmt.Errorf("invalid model path in catalog")
	}
	return filepath.Join(config.AppDataDir(), "models", filename), nil
}

func checkManagedModel(entry model.Entry) model.Status {
	status := model.Status{ID: entry.ID, Version: entry.Version, Path: entry.Path}
	info, err := os.Lstat(entry.Path)
	if err != nil {
		return model.Check(entry)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		status.State = "corrupt"
		status.Reason = "model path must be a regular file managed by LocalSubs"
		return status
	}
	return model.Check(entry)
}

func (m *modelManager) list() ([]nativehost.ModelInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	selected := selectedModelChannel(m.manifest)
	models := make([]nativehost.ModelInfo, 0, len(m.manifest.Models))
	for _, entry := range m.manifest.Models {
		path, err := managedModelPath(entry.Path)
		if err != nil {
			return nil, err
		}
		info := nativehost.ModelInfo{
			Channel:      entry.Channel,
			Name:         entry.Name,
			ID:           entry.ID,
			Version:      entry.Version,
			SizeBytes:    entry.SizeBytes,
			Description:  entry.Description,
			Selected:     entry.Channel == selected,
			Downloadable: strings.TrimSpace(entry.URL) != "",
			State:        "missing",
		}
		stat, statErr := os.Lstat(path)
		if statErr == nil {
			info.State = "downloaded"
			if stat.Mode()&os.ModeSymlink != 0 || !stat.Mode().IsRegular() || entry.SizeBytes > 0 && stat.Size() != entry.SizeBytes {
				info.State = "corrupt"
			}
			info.CanRemove = entry.Channel != selected || info.State != "downloaded"
		} else if !os.IsNotExist(statErr) {
			return nil, statErr
		} else if _, partErr := os.Stat(path + ".part"); partErr == nil {
			info.State = "partial"
			info.CanRemove = true
		} else if !os.IsNotExist(partErr) {
			return nil, partErr
		}
		models = append(models, info)
	}
	return models, nil
}

func (m *modelManager) selectModel(channel string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry, ok := m.manifest.Entry(strings.TrimSpace(channel))
	if !ok {
		return false, fmt.Errorf("unknown model channel %q", channel)
	}
	path, err := managedModelPath(entry.Path)
	if err != nil {
		return false, err
	}
	entry.Path = path
	if status := checkManagedModel(entry); status.State != "verified" && status.State != "ready" {
		return false, fmt.Errorf("model %q is not downloaded and verified", entry.Name)
	}
	return saveModelChannel(m.manifest, channel)
}

func (m *modelManager) downloadModel(channel string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry, ok := m.manifest.Entry(strings.TrimSpace(channel))
	if !ok {
		return false, fmt.Errorf("unknown model channel %q", channel)
	}
	selected := selectedModelChannel(m.manifest) == entry.Channel
	if err := downloadModelEntry(entry, nil); err != nil {
		return false, err
	}
	return selected, nil
}

func (m *modelManager) removeModel(channel string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry, ok := m.manifest.Entry(strings.TrimSpace(channel))
	if !ok {
		return fmt.Errorf("unknown model channel %q", channel)
	}
	path, err := managedModelPath(entry.Path)
	if err != nil {
		return err
	}
	selected := selectedModelChannel(m.manifest) == entry.Channel
	if selected {
		if status := checkManagedModel(model.Entry{Path: path, SizeBytes: entry.SizeBytes, SHA256: entry.SHA256}); status.State == "verified" || status.State == "ready" {
			return fmt.Errorf("switch to another downloaded model before removing the active model")
		}
	}
	for _, target := range []string{path, path + ".part"} {
		if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}
