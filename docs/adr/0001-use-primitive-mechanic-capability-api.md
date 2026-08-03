# Use a primitive Mechanic Capability API

Sparkline will expose Generated Mechanic Extensions to a reusable primitive Mechanic Capability API rather than named, mechanic-shaped services such as projectile or target helpers. This creates a broader and more security-sensitive contract to design, but it allows AI-generated mechanics to compose genuinely new behavior without requiring Sparkline to hand-author the important parts of each mechanic first; raw Phaser, DOM, storage, network, and arbitrary global access remain outside the boundary.
