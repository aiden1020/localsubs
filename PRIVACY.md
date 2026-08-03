# Privacy

LocalSubs performs subtitle translation on the user's device. Subtitle text is
sent from the browser extension to the LocalSubs native helper and local
llama.cpp process; it is not sent to the LocalSubs developer or a hosted
translation service.

LocalSubs does not include telemetry, analytics, advertising, or crash-report
uploading. Logs remain in the LocalSubs application data directory unless the
user chooses to share them.

Network access is used during installation or explicit downloads to retrieve
release artifacts from GitHub and the model from Hugging Face. The browser may
also make its normal requests to the streaming service and extension store.

To remove browser registrations while retaining downloaded data, run
`localsubs uninstall`. To remove registrations, settings, logs, runtimes, and
models, run `localsubs uninstall --purge --yes` before uninstalling the package.
