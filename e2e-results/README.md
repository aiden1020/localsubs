# Windows browser Native Messaging E2E

Measured on 2026-08-04 with the LocalSubs 0.4.0 release candidate, Windows x64,
Edge 151, Chrome for Testing 151, the verified LocalSubs Q5_K_M model, and an
NVIDIA GeForce RTX 3080.

The test loads the unpacked extension in an isolated browser profile, waits for
the settings UI to become ready, performs a warmup and translation through
`chrome.runtime.connectNative()`, verifies the reported backend, closes the
browser, and confirms that the test helper and llama-server processes exit.

| Browser | Requested path | Actual backend | Translation | Cleanup |
| --- | --- | --- | --- | --- |
| Microsoft Edge | CPU | `llama.cpp-cpu` | Passed | Passed |
| Microsoft Edge | CUDA | `llama.cpp-cuda` | Passed | Passed |
| Microsoft Edge | Auto with simulated CUDA startup failure | `llama.cpp-cpu` | Passed | Passed |
| Chrome for Testing | Auto | `llama.cpp-cuda` | Passed | Passed |

Run from Windows PowerShell:

```powershell
npm run test:e2e:windows -- --browser edge --backend cpu
npm run test:e2e:windows -- --browser edge --backend cuda
npm run test:e2e:windows -- --browser edge --backend auto --expect-backend cpu --simulate-cuda-failure
npm run test:e2e:windows -- --browser chrome --executable C:\path\to\chrome.exe --backend auto
```

CI uses `--fake-backend` so it can verify the browser and Native Messaging path
without downloading the model or managed llama.cpp runtimes.
