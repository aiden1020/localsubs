package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
)

type Manifest struct {
	SchemaVersion  int     `json:"schemaVersion"`
	DefaultChannel string  `json:"defaultChannel"`
	Models         []Entry `json:"models"`
}

type Entry struct {
	Channel     string  `json:"channel"`
	ID          string  `json:"id"`
	Version     string  `json:"version"`
	Runtime     string  `json:"runtime"`
	Path        string  `json:"path"`
	SizeBytes   int64   `json:"sizeBytes"`
	Description string  `json:"description"`
	Profile     Profile `json:"profile"`
	URL         string  `json:"url"`
	SHA256      string  `json:"sha256"`
}

type Profile struct {
	NPredict    int  `json:"nPredict"`
	CTXSize     int  `json:"ctxSize"`
	CachePrompt bool `json:"cachePrompt"`
	CacheReuse  int  `json:"cacheReuse"`
}

type Status struct {
	ID      string `json:"id"`
	Version string `json:"version"`
	Path    string `json:"path"`
	State   string `json:"state"`
	Reason  string `json:"reason"`
}

func LoadManifest(path string) (Manifest, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return Manifest{}, err
	}
	return ParseManifest(body)
}

func ParseManifest(data []byte) (Manifest, error) {
	var manifest Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return Manifest{}, err
	}
	if manifest.SchemaVersion == 0 {
		return Manifest{}, errors.New("missing schemaVersion")
	}
	return manifest, nil
}

func (m Manifest) Entry(channel string) (Entry, bool) {
	if channel == "" {
		channel = m.DefaultChannel
	}
	for _, entry := range m.Models {
		if entry.Channel == channel {
			return entry, true
		}
	}
	return Entry{}, false
}

func Check(entry Entry) Status {
	status := Status{ID: entry.ID, Version: entry.Version, Path: entry.Path}
	corrupt := func(reason string) Status {
		status.State = "corrupt"
		status.Reason = reason
		return status
	}

	info, err := os.Stat(entry.Path)
	if err != nil {
		if os.IsNotExist(err) {
			status.State = "missing"
			status.Reason = "model file does not exist"
			return status
		}
		status.State = "incompatible"
		status.Reason = err.Error()
		return status
	}
	if entry.SizeBytes > 0 && info.Size() != entry.SizeBytes {
		return corrupt("model file size does not match manifest")
	}
	if entry.SHA256 != "" {
		sum, err := sha256File(entry.Path)
		if err != nil {
			return corrupt(err.Error())
		}
		if sum != entry.SHA256 {
			return corrupt("model checksum does not match manifest")
		}
		status.State = "verified"
		status.Reason = "checksum verified"
		return status
	}
	status.State = "ready"
	status.Reason = "file exists and size matches; checksum unavailable in development manifest"
	return status
}

func sha256File(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
