---
schema: 1
kind: subject_path
subject: cpp
goal: Самостоятельно писать и отлаживать небольшие системные программы
created: 2026-10-01
updated: 2026-10-01
topics:
  - id: cpp/variables
    prerequisites: []
  - id: cpp/memory-basics
    prerequisites:
      - cpp/variables
  - id: cpp/pointers
    prerequisites:
      - cpp/variables
      - cpp/memory-basics
  - id: cpp/references
    prerequisites:
      - cpp/pointers
  - id: cpp/dynamic-memory
    prerequisites:
      - cpp/pointers
---

<!-- mentor:section overview -->
## Обзор
1. Переменные (`cpp/variables`) — Не оценено — available
2. Как устроена память (`cpp/memory-basics`) — Не оценено — blocked by cpp/variables
3. Указатели (`cpp/pointers`) — Не оценено — blocked by cpp/variables, cpp/memory-basics
4. Ссылки (`cpp/references`) — Не оценено — blocked by cpp/pointers
5. Динамическая память (`cpp/dynamic-memory`) — Не оценено — blocked by cpp/pointers
<!-- mentor:end -->

<!-- mentor:section notes -->
## Заметки
<!-- mentor:end -->
