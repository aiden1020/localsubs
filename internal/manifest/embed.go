package manifest

import _ "embed"

// Data is the compiled-in model manifest. It is the source of truth for model
// metadata and does not require model_manifest.json to exist on disk at runtime.
//
//go:embed model_manifest.json
var Data []byte
