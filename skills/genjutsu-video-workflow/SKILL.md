---
name: "genjutsu-video-workflow"
description: "Run the open-source Genjutsu (TEIN) video subject-replacement workflow: depth + SAM 3 masks or face mesh, Seedance via Enhancor, draft then approved HD, original audio restored."
---

# Genjutsu video subject replacement

Source: https://github.com/sirioberati/Genjustsu-Open-Source-Workflow (MIT). Adapted from its bundled `tein-video-workflow` skill.

## Setup

1. If the project isn't present, clone it: `git clone https://github.com/sirioberati/Genjustsu-Open-Source-Workflow.git`. The project root is the folder containing `workflow.py`; never hardcode machine-specific paths.
2. Read `AGENTS.md` and `docs/AGENT-OPERATIONS.md` before running a job. Consult `docs/ENHANCOR-API.md` for request routing and recovery, and `docs/MEDIA-HOSTING.md` before changing upload providers. For first-time install follow `docs/SETUP-AGENT.md` (Python 3.12+, Rubber Band, cloudflared, `bash setup.sh`; `bash setup-face-mesh.sh` for mesh modes).
3. The user supplies their own `ENHANCOR_API_KEY` and `REPLICATE_API_TOKEN` in `.env`. Never create, guess or print credentials. Never submit paid generations during setup.
4. Launch with `bash start.command` (UI at http://127.0.0.1:8770); check readiness with `.venv/bin/python doctor.py --require-keys`.

## Core rules

- Use `workflow.py` and the local UI; don't reuse prior users' media, subjects or request IDs.
- Carry authorized preparation and collection through to the final preview.
- **Full-clip visual mask QA is mandatory before any generation.** If you cannot inspect the video, ask the user to review it. Fix coverage failures with raw masks and, if needed, original-RGB segmentation; preserve the depth model's colors. Approval is invalid after any artifact change.
- Prepare +3-semitone isolated vocals embedded inside the video (no standalone audio).
- Route an **image** identity reference to Seedance **Edit**; a **video** identity reference to **Omni**.
- Show the user the exact prompt and honor the authorized submission scope. Draft first.
- Restore the entire original soundtrack on return.
- Inspect saved request IDs before retrying; resume retrieval (`workflow.py resume JOB_ID`) instead of duplicating paid requests.
- Ask before HD (`workflow.py resume JOB_ID --hd`) unless explicitly approved already.
- Bound repair attempts to the authorized scope; stop and explain persistent provider or visual failures rather than claiming success.

## Preparation modes

- **Advanced (depth + SAM 3)** — default. Review mask coverage across the full clip.
- **Fast · Face mesh** — `workflow.py prepare VIDEO --mode face_mesh`. No depth/SAM calls. Designed for a single centered speaker; inspect all frames, stop on tracking gaps or misaligned faces. Review facial tracking and audio (don't claim mask review). In the prompt, say mesh lines are motion guidance and must disappear, replace the complete identity including hair, and preserve all dialogue and timing.
- **Advanced + Face mesh** — `workflow.py prepare VIDEO --mode depth_mesh`. Review BOTH mask coverage and face tracking; landmarks saved to `face-landmarks.json`. All artifacts are bound to review approval.

All modes: same references, draft → approved HD → original-audio restoration. Saved artifact hashes gate submission.

## Recovery

```bash
.venv/bin/python workflow.py status LOCAL_JOB_ID
.venv/bin/python workflow.py resume LOCAL_JOB_ID
.venv/bin/python workflow.py resume LOCAL_JOB_ID --hd
```

The server resumes collection on restart but never re-submits. If preparation was interrupted mid remote call, inspect saved prediction metadata; don't blindly restart billed stages. One server/collector per job.