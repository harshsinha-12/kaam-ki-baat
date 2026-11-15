# Kaam Ki Baat colour system

One colour per meaning, used the same way on the landing page, `/team`, `/leader`, the board and the code graph.

| Token | Hex | Means | Used for |
| --- | --- | --- | --- |
| `--left` sky | `#7cc4ff` | Team Memory (LEFT) | agent glyph, focus ring, memory answers |
| `--center` amber | `#f5c451` | Leader Desk (CENTER), and "needs a human" | leader glyph, pending/proposed badges, highlighted graph path |
| `--right` coral | `#ff8a65` | Code Navigator (RIGHT) | code glyph, highlighted code lines |
| `--ok` green | `#6fdc8c` | verified: approved, read back, check on current SHA | confirmed badges |
| `--warn` red | `#ff6b6b` | refused or stale: open PR, old SHA, failed save | strikethroughs, errors |
| `--ink` / `--bg` | `#f2efe6` / `#0b0b0c` | text / canvas | everything else |
| `--mute` | `#9a968c` | provenance, timestamps | sources, SHAs |

Rules: amber always means "a person still has to decide". Green only ever appears after a deterministic check or a read-back. The icon is the three zone colours in one hexagon agent.
