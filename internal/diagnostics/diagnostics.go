package diagnostics

import "time"

const SchemaVersion = 1

type Status string

const (
	StatusPass Status = "pass"
	StatusWarn Status = "warn"
	StatusFail Status = "fail"
	StatusSkip Status = "skip"
)

type Result struct {
	ID          string `json:"id"`
	Category    string `json:"category"`
	Status      Status `json:"status"`
	Label       string `json:"label"`
	Detail      string `json:"detail,omitempty"`
	Remediation string `json:"remediation,omitempty"`
	DurationMS  int64  `json:"durationMs"`
}

type Summary struct {
	Passed   int `json:"passed"`
	Warnings int `json:"warnings"`
	Failed   int `json:"failed"`
	Skipped  int `json:"skipped"`
}

type Report struct {
	SchemaVersion   int      `json:"schemaVersion"`
	Ready           bool     `json:"ready"`
	Deep            bool     `json:"deep"`
	APIVersion      string   `json:"apiVersion"`
	HelperVersion   string   `json:"helperVersion"`
	Browser         string   `json:"browser"`
	ExtensionID     string   `json:"extensionId"`
	Results         []Result `json:"results"`
	Summary         Summary  `json:"summary"`
	TotalDurationMS int64    `json:"totalDurationMs"`
}

func NewReport(apiVersion, helperVersion, browser, extensionID string) Report {
	return Report{
		SchemaVersion: SchemaVersion,
		Ready:         true,
		APIVersion:    apiVersion,
		HelperVersion: helperVersion,
		Browser:       browser,
		ExtensionID:   extensionID,
		Results:       make([]Result, 0),
	}
}

func (r *Report) Add(result Result) {
	r.Results = append(r.Results, result)
	r.TotalDurationMS += result.DurationMS
	switch result.Status {
	case StatusPass:
		r.Summary.Passed++
	case StatusWarn:
		r.Summary.Warnings++
	case StatusFail:
		r.Summary.Failed++
		r.Ready = false
	case StatusSkip:
		r.Summary.Skipped++
	}
}

func Measure(result Result, started time.Time) Result {
	result.DurationMS = time.Since(started).Milliseconds()
	return result
}
