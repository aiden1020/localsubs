package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"localsubs/internal/config"
	"localsubs/internal/model"
	"localsubs/internal/runtime"
	"localsubs/internal/ui"
)

func modelDownload() error {
	return modelDownloadWithNextStep(true)
}

func modelDownloadWithNextStep(showNextStep bool) error {
	m, err := loadManifest()
	if err != nil {
		return err
	}
	entry, ok := m.Entry("")
	if !ok {
		return fmt.Errorf("model manifest has no default channel")
	}
	if entry.URL == "" {
		return fmt.Errorf("no download URL configured in manifest")
	}

	destDir := filepath.Join(config.AppDataDir(), "models")
	destPath := filepath.Join(destDir, entry.Path)

	// Check if already present and valid.
	check := entry
	check.Path = destPath
	if s := model.Check(check); modelStateReady(s.State) {
		fmt.Println(ui.OK("Model already downloaded"))
		ui.PrintRow("File", ui.CompactPath(destPath))
		if showNextStep {
			ui.PrintBlank()
			ui.PrintDetail("Next: localsubs install")
		}
		return nil
	}

	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}

	fmt.Printf("  Downloading %s  %s\n",
		ui.Bold(entry.Path),
		ui.Dim("("+formatBytes(entry.SizeBytes)+")"),
	)

	if err := downloadWithProgress(destPath, entry.URL, entry.SizeBytes); err != nil {
		return err
	}
	fmt.Println()

	if entry.SHA256 != "" {
		fmt.Print("  Verifying checksum...")
		check.Path = destPath
		s := model.Check(check)
		if s.State != "verified" {
			_ = os.Remove(destPath)
			return fmt.Errorf(" checksum mismatch — file removed, please try again")
		}
		fmt.Println(" " + ui.OK("ok"))
	}

	fmt.Println()
	fmt.Println(ui.OK("Model ready"))
	ui.PrintRow("File", ui.CompactPath(destPath))
	if showNextStep {
		ui.PrintBlank()
		ui.PrintDetail("Next: localsubs install")
	}
	return nil
}

func downloadWithProgress(destPath, url string, totalBytes int64) error {
	partPath := destPath + ".part"

	// Check for resumable partial download.
	var startByte int64
	if fi, err := os.Stat(partPath); err == nil {
		startByte = fi.Size()
		if totalBytes > 0 && startByte >= totalBytes {
			return os.Rename(partPath, destPath)
		}
	}

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "localsubs/"+runtime.HelperVersion)
	if startByte > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", startByte))
	}

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		startByte = 0 // server doesn't support Range, start over
	case http.StatusPartialContent:
		// resume confirmed
	default:
		return fmt.Errorf("server returned HTTP %d", resp.StatusCode)
	}

	flags := os.O_CREATE | os.O_WRONLY
	if startByte > 0 {
		flags |= os.O_APPEND
	} else {
		flags |= os.O_TRUNC
	}
	f, err := os.OpenFile(partPath, flags, 0o644)
	if err != nil {
		return err
	}

	pr := &progressReader{
		r:         resp.Body,
		total:     totalBytes,
		current:   startByte,
		startedAt: time.Now(),
	}
	_, copyErr := io.Copy(f, pr)
	closeErr := f.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(partPath, destPath)
}

type progressReader struct {
	r         io.Reader
	total     int64
	current   int64
	startedAt time.Time
	lastPrint time.Time
}

func (p *progressReader) Read(buf []byte) (int, error) {
	n, err := p.r.Read(buf)
	p.current += int64(n)
	now := time.Now()
	if now.Sub(p.lastPrint) >= 150*time.Millisecond || (err != nil && p.current > 0) {
		p.lastPrint = now
		p.render()
	}
	return n, err
}

func (p *progressReader) render() {
	const barWidth = 26
	var pct float64
	if p.total > 0 {
		pct = float64(p.current) / float64(p.total)
		if pct > 1 {
			pct = 1
		}
	}
	filled := int(float64(barWidth) * pct)
	bar := strings.Repeat("█", filled) + strings.Repeat("░", barWidth-filled)

	speed := ""
	if elapsed := time.Since(p.startedAt).Seconds(); elapsed > 0.5 {
		mbps := float64(p.current) / elapsed / 1024 / 1024
		speed = fmt.Sprintf("  %.1f MB/s", mbps)
	}

	if p.total > 0 {
		fmt.Printf("\r  [%s] %5.1f%%  %s / %s%s",
			bar, pct*100,
			formatBytes(p.current),
			formatBytes(p.total),
			speed,
		)
	} else {
		fmt.Printf("\r  %s%s", formatBytes(p.current), speed)
	}
}

func formatBytes(b int64) string {
	switch {
	case b >= 1024*1024*1024:
		return fmt.Sprintf("%.1f GB", float64(b)/1024/1024/1024)
	case b >= 1024*1024:
		return fmt.Sprintf("%.0f MB", float64(b)/1024/1024)
	default:
		return fmt.Sprintf("%d KB", b/1024)
	}
}
