# Pass opaque object handles to generated mechanics

Generated Mechanic Extensions will receive named Mechanic Object Bindings as opaque handles, never Phaser objects or other raw engine references. Reads return immutable observations and mutations use admitted Mechanic Capability API operations; Sparkline also tracks and cleans up objects created from declared Mechanic-Owned Object Archetypes, preserving a general object model without surrendering the engine boundary.
