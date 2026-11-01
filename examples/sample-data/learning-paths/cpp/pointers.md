---
schema: 1
kind: topic_path
topic: cpp/pointers
goal: Использовать указатели для чтения и изменения значений, в том числе в функциях
created: 2026-10-03
updated: 2026-10-08
next_topics: []
stages:
  - id: why-pointers
    title: Зачем нужны указатели
    goal: Объяснить две задачи, которые решают указатели
    criteria:
      - kind: explanation
        min: 1
        independent: false
    status: done
    started: 2026-10-03
    completed: 2026-10-08
    skip_reason: null
    override_reason: null
  - id: address-of
    title: Оператор &
    goal: Предсказать, что печатает &x и x
    criteria:
      - kind: application
        min: 1
        independent: false
    status: done
    started: 2026-10-08
    completed: 2026-10-08
    skip_reason: null
    override_reason: null
  - id: dereferencing
    title: Разыменование
    goal: Предсказать результат чтения и записи через *p
    criteria:
      - kind: explanation
        min: 1
        independent: false
      - kind: application
        min: 1
        independent: false
    status: active
    started: 2026-10-08
    completed: null
    skip_reason: null
    override_reason: null
  - id: pointers-in-functions
    title: Указатели в функциях
    goal: Написать функцию, меняющую переменную вызывающего
    criteria:
      - kind: application
        min: 1
        independent: false
    status: pending
    started: null
    completed: null
    skip_reason: null
    override_reason: null
  - id: practice
    title: Практика без подсказок
    goal: Решить задачу с указателями самостоятельно
    criteria:
      - kind: application
        min: 1
        independent: true
    status: pending
    started: null
    completed: null
    skip_reason: null
    override_reason: null
---

<!-- mentor:section overview -->
## Обзор
[x] 1. Зачем нужны указатели — Объяснить две задачи, которые решают указатели _(1× explanation)_
[x] 2. Оператор & — Предсказать, что печатает &x и x _(1× application)_
[>] 3. Разыменование — Предсказать результат чтения и записи через *p _(1× explanation, 1× application)_
[ ] 4. Указатели в функциях — Написать функцию, меняющую переменную вызывающего _(1× application)_
[ ] 5. Практика без подсказок — Решить задачу с указателями самостоятельно _(1× application (independent))_
<!-- mentor:end -->

<!-- mentor:section notes -->
## Заметки
<!-- mentor:end -->
