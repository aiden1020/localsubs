<br />
<div align="center">
  <a href="https://github.com/aiden1020/localsubs">
    <img src="icons/logo.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">LocalSubs</h3>

  <p align="center">
Real-time, fully local AI subtitle translation for streaming video.
Translates English subtitles to Traditional Chinese on-device using a fine-tuned 0.6B model — no data leaves your machine.

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

localsubs model download   # ~424 MB, one-time
localsubs install           # connect to Chrome
```

> `brew trust` is required because LocalSubs is distributed via a third-party tap.
> It authorizes Homebrew to install formulas from this tap on your machine.

Then install the [LocalSubs Chrome extension](#) and start watching.

## Commands

| Command | Description |
|---------|-------------|
| `localsubs model download` | Download the translation model |
| `localsubs install` | Connect to Chrome |
| `localsubs status` | Check if the helper is running |
| `localsubs doctor` | Run a full diagnostic |
| `localsubs logs` | Print log file paths |
| `localsubs version` | Print version |

## Model

Uses [SubtitleEN2TW-0.6B](https://huggingface.co/Aiden1020/SubtitleEN2TW-0.6B), a fine-tuned GGUF model optimized for subtitle-length English → Traditional Chinese translation.

## License

Apache 2.0 — see [LICENSE](./LICENSE).
