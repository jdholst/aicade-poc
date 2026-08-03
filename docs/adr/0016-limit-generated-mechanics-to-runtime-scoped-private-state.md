# Limit generated mechanics to runtime-scoped private state

Phase 9 Generated Mechanic Extensions may retain only restricted, serializable Mechanic Runtime State that resets with the active round or scene and is destroyed on disposal. Shared health, score, objectives, and game lifecycle state remain under trusted owners reached through declared ports, while custom persistence and save-game mutation are deferred to a future explicit contract rather than exposed through storage access or hidden mechanic state.
