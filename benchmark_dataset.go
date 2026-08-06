package localsubs

import _ "embed"

//go:embed mini_test_set.jsonl
var miniBenchmarkDataset []byte

// MiniBenchmarkDataset returns a copy of the benchmark workload bundled with
// every LocalSubs binary.
func MiniBenchmarkDataset() []byte {
	return append([]byte(nil), miniBenchmarkDataset...)
}
