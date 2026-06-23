package runtime

import "testing"

func TestLlamaServerCommandArgsOmitNilCacheReuse(t *testing.T) {
	cmd := LlamaServerCommand{
		Model:   "model.gguf",
		Host:    "127.0.0.1",
		Port:    8766,
		Profile: DefaultProfile(),
	}
	args := cmd.Args()
	for _, arg := range args {
		if arg == "--cache-reuse" {
			t.Fatal("nil cache reuse should omit --cache-reuse")
		}
	}
}

func TestLlamaServerCommandArgsIncludeCacheReuseWhenSet(t *testing.T) {
	reuse := 4
	profile := DefaultProfile()
	profile.CacheReuse = &reuse
	cmd := LlamaServerCommand{
		Model:   "model.gguf",
		Host:    "127.0.0.1",
		Port:    8766,
		Profile: profile,
	}
	args := cmd.Args()
	found := false
	for i := 0; i < len(args)-1; i++ {
		if args[i] == "--cache-reuse" && args[i+1] == "4" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected cache reuse args in %#v", args)
	}
}
