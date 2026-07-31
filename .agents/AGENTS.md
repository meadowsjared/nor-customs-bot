# Coding Rules & Guidelines

- **No Type Assertions (`as` keyword)**: Never use the TypeScript `as` type assertion keyword when writing code. Always use proper generic type parameters (e.g., `db.prepare<ParamTypes, ReturnType>(...)`), type guards, or explicit typing instead of force-casting with `as`.
