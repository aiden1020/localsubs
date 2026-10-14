package main

import (
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"localsubs/internal/model"
	"localsubs/internal/runtime"
	"localsubs/internal/ui"
)

func modelDownload(args []string) error {
	flags := flag.NewFlagSet("model download", flag.ContinueOnError)
	channel := flags.String("channel", "", "official model channel to download (default: stable)")
	if err := flags.Parse(args); err != nil {
		return err
	}
	return modelDownloadChannel(*channel, true)
}

func modelDownloadChannel(channel string, showNextStep bool) error {
	m, err := loadManifest()
	if err != nil {
		return err
	}
	entry, ok := m.Entry(channel)
	if !ok {
		return fmt.Errorf("unknown model channel %q", channel)
	}
	if err := downloadModelEntry(entry, os.Stdout); err != nil {
		return err
	}
	destPath, err := managedModelPath(entry.Path)
	if err != nil {
		return err
	}
	if showNextStep {
		fmt.Println()
		fmt.Println(ui.OK("Model ready"))
		ui.PrintRow("File", ui.CompactPath(destPath))
		ui.PrintBlank()
		ui.PrintDetail("Next: localsubs install")
	}
	return nil
}

func downloadModelEntry(entry model.Entry, progress io.Writer) error {
	destPath, err := managedModelPath(entry.Path)
	if err != nil {
		return err
	}
	destDir := filepath.Dir(destPath)

	check := entry
	check.Path = destPath
	if s := checkManagedModel(check); modelStateReady(s.State) {
		if progress != nil {
			fmt.Fprintln(progress, ui.OK("Model already downloaded"))
			fmt.Fprintf(progress, "  File: %s\n", ui.CompactPath(destPath))
		}
		return nil
	}
	if strings.TrimSpace(entry.URL) == "" {
		return fmt.Errorf("model %q is not available for download", entry.Name)
	}

	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}

	if err := os.Remove(destPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	if progress != nil {
		fmt.Fprintf(progress, "  Downloading %s  %s\n",
			ui.Bold(entry.Path),
			ui.Dim("("+formatBytes(entry.SizeBytes)+")"),
		)
	}

	if err := downloadWithProgressTo(destPath, entry.URL, entry.SizeBytes, progress); err != nil {
		return err
	}
	if progress != nil {
		fmt.Fprintln(progress)
	}

	if entry.SHA256 != "" {
		if progress != nil {
			fmt.Fprint(progress, "  Verifying checksum...")
		}
		check.Path = destPath
		s := model.Check(check)
		if s.State != "verified" {
			_ = os.Remove(destPath)
			return fmt.Errorf(" checksum mismatch — file removed, please try again")
		}
		if progress != nil {
			fmt.Fprintln(progress, " "+ui.OK("ok"))
		}
	}
	return nil
}

func downloadWithProgress(destPath, url string, totalBytes int64) error {
	return downloadWithProgressTo(destPath, url, totalBytes, os.Stdout)
}

func downloadWithProgressTo(destPath, url string, totalBytes int64, writer io.Writer) error {
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
		writer:    writer,
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
	writer    io.Writer
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
	if p.writer == nil {
		return
	}
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
		fmt.Fprintf(p.writer, "\r  [%s] %5.1f%%  %s / %s%s",
			bar, pct*100,
			formatBytes(p.current),
			formatBytes(p.total),
			speed,
		)
	} else {
		fmt.Fprintf(p.writer, "\r  %s%s", formatBytes(p.current), speed)
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
