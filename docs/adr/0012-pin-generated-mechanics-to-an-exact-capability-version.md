# Pin generated mechanics to an exact capability version

Every Generated Mechanic Extension will pin the exact Mechanic Capability Version against which it was generated and validated, so runtime changes cannot silently reinterpret accepted behavior. Moving an extension to a newer capability contract is an explicit migration that creates a new extension version and repeats all acceptance gates; Phase 9 only needs one supported capability version while preserving this artifact boundary.
