# Defer interactive mechanic clarification

Phase 9 will preserve detected ambiguity and inferred assumptions but handle them through an `infer_or_fail` Clarification Strategy rather than pausing generation for creator questions. This avoids introducing pending-run and clarification UI work into the mechanic-generation proof while keeping ambiguity separate from creator-confirmed intent, so a future conversational flow can add `ask_when_material` and resumable Clarification Requests without redesigning the Mechanic Resolver.
