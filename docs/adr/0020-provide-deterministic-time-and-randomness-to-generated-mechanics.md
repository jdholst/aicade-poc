# Provide deterministic time and randomness to generated mechanics

Generated Mechanic Extensions will use Sparkline-owned simulation time, scheduling, and seeded pseudo-random capabilities instead of ambient JavaScript clocks, timers, or entropy. These capabilities are granted only when required and allow the deterministic harness to replay mechanic decisions from recorded seeds and clock progression; normal browser play still uses the trusted game loop and retains separate first-playable integration validation.
