package diagnostics

import "testing"

func TestReportSummaryAndReadiness(t *testing.T) {
	report := NewReport("1", "test", "chrome", "extension")
	report.Add(Result{ID: "ok", Status: StatusPass})
	report.Add(Result{ID: "warning", Status: StatusWarn})
	report.Add(Result{ID: "skipped", Status: StatusSkip})
	if !report.Ready {
		t.Fatal("warnings and skips must not make a report unready")
	}
	report.Add(Result{ID: "failed", Status: StatusFail})
	if report.Ready {
		t.Fatal("a failed required check must make a report unready")
	}
	if report.Summary.Passed != 1 || report.Summary.Warnings != 1 ||
		report.Summary.Failed != 1 || report.Summary.Skipped != 1 {
		t.Fatalf("unexpected summary: %#v", report.Summary)
	}
}
