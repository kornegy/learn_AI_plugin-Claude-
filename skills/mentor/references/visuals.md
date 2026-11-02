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

## Recursion tree (fib)

```
 fib(4)
 ├─ fib(3)
 │  ├─ fib(2) ─ fib(1), fib(0)
 │  └─ fib(1)
 └─ fib(2) ─ fib(1), fib(0)      ← fib(2) computed twice: why memoisation helps
```

## Hash table

```
 key "cat" ─hash→ 2
 [0] ·
 [1] "dog" → "bat"          ← collision chain
 [2] "cat"
 [3] ·
```

## Growth (big-O)

```
 n      log n   n     n log n   n²
 10     3       10    33        100
 1000   10      1000  9966      1 000 000
```

## TCP handshake

```
 client ── SYN ──────────▶ server
 client ◀────── SYN-ACK ── server
 client ── ACK ──────────▶ server   connection open
```

## Git history

```
 A ── B ── C        main
       \
        D ── E      feature   (merge: A─B─C─M, M has parents C and E)
```

## Progress map

`mentor_progress` returns a ready map (level bars, ▶ current stage, ↻ due, ⚠ misconception). Show it
as-is in a code block; don't redraw it.
