<br />
<div align="center">
  <a href="https://github.com/aiden1020/localsubs">
    <img src="icons/logo.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">LocalSubs</h3>

  <p align="center">
Real-time, fully local AI subtitle translation for streaming video.
Translates English subtitles to Traditional Chinese on-device using the LocalSubs 0.6B model — no data leaves your machine.

<br />

<a href="https://arxiv.org/abs/2607.09957">
  <img src="https://img.shields.io/badge/arXiv-2607.09957-b31b1b.svg" alt="arXiv:2607.09957">
</a>
<a href="https://huggingface.co/Aiden1020/LocalSubs-EN-ZH-TW-0.6B">
  <img src="https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Model-FFD21E.svg" alt="Hugging Face model">
</a>
<a href="https://huggingface.co/spaces/Aiden1020/localsubs-en-zh-tw-translation">
  <img src="https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Demo-FFD21E.svg" alt="Interactive Hugging Face demo">
</a>

<br />
    
  </p>
</div>

https://github.com/user-attachments/assets/5bf883fb-ed50-43f2-a052-47e8f2c9c415

## Requirements

- macOS (Apple Silicon or Intel)
- Chrome / Chromium

## Installation

```bash
brew tap aiden1020/localsubs
brew trust aiden1020/localsubs
brew install localsubs

localsubs setup            # download the model and install Chrome integration
```

> `brew trust` is required because LocalSubs is distributed via a third-party tap.
> It authorizes Homebrew to install formulas from this tap on your machine.

Then install the [LocalSubs Chrome extension](https://chromewebstore.google.com/detail/localsubs：hbo-max-即時、完全本地/dpacileladlkfgdjbdjdjhgnepicejjb) and start watching.

## Commands

| Command | Description |
|---------|-------------|
| `localsubs setup` | Download the model and install the browser integration |
| `localsubs model download` | Download the translation model |
| `localsubs install` | Install the Chrome Native Messaging integration |
| `localsubs status` | Check the integration, installed helper, runtime, and model |
| `localsubs doctor` | Diagnose the manifest, launcher, helper, runtime, and model |
| `localsubs logs` | Print log file paths |
| `localsubs version` | Print version |

The native helper starts on demand when Chrome connects to it; it is not a
persistent background service. Use `localsubs status` to validate the installed
helper, runtime, and model, or `localsubs doctor` for detailed diagnostics and
suggested fixes. Both commands support `--json` for scripts and bug reports.
`localsubs doctor` exits with a nonzero status when a required component fails.
Use `localsubs doctor --deep` to temporarily start `llama-server`, load the
installed model, and run a test inference. The deep check can take up to 90
seconds and always stops the temporary process before exiting.

To configure Chromium or Microsoft Edge instead of Chrome, run
`localsubs setup --browser chromium` or `localsubs setup --browser edge`.

## Model

LocalSubs uses [LocalSubs-EN-ZH-TW-0.6B](https://huggingface.co/Aiden1020/LocalSubs-EN-ZH-TW-0.6B), a fine-tuned model optimized for subtitle-length English → Traditional Chinese translation.

The helper downloads the default GGUF runtime artifact:

```text
LocalSubs-EN-ZH-TW-0.6B-Q5_K_M.gguf
```

If you previously installed an older model, upgrade the helper, download the current LocalSubs model, and refresh the Native Messaging registration:

```bash
brew update
brew upgrade localsubs
localsubs model download
localsubs install
```

The previous GGUF file is not removed automatically. After verifying that the new model works, you may delete the old model from `~/Library/Application Support/LocalSubs/models/`.

## Technical Report

The model design, subtitle-domain tokenizer, training procedure, and evaluation are described in [*Workload-Driven Optimization for On-Device Real-Time Subtitle Translation*](https://arxiv.org/abs/2607.09957).

If you use LocalSubs in research, please cite:

```bibtex
@misc{wong2026localsubs,
  title         = {Workload-Driven Optimization for On-Device Real-Time Subtitle Translation},
  author        = {Tsz-To Wong},
  year          = {2026},
  eprint        = {2607.09957},
  archivePrefix = {arXiv},
  primaryClass  = {cs.CL},
  doi           = {10.48550/arXiv.2607.09957},
  url           = {https://arxiv.org/abs/2607.09957}
}
```

## License

Apache 2.0 — see [LICENSE](./LICENSE).
