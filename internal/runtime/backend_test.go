package runtime

import "testing"

func TestParseBackendMode(t *testing.T) {
	for input, want := range map[string]BackendMode{
		"": BackendAuto, "AUTO": BackendAuto, "cpu": BackendCPU, "cuda": BackendCUDA,
	} {
		got, err := ParseBackendMode(input)
		if err != nil || got != want {
			t.Fatalf("ParseBackendMode(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
	if _, err := ParseBackendMode("metal"); err == nil {
		t.Fatal("unsupported backend must fail")
	}
}

func TestRuntimeBundleHasPinnedChecksums(t *testing.T) {
	for _, mode := range []BackendMode{BackendCPU, BackendCUDA} {
		bundle, err := RuntimeBundleForBackend(mode)
		if err != nil {
			continue
		}
		if bundle.Version == "" || len(bundle.Assets) == 0 {
			t.Fatalf("incomplete %s runtime bundle: %#v", mode, bundle)
		}
		for _, asset := range bundle.Assets {
			if asset.URL == "" || len(asset.SHA256) != 64 || asset.SizeBytes <= 0 {
				t.Fatalf("incomplete runtime asset: %#v", asset)
			}
		}
	}
}
