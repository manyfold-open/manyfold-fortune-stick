# AI Fortune Stick Narra Agent (`fortune-stick`)

Files deployed to the Manyfold sandbox for the AI Fortune Stick Narra Messenger agent:

- `AGENTS.md`: Reader persona, Shared Behavioral Standard (4 use cases, `[NO_REPLY]` multi-@ / agent silence, 3-minute group follow-up continuity, per-person trilingual `zh-Hant` / `zh-Hans` / `en` plus `ja` / `ko` / `hi`, crisis safety net, privacy boundaries, command allowlist).
- `fortune.py`: CSPRNG draws across the 36 sticks with pure Traditional (`zh-Hant`), pure Simplified (`zh-Hans` / `zh`), `en`, `ja`, `ko`, and `hi` output.
- `memory.py`: Stdlib SQLite preference memory (`~/.cache/fortune/memory.sqlite3`), scoped strictly by `room_id` (`chat_id`) and optional `user_id` (`sender_id`) with injection and personal-worry filtering.
- `sticks.json`: Exported 36 sticks and localized levels (`src/shared/sticks*.ts`).

## Note on Stick Art (`sticks.zip`)

`sticks.zip` (and unpacked `sticks/*.jpg`) is a binary asset bundle already present in the live Manyfold sandbox (generated from `public/og/`). It is intentionally **not** committed to this repository.

## Running Tests

```bash
python3 -m unittest agent/test_agent.py
```
