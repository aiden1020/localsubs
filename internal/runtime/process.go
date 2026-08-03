package runtime

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"strconv"
	"time"
)

type LlamaServerCommand struct {
	Binary  string
	Model   string
	Host    string
	Port    int
	Profile Profile
}

func (c LlamaServerCommand) Args() []string {
	args := []string{
		"-m", c.Model,
		"--host", c.Host,
		"--port", strconv.Itoa(c.Port),
		"-ngl", strconv.Itoa(c.Profile.GPULayers),
		"-c", strconv.Itoa(c.Profile.LlamaContext),
		"--log-disable",
	}
	if c.Profile.CacheReuse != nil {
		args = append(args, "--cache-reuse", strconv.Itoa(*c.Profile.CacheReuse))
	}
	return args
}

type ManagedBackend struct {
	BaseURL string
	cmd     *exec.Cmd
	done    chan struct{}
	waitErr error
}

func AllocateLocalPort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

func StartManagedBackend(ctx context.Context, command LlamaServerCommand, readyTimeout time.Duration) (*ManagedBackend, error) {
	binary := command.Binary
	if binary == "" {
		binary = "llama-server"
	}
	resolvedBinary, err := resolveExecutable(binary)
	if err != nil {
		return nil, err
	}
	cmd := exec.CommandContext(ctx, resolvedBinary, command.Args()...)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	backend := &ManagedBackend{
		BaseURL: fmt.Sprintf("http://%s:%d", command.Host, command.Port),
		cmd:     cmd,
		done:    make(chan struct{}),
	}
	go func() {
		backend.waitErr = cmd.Wait()
		close(backend.done)
	}()
	if err := backend.waitReady(ctx, readyTimeout); err != nil {
		_ = backend.Stop()
		return nil, err
	}
	return backend, nil
}

func (b *ManagedBackend) Stop() error {
	if b == nil || b.cmd == nil || b.cmd.Process == nil {
		return nil
	}
	_ = b.cmd.Process.Kill() // ignore error: process may already be dead
	<-b.done                 // always reap to prevent orphaned children
	return b.waitErr
}

func (b *ManagedBackend) waitReady(ctx context.Context, timeout time.Duration) error {
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	deadline := time.Now().Add(timeout)
	client := http.Client{Timeout: time.Second}
	for time.Now().Before(deadline) {
		select {
		case <-b.done:
			if b.waitErr != nil {
				return fmt.Errorf("llama-server exited before becoming ready: %w", b.waitErr)
			}
			return fmt.Errorf("llama-server exited before becoming ready")
		default:
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, b.BaseURL+"/health", nil)
		if err != nil {
			return err
		}
		resp, err := client.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-b.done:
			if b.waitErr != nil {
				return fmt.Errorf("llama-server exited before becoming ready: %w", b.waitErr)
			}
			return fmt.Errorf("llama-server exited before becoming ready")
		case <-time.After(200 * time.Millisecond):
		}
	}
	return fmt.Errorf("llama-server did not become ready within %s", timeout)
}

func resolveExecutable(binary string) (string, error) {
	return platformResolveExecutable(binary)
}
