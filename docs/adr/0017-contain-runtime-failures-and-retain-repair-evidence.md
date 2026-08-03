# Contain runtime failures and retain repair evidence

Sparkline will catch generated-mechanic exceptions and budget violations at its controlled callback boundary, stop and clean up the offending mechanic, retain structured Runtime Failure Evidence, and invalidate the affected playable result without crashing the surrounding editor. Validation-time failures may enter the current bounded Artifact-Scoped Repair flow; failures discovered after acceptance require a later GenerationRun and a newly validated extension version, never live patching or silent mutation of an accepted artifact.
