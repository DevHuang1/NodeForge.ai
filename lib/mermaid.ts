export const MERMAID_DETAILED = `flowchart LR
    %% NodeForge.ai — Agentic Code Review & Security Pipeline (detailed)
    classDef start fill:#DCEFE3,stroke:#2E8B57,stroke-width:2px,color:#123
    classDef node1 fill:#DCEFE3,stroke:#2E8B57,stroke-width:2px,color:#123
    classDef node2 fill:#DCE8FF,stroke:#2F6BFF,stroke-width:2px,color:#123
    classDef node3 fill:#E9E0F6,stroke:#7546C9,stroke-width:2px,color:#123
    classDef node4 fill:#F8EBCF,stroke:#C98A00,stroke-width:2px,color:#123
    classDef gate fill:#F6DFDF,stroke:#C43D3D,stroke-width:2px,color:#123
    classDef final fill:#DCEFEF,stroke:#208A91,stroke-width:2px,color:#123
    classDef rc fill:#F0F0F1,stroke:#71717A,stroke-width:2px,stroke-dasharray:6 4,color:#123

    R["Human Input: Raw task / bug description"]:::start

    subgraph N1["Node 1 — Human Input"]
        direction TB
        A1["Capture raw request exactly"]:::node1
        A2["Record known metadata only"]:::node1
        A3["List unresolved items"]:::node1
        A4["Raw Task Record"]:::node1
    end

    subgraph N2["Node 2 — Query Expansion"]
        direction TB
        B1["Define scope + input/output contracts"]:::node2
        B2["Assumptions + acceptance criteria"]:::node2
        B3["Edge cases + threat model"]:::node2
        B4["Explicit System Specification"]:::node2
    end

    subgraph N3["Node 3 — Execution & Verification"]
        direction TB
        C1["Generate minimal implementation"]:::node3
        C2["Build independent test matrix"]:::node3
        C3["Map tests to acceptance criteria"]:::node3
        C4["Code + Test Matrix"]:::node3
    end

    subgraph N4["Node 4 — Output Sanitization"]
        direction TB
        D1["Syntax + completeness check"]:::node4
        D2["Security + secret scan"]:::node4
        D3["Traceability + honesty check"]:::node4
        D4["Sanitized Response"]:::node4
    end

    G{"Pass quality gates?"}:::gate
    FIN["Final response: clean code + tests + review report"]:::final
    RC["Revision Controller"]:::rc

    R --> N1
    N1 --> N2
    N2 --> N3
    N3 --> N4
    N4 --> G
    G -- "Yes" --> FIN
    G -- "No" --> RC
    RC -. "missing requirements" .-> N2
    RC -. "code / test defects" .-> N3
    RC -. "security / formatting" .-> N4`;

export const MERMAID_SIMPLIFIED = `flowchart LR
    A[Raw request] --> B[Node 1: Human Input]
    B --> C[Node 2: Query Expansion]
    C --> D[Node 3: Execution & Verification]
    D --> E[Node 4: Output Sanitization]
    E --> F{Pass quality gates?}
    F -- Yes --> G[Final response]
    F -- No --> H[Revision loop: targeted feedback]
    H -.-> C
    H -.-> D
    H -.-> E`;