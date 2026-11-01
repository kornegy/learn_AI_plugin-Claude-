# Visual patterns

Use a visual only when structure or flow is the point. At most one per message, ≤ 15 lines,
monospace-friendly. Always follow with one question about the picture.

## Memory: variables and pointers

```
 name   address   value
 x      0x1000    5
 p      0x1008    0x1000 ──┐
                  ▲        │
                  └────────┘  *p reads/writes x
```

## Stack frames

```
 main()        │ x = 5          │
 increment(&x) │ p = &x (0x1000)│  ← top of stack
```

## Process tree (fork)

```
 shell (pid 100)
   └─ fork() → child (pid 101)   both continue after fork();
                                 fork() returns 101 to parent, 0 to child
```

## Sequence (threads + mutex)

```
 T1: lock ──── write ──── unlock
 T2:      wait ─────────────────── lock ── write ── unlock
```

## Table comparison

```
 | INNER JOIN       | LEFT JOIN                         |
 |------------------|-----------------------------------|
 | only matches     | all left rows, NULL when no match |
```

## Step trace

```
 step  i  sum
 0     0  0
 1     1  1
 2     2  3
```
