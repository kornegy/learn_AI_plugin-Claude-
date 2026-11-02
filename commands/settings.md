---
description: Show or change Learning Mentor settings (language, explanation style, strictness, reviews, hints, mode)
argument-hint: "[setting value]"
---

Show or change settings. Arguments: $ARGUMENTS

Call `mentor_settings` without arguments to show the current values, and explain each in one line
in the learner's language:

| Setting | Values |
|---|---|
| `language` | `auto` (the learner's language) or a language code such as `ru`, `en` |
| `label_language` | `en`, `ru`: language of level labels and headings in the files |
| `explanation_style` | `analogy-first`, `example-first`, `concept-first` |
| `assessment_strictness` | `lenient`, `standard`, `strict`: how much evidence "Solid" needs |
| `review_intensity` | `light`, `normal`, `intensive`: how often reviews come |
| `assistance_level` | `supportive`, `balanced`, `strict`: how quickly hints are given |
| `learning_mode` | `guided`, `socratic`, `practice`, `exam` |
| `research.auto` | `true`, `false`: research automatically for versioned topics |
| `remove_workspace` | a folder path, to stop mentor mode there |

To change a value, call `mentor_settings` with `set`, e.g. `{"set": {"assistance_level": "strict"}}`,
and confirm what changed.

If the `mentor_*` tools are unavailable, say that the plugin's local server is not running (it needs
Node.js 20 or later on the PATH; see the plugin's README). Don't search the disk for learner files.
