# ARCA Publication Static Self-Containment Gate V1.1

The publication preview now checks the static relative dependency closure of included JavaScript/TypeScript modules.

If an included source file statically imports, exports from, requires, or dynamically imports a literal relative module that is not itself included by the publication boundary, preview generation fails closed with `public-static-dependency-missing`.

This is deliberately narrower and more truthful than the legacy V1.1 boolean assertion: it verifies static relative module closure. It does not claim to prove arbitrary runtime/dynamic dependency closure.
